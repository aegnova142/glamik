// ==========================================
// IMAGE VALIDATION
//
// One answer to "is this upload actually an image, and which one", shared by
// every endpoint that accepts a file: the admin media library, product and
// shade imagery, CMS banners, customer avatars and review photos.
//
// Everything here is pure and dependency-free. That is deliberate on both
// counts:
//
//   - Pure, because this module decides whether a file is allowed into
//     storage. A rule that needs a database, a network call or a Cloudinary
//     account to exercise is a rule nobody runs in a test, and an unrun
//     security check is an assumed one. See src/test/mediaupload.e2e.ts.
//   - Dependency-free, because the backend bundle is built by esbuild with an
//     explicit --external allowlist (see package.json). A native module like
//     sharp would have to be added there, shipped to the VPS and kept in step
//     with the Node version. Reading a header is a few dozen bytes of
//     arithmetic; it does not justify that.
//
// THE CORE RULE: the client's filename and its Content-Type are both attacker
// controlled and are never trusted. Only the bytes decide. A payload.exe
// renamed to logo.png and posted as image/png is rejected here, because the
// first two bytes say MZ.
// ==========================================

/** Image formats the pipeline accepts. */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'svg';

/** Video formats the media library accepts (looks, hero clips, review clips). */
export type VideoFormat = 'mp4' | 'webm';

export interface ImageProbe {
  format: ImageFormat;
  /** Absent only for SVG, which has no intrinsic pixel size. */
  width?: number;
  height?: number;
  /** The canonical type to report, independent of what the client claimed. */
  mimeType: string;
}

const IMAGE_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

/**
 * Extensions each format is allowed to carry.
 *
 * Checked so that a file whose bytes and name disagree is refused rather than
 * silently corrected. The bytes are authoritative for *what we store*; the
 * mismatch itself is still worth rejecting, because a legitimate admin upload
 * never has one and a crafted one often does.
 */
const FORMAT_EXTENSIONS: Record<ImageFormat, string[]> = {
  jpeg: ['jpg', 'jpeg', 'jpe', 'jfif'],
  png: ['png'],
  webp: ['webp'],
  avif: ['avif'],
  gif: ['gif'],
  svg: ['svg'],
};

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean => {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
};

const ascii = (buf: Buffer, start: number, end: number): string =>
  buf.length < end ? '' : buf.subarray(start, end).toString('ascii');

// ---------------------------------------------------------------------------
// Per-format header readers
//
// Each returns dimensions, or null when the header is absent/truncated/
// nonsensical. Returning null is how a corrupted file is caught: a .png whose
// signature matches but whose IHDR is garbage never reaches Cloudinary.
// ---------------------------------------------------------------------------

