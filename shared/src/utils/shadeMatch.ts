// ==========================================
// SHADE INTELLIGENCE — MATCH RESOLUTION
//
// One answer to "which before/after images belong to this undertone and this
// look type", shared by the storefront section that renders them and the
// admin screen that reports which cells are still missing them.
//
// The data model already existed and is unchanged: shadeFinderTeaser holds
// `profiles` (undertones), `lookTypes`, and a `configs` matrix whose cells are
// addressed by the pair (undertoneId, lookTypeId). This module is the lookup
// over it, extracted out of the component so the one rule that actually
// matters can be tested without rendering anything.
//
// THE RULE THIS EXISTS TO ENFORCE: a shade never displays another shade's
// photographs. Not when its own images are missing, not when the selected id
// no longer exists, not while the CMS is mid-reload. A customer comparing a
// foundation against their own skin is making a purchase decision from these
// two pictures; showing them Cool & Roseate's face under a "Warm & Golden"
// heading is worse than showing them nothing, because nothing is obviously
// nothing and the wrong face is invisibly wrong.
//
// So every fallback here is either (a) an image belonging to the SAME
// undertone, or (b) no image at all. There is deliberately no path that
// reaches for `profiles[0]` or "the first configured cell" to fill a gap.
// ==========================================

import type {
  CMSShadeFinderTeaser,
  CMSShadeLookType,
  CMSShadeMatchConfig,
  CMSShadeUndertoneProfile,
} from '../types';

/**
 * Is this a URL we are willing to put in an <img src>?
 *
 * Deliberately permissive about WHERE the image lives — Cloudinary, a legacy
 * relative path, and some future CDN are all fine — and strict about the
 * shapes that are never a picture: an empty string, a bare placeholder an
 * admin half-typed, or a `javascript:`/`data:text` URI.
 *
 * Used both to decide what counts as "configured" for the coverage report and
 * to refuse the save outright, so the admin finds out at the point of saving
 * rather than by looking at the live site.
 */
