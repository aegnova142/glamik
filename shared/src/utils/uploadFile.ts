/**
 * Browser-side checks that run before an admin upload is sent. A courtesy
 * only — the server re-derives the real format from the bytes and decides.
 * Shared (rather than living in the admin hook) so the rules are testable.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

/**
 * The file's type: what the browser reported, or — when it reported nothing,
 * which some Windows setups do for perfectly valid .webp/.jfif/.mov files —
 * what its extension says. Without the fallback those files were refused as
 * "not an image" before ever reaching the server.
 */
export function effectiveMimeType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  return MIME_BY_EXTENSION[extensionOf(file.name)] || '';
}

/** iPhone photos default to HEIC/HEIF, which browsers cannot display. */
export function isHeicFile(file: { name: string; type: string }): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /^(heic|heif)$/.test(extensionOf(file.name));
}

export const HEIC_HELP =
  'This is an iPhone HEIC photo, which websites cannot display. Export it as JPG first (Photos → Share → Save as JPEG), or set iPhone Settings → Camera → Formats → "Most Compatible".';
