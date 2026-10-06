// ==========================================
// CLOUDINARY DELIVERY
//
// Turns a stored image URL into a device-appropriate, CDN-optimised one at
// render time.
//
// Glamirk stores exactly one URL per image slot — the full-size original
// Cloudinary returned on upload. That is deliberate and is not changed here:
// the original stays the source of truth so any future crop, re-size or
// format can still be derived from it. What was missing was the last step —
// every surface was serving that original at full resolution to every device,
// so a 2400px product photo was downloaded in full to fill a 150px cart
// thumbnail.
//
// This module is the missing step, and it is a pure URL transform:
//
//   https://res.cloudinary.com/<cloud>/image/upload/v123/glamirk-beauty/x.jpg
//   → .../image/upload/f_auto,q_auto:good,w_600,c_limit/v123/glamirk-beauty/x.jpg
//
// WHY A URL TRANSFORM AND NOT STORED VARIANTS: Cloudinary generates and
// caches each variant on first request and serves it from the CDN forever
// after. Deriving the URL means no migration, no extra columns, no upload-time
// work, and — critically — old records that only ever had a plain `imageUrl`
// get responsive delivery with no change to the data at all.
//
// THREE RULES THIS MODULE MUST KEEP:
//
//   1. Anything that is not a plain Cloudinary image upload comes back
//      BYTE-IDENTICAL. Relative paths, data: URIs, Unsplash seed images, a
//      future CDN, video URLs, already-transformed URLs — all passed through.
//      This is what makes the whole thing backward compatible: a URL it does
//      not understand is a URL it does not touch.
//   2. The output is DETERMINISTIC. The same input and preset always produce
//      the same string, so the browser cache, the CDN edge cache and React's
//      reconciliation all see a stable URL across renders. Nothing here may
//      ever incorporate a timestamp, a random value or a viewport reading.
//   3. c_limit, always, unless a call site explicitly asks otherwise. It
//      scales DOWN to fit the box and leaves anything already smaller alone,
//      preserving the aspect ratio in both cases. A product photo is never
//      upscaled into blur and never stretched.
// ==========================================

export type CloudinaryQuality = 'auto' | 'auto:best' | 'auto:good' | 'auto:eco' | 'auto:low' | number;

export interface CloudinaryOptions {
  /** Target width in CSS pixels. Omitted means "don't resize". */
  width?: number;
  /** Optional height bound. With c_limit this is a box, not a crop. */
  height?: number;
  /**
   * q_auto tier. Cloudinary picks a per-image quality within the tier rather
   * than applying one fixed compression level to every picture.
   *
   * 'auto:good' is the default and is visually lossless for photography.
   * 'auto:best' is for anything colour-critical — see COLOR_CRITICAL below.
   */
  quality?: CloudinaryQuality;
  /**
   * 'limit' (default) — fit inside the box, never upscale, keep the ratio.
   * 'fill'  — cover the box exactly, cropping the overflow. Only for slots
   *           with a fixed aspect ratio that must not letterbox.
   * 'fit'   — fit inside the box, upscaling if the source is smaller.
   */
  crop?: 'limit' | 'fill' | 'fit';
  /** Where to crop from when crop is 'fill'. 'auto' uses content detection. */
  gravity?: 'auto' | 'center' | 'face';
}

/**
 * Named delivery contexts.
 *
 * Presets rather than call-site numbers so that "what width is a product
 * card" has one answer, and so a later change to that answer is one edit.
 */