/** PNG: 8-byte signature, then an IHDR chunk whose payload starts at byte 16. */
function readPng(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (ascii(buf, 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * JPEG: walk the marker chain to the first Start-Of-Frame.
 *
 * Dimensions are not at a fixed offset — EXIF, ICC profiles and comments all
 * sit in front of the frame header and vary in size. Walking is the only
 * correct way, and it doubles as a structural check: a truncated or spliced
 * JPEG runs off the end and yields null.
 */
function readJpeg(buf: Buffer): { width: number; height: number } | null {
  let i = 2; // past SOI
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++; // resync past fill bytes rather than giving up
      continue;
    }
    const marker = buf[i + 1];
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / start of scan: no SOF found
    const length = buf.readUInt16BE(i + 2);
    if (length < 2) return null;
    // SOF0..SOF15, excluding DHT (C4), JPG (C8) and DAC (CC) which share the range.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > buf.length) return null;
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

/** GIF: fixed header, logical screen size at bytes 6..9, little-endian. */
function readGif(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 10) return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

/**
 * WebP: a RIFF container with three possible payloads.
 *
 * VP8  — lossy, dimensions are 14-bit fields after the sync code.
 * VP8L — lossless, dimensions are packed bitfields, each stored minus one.
 * VP8X — extended (animation, alpha), dimensions are 24-bit, also minus one.
 */
function readWebp(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  const chunk = ascii(buf, 12, 16);

  if (chunk === 'VP8 ') {
    // 20..22 frame tag, 23..25 sync code 9D 01 2A, then the two 14-bit sizes.
    if (!startsWith(buf, [0x9d, 0x01, 0x2a], 23)) return null;
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (buf[20] !== 0x2f) return null;
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    const read24 = (o: number) => buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }
  return null;
}

/**
 * AVIF/HEIF: ISO base media format. The pixel size lives in an `ispe` box
 * nested several levels deep (meta → iprp → ipco → ispe).
 *
 * Scanned for rather than walked, because a full box-tree walk is a lot of
 * code for one number and the alternatives (nested box offsets varying by
 * encoder) are the part that actually goes wrong. The scan is bounded to the
 * first 64 KB so a large file cannot turn this into a long search, and the
 * values are sanity-checked by the caller.
 */
function readAvif(buf: Buffer): { width: number; height: number } | null {
  const horizon = buf.subarray(0, Math.min(buf.length, 64 * 1024));
  const at = horizon.indexOf('ispe', 0, 'ascii');
  if (at < 0 || at + 16 > horizon.length) return null;
  // 'ispe' + 1 byte version + 3 bytes flags, then width and height.
  return { width: horizon.readUInt32BE(at + 8), height: horizon.readUInt32BE(at + 12) };
}

/**
 * Identifies common non-image types, purely so the admin gets a message that
 * names what they actually picked.
 *
 * This list is NOT the security boundary — the allowlist below is. Anything
 * absent from here and absent from the image signatures is still refused;
 * this only changes "Unsupported image format." into "That looks like a PDF."
 */
function describeNonImage(buf: Buffer): string | null {
  if (startsWith(buf, [0x4d, 0x5a])) return 'a Windows program (.exe/.dll)';
  if (startsWith(buf, [0x7f, 0x45, 0x4c, 0x46])) return 'a Linux executable';
  if (startsWith(buf, [0xca, 0xfe, 0xba, 0xbe])) return 'a compiled program';
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'a PDF';
  // PK.. covers .zip and everything built on it: .docx, .xlsx, .pptx, .jar, .apk
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) {
    return 'a ZIP or Office document';
  }
  if (startsWith(buf, [0x52, 0x61, 0x72, 0x21])) return 'a RAR archive';
  if (startsWith(buf, [0x37, 0x7a, 0xbc, 0xaf])) return 'a 7-Zip archive';
  if (startsWith(buf, [0x1f, 0x8b])) return 'a gzip archive';
  if (startsWith(buf, [0x49, 0x44, 0x33]) || startsWith(buf, [0xff, 0xfb])) return 'an audio file';

  // Text-ish payloads: HTML, scripts and shell. Checked on a decoded prefix so
  // leading whitespace or a BOM doesn't hide them.
  const head = buf.subarray(0, 512).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('#!')) return 'a shell script';
  if (head.startsWith('<?php')) return 'a PHP file';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'an HTML page';
  return null;
}

/** True when the buffer looks like XML/SVG text rather than binary. */
function looksLikeSvg(buf: Buffer): boolean {
  const head = buf.subarray(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  if (!head.startsWith('<')) return false;
  return head.includes('<svg');
}

/**
 * Identifies an image from its bytes and reads its dimensions.
 *
 * Returns null for anything that is not a supported, structurally readable
 * image — the single gate every upload passes through.
 */
export function probeImage(buffer: Buffer): ImageProbe | null {
  if (!buffer || buffer.length < 16) return null;

  let format: ImageFormat | null = null;
  let size: { width: number; height: number } | null = null;

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    format = 'jpeg';
    size = readJpeg(buffer);
  } else if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    format = 'png';
    size = readPng(buffer);
  } else if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') {
    format = 'webp';
    size = readWebp(buffer);
  } else if (ascii(buffer, 0, 6) === 'GIF87a' || ascii(buffer, 0, 6) === 'GIF89a') {
    format = 'gif';
    size = readGif(buffer);
  } else if (ascii(buffer, 4, 8) === 'ftyp') {
    // Only the still-image brands. 'isom'/'mp4 ' are video and are handled by
    // probeVideo — an MP4 must not be able to enter the image pipeline.
    const brand = ascii(buffer, 8, 12).trim().toLowerCase();
    if (['avif', 'avis', 'mif1', 'msf1', 'heic', 'heix', 'hevc', 'heif'].includes(brand)) {
      format = 'avif';
      size = readAvif(buffer);
    }
  } else if (looksLikeSvg(buffer)) {
    // No dimensions: an SVG is resolution-independent by definition.
    return { format: 'svg', mimeType: IMAGE_MIME.svg };
  }

  if (!format) return null;
  if (!size) return null;

  // A zero or absurd dimension means the header parsed but is not describing a
  // real picture. 65535 is the widest a JPEG frame header can even express;
  // anything claiming more is either corrupt or a decompression-bomb attempt.
  if (size.width < 1 || size.height < 1 || size.width > 65535 || size.height > 65535) return null;

  return { format, width: size.width, height: size.height, mimeType: IMAGE_MIME[format] };
}