export function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;

  // Protocol-relative and root-relative paths are legitimate; a bare word is
  // almost always a half-finished edit.
  if (url.startsWith('/')) return url.length > 1;

  const lower = url.toLowerCase();
  // Script-bearing and non-image URI schemes have no business in an image slot.
  if (/^(javascript|vbscript|file|about):/.test(lower)) return false;
  if (lower.startsWith('data:')) return lower.startsWith('data:image/');

  if (!/^https?:\/\//.test(lower)) return false;
  try {
    const parsed = new URL(url);
    // "https://" alone parses, but has no host to fetch from.
    return !!parsed.hostname && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

export interface ResolvedShadeMatch {
  /** The undertone actually resolved, or null when the id matched nothing. */
  profile: CMSShadeUndertoneProfile | null;
  /** The matrix cell for this exact pair, or null when none is configured. */
  config: CMSShadeMatchConfig | null;
  matchTitle: string;
  matchDescription: string;
  primaryLabel: string;
  primary: string;
  secondaryLabel: string;
  secondary: string;
  /**
   * Undefined rather than a substitute when this side has no usable image.
   *
   * BeforeAfterSlider already degrades correctly on an absent side — it drops
   * the divider and shows the remaining image full-frame — so handing it
   * `undefined` produces an honest "here is the one photo we have" instead of
   * a comparison between a real photograph and a stand-in.
   */
  beforeImage?: string;
  afterImage?: string;
  beforeLabel: string;
  afterLabel: string;
  visualTitle: string;
  swatches: string[];
  /** True when both sides came from the admin-configured cell. */
  hasConfiguredPair: boolean;
}

/**
 * Resolves everything the "Find Your Perfect Match" card needs for one
 * (undertone, look type) selection.
 *
 * Returns `profile: null` when the undertone id matches nothing. Callers must
 * treat that as "render nothing", NOT as "render the first profile" — that
 * substitution is the exact cross-shade bug this module exists to prevent,
 * and it is why the caller is made to handle the null rather than being
 * handed a silently-wrong default.
 */
export function resolveShadeMatch(
  teaser: CMSShadeFinderTeaser | null | undefined,
  undertoneId: string,
  lookTypeId: string
): ResolvedShadeMatch | null {
  const profiles = teaser?.profiles || [];
  const profile = profiles.find((p) => p.id === undertoneId) || null;
  if (!profile) return null;

  // Both ids must match. A cell is addressed by the pair, never by position
  // in the array — reordering undertones in the admin must not re-point
  // anyone's photographs at a different shade.
  const config =
    (teaser?.configs || []).find(
      (c) => c.undertoneId === profile.id && c.lookTypeId === lookTypeId && c.isActive !== false
    ) || null;

  const cellBefore = isUsableImageUrl(config?.beforeImage) ? config!.beforeImage!.trim() : undefined;
  const cellAfter = isUsableImageUrl(config?.afterImage) ? config!.afterImage!.trim() : undefined;

  // When the cell configures NEITHER side, fall back to this undertone's own
  // profile visual — its own image, so still never another shade's. It is
  // surfaced as the "after" with no "before", because presenting the same
  // picture on both sides of a slider is a comparison that shows nothing
  // while implying there is something to see.
  const profileVisual = isUsableImageUrl(profile.visual) ? profile.visual.trim() : undefined;
  const noCellImages = !cellBefore && !cellAfter;

  return {
    profile,
    config,
    matchTitle: config?.matchTitle?.trim() || `${profile.title} Match`,
    matchDescription: config?.matchDescription?.trim() || profile.description,
    primaryLabel: config?.primaryLabel?.trim() || 'Lip',
    primary: config?.primary?.trim() || profile.recommendedLip,
    secondaryLabel: config?.secondaryLabel?.trim() || 'Sindoor',
    secondary: config?.secondary?.trim() || profile.recommendedSindoor,
    beforeImage: noCellImages ? undefined : cellBefore,
    afterImage: noCellImages ? profileVisual : cellAfter,
    beforeLabel: config?.beforeLabel?.trim() || 'Before',
    afterLabel: config?.afterLabel?.trim() || 'After',
    visualTitle: config?.visualTitle?.trim() || `${profile.title} Spectrum`,
    swatches: ((config?.swatches || []).map((s) => s.color).filter(Boolean).length
      ? config!.swatches!.map((s) => s.color)
      : profile.swatchHexes || []
    ).filter(Boolean),
    hasConfiguredPair: !!cellBefore && !!cellAfter,
  };
}

// ---------------------------------------------------------------------------
// Coverage reporting (admin)
// ---------------------------------------------------------------------------

export interface ShadeCoverageCell {
  undertoneId: string;
  undertoneTitle: string;
  lookTypeId: string;
  lookTypeName: string;
  hasBefore: boolean;
  hasAfter: boolean;
  /** Both present — the cell shows a real before/after comparison. */
  complete: boolean;
  /** Exactly one present — a half-configured cell, the easiest thing to miss. */
  partial: boolean;
  /** The cell exists but is switched off; it is not a gap to chase. */
  hidden: boolean;
}

export interface ShadeCoverageReport {
  cells: ShadeCoverageCell[];
  /** Grouped per undertone, in the order the admin has them arranged. */
  byUndertone: { undertoneId: string; undertoneTitle: string; cells: ShadeCoverageCell[] }[];
  total: number;
  complete: number;
  partial: number;
  missing: number;
}

/**
 * Which undertone × look-type cells still have no imagery.
 *
 * Only ACTIVE look types are counted: a hidden option is not a gap an admin
 * needs to chase, and counting it would make the coverage number permanently
 * red for no reason.
 */
export function shadeImageCoverage(teaser: CMSShadeFinderTeaser | null | undefined): ShadeCoverageReport {
  const profiles = teaser?.profiles || [];
  const lookTypes = (teaser?.lookTypes || [])
    .filter((l: CMSShadeLookType) => l.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const configs = teaser?.configs || [];

  const byUndertone = profiles.map((p) => {
    const cells = lookTypes.map((lt) => {
      const cfg = configs.find((c) => c.undertoneId === p.id && c.lookTypeId === lt.id);
      const hasBefore = isUsableImageUrl(cfg?.beforeImage);
      const hasAfter = isUsableImageUrl(cfg?.afterImage);
      return {
        undertoneId: p.id,
        undertoneTitle: p.title,
        lookTypeId: lt.id,
        lookTypeName: lt.name,
        hasBefore,
        hasAfter,
        complete: hasBefore && hasAfter,
        partial: hasBefore !== hasAfter,
        hidden: !!cfg && cfg.isActive === false,
      };
    });
    return { undertoneId: p.id, undertoneTitle: p.title, cells };
  });

  const cells = byUndertone.flatMap((g) => g.cells);
  return {
    cells,
    byUndertone,
    total: cells.length,
    complete: cells.filter((c) => c.complete).length,
    partial: cells.filter((c) => c.partial).length,
    missing: cells.filter((c) => !c.hasBefore && !c.hasAfter).length,
  };
}

/**
 * Images that more than one UNDERTONE is using.
 *
 * Not an error, and deliberately not blocked — reusing one photograph across
 * two look types of the same undertone is a reasonable thing to do, and is
 * why this only reports reuse ACROSS undertones.
 *
 * It exists because a freshly seeded store ships the same stand-in "before"
 * photo in all sixteen cells, and the coverage report would otherwise call
 * that a complete, fully-configured matrix. It is complete in the sense that
 * every slot is filled; it is not complete in the sense anyone means, because
 * four different undertones are showing the same face. This is the signal
 * that tells an admin the difference.
 */
export interface SharedShadeImage {
  url: string;
  side: 'Before' | 'After';
  /** Titles of the undertones sharing it, in display order. */
  undertones: string[];
}

export function findSharedShadeImages(teaser: CMSShadeFinderTeaser | null | undefined): SharedShadeImage[] {
  const profiles = teaser?.profiles || [];
  const configs = teaser?.configs || [];
  const titleOf = (id: string) => profiles.find((p) => p.id === id)?.title || id;

  const out: SharedShadeImage[] = [];
  for (const side of ['Before', 'After'] as const) {
    const key = side === 'Before' ? 'beforeImage' : 'afterImage';
    const byUrl = new Map<string, Set<string>>();
    for (const c of configs) {
      const url = c[key];
      if (!isUsableImageUrl(url)) continue;
      const trimmed = url.trim();
      if (!byUrl.has(trimmed)) byUrl.set(trimmed, new Set());
      byUrl.get(trimmed)!.add(c.undertoneId);
    }
    for (const [url, undertoneIds] of byUrl) {
      if (undertoneIds.size < 2) continue;
      out.push({
        url,
        side,
        undertones: profiles.filter((p) => undertoneIds.has(p.id)).map((p) => p.title),
      });
    }
  }
  return out;
}

/**
 * Every image URL in the teaser that is set but unusable.
 *
 * Returned as human-readable locations so the admin is told WHICH field is
 * wrong, rather than being handed a generic "invalid data" refusal and left
 * to hunt through a 16-cell matrix for it.
 *
 * An EMPTY field is not an error — it means "not configured yet", which is a
 * legitimate state the coverage report already surfaces. Only a field someone
 * has actually put a non-URL into is rejected.
 */
export function findBrokenShadeImageUrls(teaser: CMSShadeFinderTeaser | null | undefined): string[] {
  if (!teaser) return [];
  const problems: string[] = [];

  const check = (value: unknown, where: string) => {
    if (typeof value !== 'string' || !value.trim()) return; // unset is fine
    if (!isUsableImageUrl(value)) problems.push(where);
  };

  for (const p of teaser.profiles || []) {
    check(p.visual, `Undertone "${p.title}" → Right-Column Visual`);
  }
  for (const lt of teaser.lookTypes || []) {
    check(lt.iconUrl, `Option "${lt.name}" → Icon`);
  }
  for (const c of teaser.configs || []) {
    const profile = (teaser.profiles || []).find((p) => p.id === c.undertoneId);
    const look = (teaser.lookTypes || []).find((l) => l.id === c.lookTypeId);
    const label = `${profile?.title || c.undertoneId} × ${look?.name || c.lookTypeId}`;
    check(c.beforeImage, `${label} → Before Image`);
    check(c.afterImage, `${label} → After Image`);
  }
  return problems;
}