export const IMAGE_PRESETS = {
  /** Cart lines, media-library tiles, tiny avatars. */
  thumb: { width: 300, quality: 'auto:good' },
  /** Product cards in a grid or carousel. */
  card: { width: 600, quality: 'auto:good' },
  /** The main product gallery image. */
  gallery: { width: 900, quality: 'auto:best' },
  /** Full-bleed product detail / zoom. */
  detail: { width: 1400, quality: 'auto:best' },
  /** Hero and full-width campaign banners. */
  hero: { width: 1920, quality: 'auto:good' },
  /** Category tiles and editorial cards. */
  tile: { width: 800, quality: 'auto:good' },
  /** Profile photos. */
  avatar: { width: 200, quality: 'auto:good' },
  /**
   * The site logo and wordmark.
   *
   * Narrow, but on the best quality tier: a logo is hard edges and lettering,
   * which is exactly what shows compression ringing first — and it is the one
   * image on the page a visitor sees on every single view. Note that an SVG
   * logo never reaches this preset at all; the transform passes SVG through
   * untouched rather than rasterising it.
   */
  logo: { width: 440, quality: 'auto:best' },
} as const satisfies Record<string, CloudinaryOptions>;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

/**
 * Quality tier for slots where colour fidelity outranks file size.
 *
 * A foundation swatch that compresses to a *slightly* different beige is a
 * returned order, not a cosmetic nitpick — the whole point of the swatch is
 * that the customer is matching it against their own skin. Same for lipstick
 * shades and packaging shots where brand colour and small printed text have to
 * survive. These get q_auto:best, which costs bandwidth and avoids the
 * banding and hue-shift that aggressive chroma subsampling produces.
 */
export const COLOR_CRITICAL: CloudinaryQuality = 'auto:best';

/** Widths offered to the browser in a srcset. Chosen to cover phone → 2x desktop. */
export const RESPONSIVE_WIDTHS = [320, 480, 640, 828, 1080, 1400, 1920];

const UPLOAD_MARKER = '/image/upload/';

/**
 * Does a path segment look like a Cloudinary transformation?
 *
 * Transformations are comma-separated `key_value` pairs (`w_600,f_auto`).
 * Version markers (`v1712345678`) and public IDs are not, and a public ID with
 * an underscore in it (`hero_banner.jpg`) must not be mistaken for one — hence
 * the requirement that every comma-separated part match, and that the segment
 * carry no file extension.
 */
function isTransformationSegment(segment: string): boolean {
  if (!segment || /^v\d+$/.test(segment)) return false;
  if (segment.includes('.')) return false;
  return segment.split(',').every((part) => /^[a-z]{1,3}_[A-Za-z0-9_.:%-]+$/.test(part));
}

/**
 * Is this a plain, untransformed Cloudinary image upload?
 *
 * Returns null — meaning "pass the URL through untouched" — for everything
 * else. Each rejection below is protecting something specific.
 */
function parseCloudinaryUrl(url: string): { prefix: string; rest: string } | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Not absolute: a relative path, a data: URI, or a blob: from a local
  // file-picker preview. None of those are ours to rewrite.
  if (!/^https?:\/\//i.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  // Exact host or subdomain. A substring test would match
  // `res.cloudinary.com.example.test`, which is someone else's server.
  const host = parsed.hostname.toLowerCase();
  if (host !== 'res.cloudinary.com' && !host.endsWith('.res.cloudinary.com')) return null;

  // /video/upload/ and /image/fetch/ are different delivery pipelines with
  // different valid transformations. Only owned image uploads are rewritten.
  const at = parsed.pathname.indexOf(UPLOAD_MARKER);
  if (at < 0) return null;

  const rest = parsed.pathname.slice(at + UPLOAD_MARKER.length);
  if (!rest) return null;

  // SVG is resolution-independent and f_auto would rasterise it. The site
  // logo and favicon are SVGs; delivering a blurry PNG of the logo would be a
  // visible regression, so they are left exactly as stored.
  if (/\.svg$/i.test(rest)) return null;

  // A URL that already carries a transformation was written that way on
  // purpose (by Cloudinary's own API, by an admin pasting a crafted URL, or by
  // an earlier pass of this function). Chaining another transform on top would
  // re-process an already-processed image. Idempotence matters more than
  // squeezing out the last few bytes.
  if (isTransformationSegment(rest.split('/')[0])) return null;

  return {
    prefix: `${parsed.origin}${parsed.pathname.slice(0, at + UPLOAD_MARKER.length)}`,
    rest: rest + parsed.search,
  };
}