/**
 * Identifies a video from its bytes.
 *
 * Narrower than the image probe on purpose — videos are not transformed or
 * re-encoded here, so all that is needed is enough confidence to hand the
 * buffer to Cloudinary with resource_type pinned to 'video' rather than
 * 'auto'. Pinning is what stops an unrecognised payload landing as a raw
 * asset that Cloudinary will happily serve back.
 */
export function probeVideo(buffer: Buffer): { format: VideoFormat; mimeType: string } | null {
  if (!buffer || buffer.length < 16) return null;
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return { format: 'webm', mimeType: 'video/webm' };
  if (ascii(buffer, 4, 8) === 'ftyp') {
    const brand = ascii(buffer, 8, 12).trim().toLowerCase();
    // Still-image brands share the container; they belong to probeImage.
    if (['avif', 'avis', 'mif1', 'msf1', 'heic', 'heix', 'heif'].includes(brand)) return null;
    return { format: 'mp4', mimeType: 'video/mp4' };
  }
  return null;
}

/** Lowercased extension from a filename, without the dot. '' when there is none. */
export function extensionOf(filename: string | undefined | null): string {
  if (!filename) return '';
  const base = filename.split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Strips a client-supplied filename down to something safe to store and echo
 * back.
 *
 * The name never reaches the filesystem (uploads are streamed straight to
 * Cloudinary from memory) and never reaches Cloudinary's public_id, so this is
 * not the only thing standing between us and path traversal. It is still done,
 * because the name IS rendered in the admin media library and persisted in the
 * CMS document: `../../etc/passwd` and `<img onerror=...>.png` have no business
 * in either.
 */
export function sanitizeFilename(filename: string | undefined | null): string {
  if (!filename) return 'upload';
  const base = filename.split(/[\\/]/).pop() || 'upload';
  const cleaned = base
    .replace(/[\x00-\x1f\x7f]/g, '') // control characters, incl. the NUL-byte truncation trick
    .replace(/[<>:"|?*]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 180);
  return cleaned || 'upload';
}

// ---------------------------------------------------------------------------
// SVG sanitisation
//
// SVG is XML, and XML in an image slot is a script host. It is accepted here
// only because Glamirk's logo and favicon already are SVGs uploaded through
// this pipeline, and refusing them outright would take a working admin feature
// away (set MEDIA_ALLOW_SVG=false to do exactly that if it is ever not needed).
//
// Two things limit the blast radius before this function even runs: assets are
// served from res.cloudinary.com, a different origin from the app, so script
// executing in one cannot read the app's cookies or DOM; and an <img src>
// pointing at an SVG never executes script at all. The risk is an admin or a
// customer opening the asset URL *directly*, which is a normal thing to do
// from the media library's "open in new tab".
//
// So the dangerous constructs are removed rather than merely discouraged. This
// is a denylist over a regex, which is weaker than a real XML parser — it is a
// second layer behind the cross-origin boundary, not the only one.
// ---------------------------------------------------------------------------

export interface SvgSanitizeResult {
  svg: string;
  /** What was stripped, for the server log. Empty when the file was clean. */
  removed: string[];
}

export function sanitizeSvg(source: string): SvgSanitizeResult {
  const removed: string[] = [];
  let svg = source;

  const strip = (pattern: RegExp, label: string) => {
    if (pattern.test(svg)) {
      // Several patterns share a label (there are three ways to spell an
      // inline event handler); the log wants the category once, not thrice.
      if (!removed.includes(label)) removed.push(label);
      svg = svg.replace(pattern, '');
    }
    // Reset: .test() on a /g regex advances lastIndex, which would make the
    // very next call start mid-string and miss a match.
    pattern.lastIndex = 0;
  };

  // Executable content.
  strip(/<script[\s\S]*?<\/script\s*>/gi, 'script elements');
  strip(/<script[^>]*\/?>/gi, 'script elements');
  // foreignObject embeds arbitrary HTML — including <script> and iframes.
  strip(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, 'foreignObject');
  strip(/<(iframe|embed|object|audio|video|animate|set|handler)[\s\S]*?<\/\1\s*>/gi, 'embedded content');
  strip(/<(iframe|embed|object|animate|set|handler)[^>]*\/?>/gi, 'embedded content');
  // DTDs enable entity expansion (billion laughs) and external entity reads.
  strip(/<!DOCTYPE[\s\S]*?>/gi, 'DOCTYPE/entity declarations');
  strip(/<!ENTITY[\s\S]*?>/gi, 'entity declarations');
  // XML processing instructions can carry a stylesheet reference.
  strip(/<\?xml-stylesheet[\s\S]*?\?>/gi, 'xml-stylesheet');

  // Inline event handlers: onload, onclick, onmouseover, ...
  strip(/\son[a-z]+\s*=\s*"[^"]*"/gi, 'event handlers');
  strip(/\son[a-z]+\s*=\s*'[^']*'/gi, 'event handlers');
  strip(/\son[a-z]+\s*=\s*[^\s>]+/gi, 'event handlers');

  // javascript:/vbscript:/data: URIs in href, xlink:href, src and style.
  // Whitespace and entity encoding between the letters is the usual bypass, so
  // the scheme is matched tolerantly.
  const scriptUri = /(?:javascript|vbscript|livescript|mocha|data)\s*(?::|&#(?:x3a|58);)/gi;
  if (scriptUri.test(svg)) {
    removed.push('script URIs');
    svg = svg.replace(
      /((?:xlink:)?href|src|action|formaction|from|to|values|style)\s*=\s*(["'])([\s\S]*?)\2/gi,
      (match, _attr, _quote, value) => {
        scriptUri.lastIndex = 0;
        return scriptUri.test(String(value)) ? '' : match;
      }
    );
  }
  scriptUri.lastIndex = 0;

  // <use href="https://..."> pulls in a remote document at render time.
  strip(/(?:xlink:)?href\s*=\s*(["'])\s*(?:https?:)?\/\/[^"']*\1/gi, 'remote references');

  return { svg, removed };
}

// ---------------------------------------------------------------------------
// The endpoint-facing validator
// ---------------------------------------------------------------------------

export interface ValidatedUpload {
  kind: 'image' | 'video';
  format: ImageFormat | VideoFormat;
  mimeType: string;
  width?: number;
  height?: number;
  /** For SVG, the sanitised bytes. Identical to the input for every other format. */
  buffer: Buffer;
  /** Non-empty only when SVG sanitisation actually changed something. */
  sanitizedNotes: string[];
}

export interface ValidationFailure {
  /** Admin-facing. Says what to do; never leaks a stack trace or an internal name. */
  message: string;
  /** 413 for "too big", 400 for everything else. */
  status: 400 | 413;
  /** Server-log detail. Not sent to the client. */
  logDetail: string;
}

/**
 * Discriminated on a STRING rather than an `ok: boolean`.
 *
 * The workspace compiles without strictNullChecks (see tsconfig.base.json),
 * and under that setting TypeScript will not narrow a union by a boolean
 * discriminant — `if (!result.ok)` leaves the type untouched and every access
 * to `result.error` is an error. A string tag narrows reliably either way.
 */
export type ValidationOutcome =
  | { outcome: 'accepted'; file: ValidatedUpload }
  | { outcome: 'rejected'; error: ValidationFailure };

export interface ValidateOptions {
  /** 'image' refuses video outright (avatars, product photos, banners). */
  accept: 'image' | 'image-or-video';
  maxImageBytes: number;
  maxVideoBytes: number;
  allowSvg: boolean;
  /** GIF is accepted everywhere by default; avatars opt out. */
  allowGif?: boolean;
}

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/**
 * The single validation path for an uploaded file.
 *
 * Order matters and is: identify from bytes → apply the ceiling for the type
 * the bytes revealed → check the filename agrees → sanitise if SVG. Size is
 * checked *after* identification rather than before, because "maximum image
 * size is 20 MB" is only a truthful message once we know it is an image.
 */
export function validateUpload(
  buffer: Buffer,
  originalName: string | undefined,
  options: ValidateOptions
): ValidationOutcome {
  if (!buffer || buffer.length === 0) {
    return {
      outcome: 'rejected',
      error: { message: 'That file is empty.', status: 400, logDetail: 'zero-length upload' },
    };
  }

  const image = probeImage(buffer);
  const video = options.accept === 'image-or-video' ? probeVideo(buffer) : null;

  if (!image && !video) {
    const guess = describeNonImage(buffer);
    return {
      outcome: 'rejected',
      error: {
        message: guess
          ? `That file looks like ${guess}, not an image. Upload a JPG, PNG, WebP, AVIF or GIF.`
          : 'Invalid or corrupted image. Upload a JPG, PNG, WebP, AVIF or GIF.',
        status: 400,
        logDetail: `unrecognised upload (${guess || 'no known signature'}), name=${sanitizeFilename(originalName)}`,
      },
    };
  }

  if (image) {
    if (image.format === 'svg' && !options.allowSvg) {
      return {
        outcome: 'rejected',
        error: {
          message: 'SVG uploads are turned off. Use a JPG, PNG, WebP or AVIF image instead.',
          status: 400,
          logDetail: 'SVG rejected: MEDIA_ALLOW_SVG=false',
        },
      };
    }
    if (image.format === 'gif' && options.allowGif === false) {
      return {
        outcome: 'rejected',
        error: {
          message: 'Animated GIFs are not supported here. Use a JPG, PNG or WebP image.',
          status: 400,
          logDetail: 'GIF rejected for this endpoint',
        },
      };
    }
    if (buffer.length > options.maxImageBytes) {
      return {
        outcome: 'rejected',
        error: {
          message: `Maximum image size is ${mb(options.maxImageBytes)} MB. This one is ${mb(buffer.length)} MB.`,
          status: 413,
          logDetail: `image over limit: ${buffer.length} > ${options.maxImageBytes}`,
        },
      };
    }

    // The bytes already decided the format; a disagreeing extension still
    // fails, because no honest upload has one.
    const ext = extensionOf(originalName);
    if (ext && !FORMAT_EXTENSIONS[image.format].includes(ext)) {
      return {
        outcome: 'rejected',
        error: {
          message: `This file is named .${ext} but its contents are ${image.format.toUpperCase()}. Re-save it in the right format and try again.`,
          status: 400,
          logDetail: `extension/content mismatch: .${ext} vs ${image.format}`,
        },
      };
    }

    if (image.format === 'svg') {
      const { svg, removed } = sanitizeSvg(buffer.toString('utf8'));
      return {
        outcome: 'accepted',
        file: {
          kind: 'image',
          format: 'svg',
          mimeType: image.mimeType,
          buffer: Buffer.from(svg, 'utf8'),
          sanitizedNotes: removed,
        },
      };
    }

    return {
      outcome: 'accepted',
      file: {
        kind: 'image',
        format: image.format,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        buffer,
        sanitizedNotes: [],
      },
    };
  }

  // Video.
  if (buffer.length > options.maxVideoBytes) {
    return {
      outcome: 'rejected',
      error: {
        message: `Maximum video size is ${mb(options.maxVideoBytes)} MB. This one is ${mb(buffer.length)} MB.`,
        status: 413,
        logDetail: `video over limit: ${buffer.length} > ${options.maxVideoBytes}`,
      },
    };
  }
  return {
    outcome: 'accepted',
    file: {
      kind: 'video',
      format: video!.format,
      mimeType: video!.mimeType,
      buffer,
      sanitizedNotes: [],
    },
  };
}
