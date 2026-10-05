// ==========================================
// PLACEHOLDER IMAGE CLASSIFICATION
//
// One definition of "this image is a demo placeholder, not real product
// photography", shared by everything that acts on that judgement: the
// images:cleanup CLI that strips them from a live catalogue, the seed data
// that must not reintroduce them, and the tests for both.
//
// Kept here rather than inside the CLI so the rule can be tested without
// opening a database connection, and so the seed and the cleanup can never
// drift into disagreeing about what counts as a placeholder.
// ==========================================

/**
 * Hosts whose images are demo placeholders.
 *
 * This is an ALLOWLIST of things to remove, deliberately — not a blocklist of
 * things to keep. The difference matters: a rule shaped as "delete anything
 * that is not Cloudinary" would silently wipe a real CDN the day someone
 * introduces one. This only ever touches hosts it already knows about, so an
 * unfamiliar URL is left alone by default.
 */
export const PLACEHOLDER_IMAGE_HOSTS = [
  'unsplash.com',
  'images.unsplash.com',
  'source.unsplash.com',
  'placehold.co',
  'via.placeholder.com',
  'placekitten.com',
  'picsum.photos',
];

/**
 * Hosts that must survive regardless of the list above.
 *
 * Checked first. Redundant while the two lists are disjoint, which is the
 * point — it is here so that a careless future addition to the placeholder
 * list cannot delete real uploads.
 */
export const PROTECTED_IMAGE_HOSTS = ['res.cloudinary.com', 'cloudinary.com'];

/** Exact host or subdomain match. Substring matching would accept
 * `images.unsplash.com.evil.test`, which is a different site entirely. */
function hostMatches(host: string, list: string[]): boolean {
  return list.some((entry) => host === entry || host.endsWith('.' + entry));
}

/**
 * True only for a recognised placeholder host.
 *
 * Returns false for Cloudinary, for any other external CDN, for data: URIs,
 * for relative or root-relative paths, and for anything that is not a parseable
 * absolute URL — all of which are left untouched.
 */
export function isPlaceholderImage(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  let host: string;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    // Not an absolute URL — a relative path, a data: URI without a host, or
    // junk. None of those are ours to remove.
    return false;
  }

  if (hostMatches(host, PROTECTED_IMAGE_HOSTS)) return false;
  return hostMatches(host, PLACEHOLDER_IMAGE_HOSTS);
}