/**
 * Builds the transformation component.
 *
 * f_auto — content negotiation. Cloudinary serves AVIF to browsers that
 *          accept it, WebP to the rest, and the original format to anything
 *          older. One URL, the best format each client can actually decode.
 * q_auto — per-image quality selection rather than a fixed compression level.
 * c_limit — see rule 3 at the top of this file.
 */
function buildTransform(options: CloudinaryOptions): string {
  const parts = ['f_auto', `q_${options.quality ?? 'auto:good'}`];
  const crop = options.crop ?? 'limit';
  if (options.width) parts.push(`w_${Math.round(options.width)}`);
  if (options.height) parts.push(`h_${Math.round(options.height)}`);
  if (options.width || options.height) {
    parts.push(`c_${crop}`);
    if (crop === 'fill') parts.push(`g_${options.gravity ?? 'auto'}`);
  }
  return parts.join(',');
}

const resolvePreset = (options: CloudinaryOptions | ImagePreset): CloudinaryOptions =>
  typeof options === 'string' ? IMAGE_PRESETS[options] : options;

/**
 * The main entry point: an optimised delivery URL for a stored image.
 *
 * Safe to call on ANY string, including undefined/null/''. Anything it cannot
 * confidently rewrite is returned exactly as given.
 */
export function cloudinaryImageUrl(
  url: string | undefined | null,
  options: CloudinaryOptions | ImagePreset = 'card'
): string {
  const original = url ?? '';
  const parsed = parseCloudinaryUrl(original);
  if (!parsed) return original;
  return `${parsed.prefix}${buildTransform(resolvePreset(options))}/${parsed.rest}`;
}

/**
 * A `srcset` string, so the browser picks the width it actually needs.
 *
 * Returns '' for anything not rewritable, which is the correct value to pass
 * to an <img srcset> — the attribute is then simply omitted and `src` is used
 * on its own, exactly as it behaves today for legacy and external URLs.
 *
 * Candidate widths above the preset's own width are dropped: offering a 1920px
 * variant of an image that is only ever displayed at 600px invites the browser
 * to download it on a high-DPR phone for no visible gain.
 */
export function cloudinarySrcSet(
  url: string | undefined | null,
  options: CloudinaryOptions | ImagePreset = 'card'
): string {
  if (!parseCloudinaryUrl(url ?? '')) return '';

  const resolved = resolvePreset(options);
  const ceiling = resolved.width ?? RESPONSIVE_WIDTHS[RESPONSIVE_WIDTHS.length - 1];

  const widths = RESPONSIVE_WIDTHS.filter((w) => w <= ceiling);
  // Always offer the exact preset width too, so there is a real candidate at
  // the display size rather than the browser rounding down to the step below.
  if (!widths.includes(ceiling)) widths.push(ceiling);

  return widths.map((w) => `${cloudinaryImageUrl(url, { ...resolved, width: w })} ${w}w`).join(', ');
}

/** A reasonable `sizes` when the call site hasn't specified one. */
function defaultSizes(options: CloudinaryOptions | ImagePreset): string {
  const width = resolvePreset(options).width;
  if (!width) return '100vw';
  // Below the layout width the image is effectively full-bleed; above it, it
  // is capped at its own intrinsic display width.
  return `(max-width: ${width}px) 100vw, ${width}px`;
}

/**
 * Everything an <img> needs for responsive delivery, in one call.
 *
 * `sizes` tells the browser how wide the image will be laid out *before* CSS
 * has run, which is what it needs in order to choose from the srcset. Without
 * it the browser assumes 100vw and over-fetches on every grid.
 */
export function responsiveImage(
  url: string | undefined | null,
  options: CloudinaryOptions | ImagePreset = 'card',
  sizes?: string
): { src: string; srcSet?: string; sizes?: string } {
  const src = cloudinaryImageUrl(url, options);
  const srcSet = cloudinarySrcSet(url, options);
  if (!srcSet) return { src };
  return { src, srcSet, sizes: sizes || defaultSizes(options) };
}
