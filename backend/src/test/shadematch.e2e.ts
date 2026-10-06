/**
 * Shade Intelligence — before/after image resolution.
 *
 *   npx tsx src/test/shadematch.e2e.ts
 *
 * No database needed — every assertion is pure. That matters more here than
 * usual: the rule under test decides which photographs a customer sees next
 * to a shade name while deciding whether that shade matches their skin. A
 * cross-mapping bug is invisible (every image is a real face, it is just the
 * wrong one), so it cannot be caught by looking at the page — only by
 * asserting the lookup.
 *
 * Covers:
 *   1. Each undertone resolves to ITS OWN configured images.
 *   2. No input — missing cell, deleted undertone, reordered profiles, stale
 *      selection — can make one shade show another shade's images.
 *   3. Half-configured cells degrade honestly rather than pairing a real
 *      photograph with a stand-in.
 *   4. The coverage report tells an admin exactly which cells are empty.
 *   5. Unusable URLs are caught before they can be saved.
 */
process.env.NODE_ENV = 'test';

import {
  resolveShadeMatch,
  shadeImageCoverage,
  findBrokenShadeImageUrls,
  findSharedShadeImages,
  isUsableImageUrl,
} from '@glamirk/shared/utils/shadeMatch';
import type { CMSShadeFinderTeaser } from '@glamirk/shared/types';

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

const CDN = 'https://res.cloudinary.com/demo/image/upload/v1/glamirk-beauty';

/** Three undertones × two look types, with deliberately distinct image URLs
 * so a cross-mapping shows up as a wrong string rather than a subtle mismatch. */
function teaser(): CMSShadeFinderTeaser {
  return {
    badgeText: 'Shade Intelligence',
    heading: 'Find Your Perfect Match',
    subheading: 'sub',
    description: 'desc',
    ctaText: 'cta',
    profiles: [
      { id: 'warm', label: 'Warm', title: 'Warm & Golden', description: 'warm desc', recommendedLip: 'Spice Velvet', recommendedSindoor: 'Scarlet', swatchHexes: ['#C9972B'], visual: `${CDN}/warm-visual.jpg` },
      { id: 'cool', label: 'Cool', title: 'Cool & Roseate', description: 'cool desc', recommendedLip: 'Plum', recommendedSindoor: 'Maroon', swatchHexes: ['#9B2D4F'], visual: `${CDN}/cool-visual.jpg` },
      { id: 'neutral', label: 'Neutral', title: 'Balanced Neutral', description: 'neutral desc', recommendedLip: 'Rose', recommendedSindoor: 'Crimson', swatchHexes: ['#F05A7E'], visual: `${CDN}/neutral-visual.jpg` },
    ],
    lookTypes: [
      { id: 'lip-shade', name: 'Lip Shade', sortOrder: 0, isActive: true },
      { id: 'sindoor-shade', name: 'Sindoor Shade', sortOrder: 1, isActive: true },
    ],
    configs: [
      { undertoneId: 'warm', lookTypeId: 'lip-shade', beforeImage: `${CDN}/warm-lip-before.jpg`, afterImage: `${CDN}/warm-lip-after.jpg`, isActive: true },
      { undertoneId: 'warm', lookTypeId: 'sindoor-shade', beforeImage: `${CDN}/warm-sindoor-before.jpg`, afterImage: `${CDN}/warm-sindoor-after.jpg`, isActive: true },
      { undertoneId: 'cool', lookTypeId: 'lip-shade', beforeImage: `${CDN}/cool-lip-before.jpg`, afterImage: `${CDN}/cool-lip-after.jpg`, isActive: true },
      // 'neutral' has a cell with only an AFTER image.
      { undertoneId: 'neutral', lookTypeId: 'lip-shade', afterImage: `${CDN}/neutral-lip-after.jpg`, isActive: true },
      // 'cool' × 'sindoor-shade' has no cell at all.
    ],
  };
}

async function run(): Promise<void> {
  const t = teaser();

  // ========================================
  section('1. Each shade resolves to its own configured images');

  const warmLip = resolveShadeMatch(t, 'warm', 'lip-shade');
  check('warm × lip resolves', !!warmLip);
  check('...before is the warm lip before', warmLip?.beforeImage === `${CDN}/warm-lip-before.jpg`, warmLip?.beforeImage);
  check('...after is the warm lip after', warmLip?.afterImage === `${CDN}/warm-lip-after.jpg`, warmLip?.afterImage);
  check('...and it is reported as a complete pair', warmLip?.hasConfiguredPair === true);

  const warmSindoor = resolveShadeMatch(t, 'warm', 'sindoor-shade');
  check(
    'the same undertone with a different look type gets DIFFERENT images',
    warmSindoor?.beforeImage === `${CDN}/warm-sindoor-before.jpg` && warmSindoor?.beforeImage !== warmLip?.beforeImage,
    warmSindoor?.beforeImage
  );

  const coolLip = resolveShadeMatch(t, 'cool', 'lip-shade');
  check('cool × lip gets the cool images', coolLip?.beforeImage === `${CDN}/cool-lip-before.jpg`, coolLip?.beforeImage);

  // ========================================
  section('2. No input can make one shade show another shade\'s images');

  // The headline guarantee, asserted exhaustively rather than by example.
  const everyOutcome = ['warm', 'cool', 'neutral', 'does-not-exist', '', 'WARM']
    .flatMap((u) => ['lip-shade', 'sindoor-shade', 'no-such-look', ''].map((l) => ({ u, l, r: resolveShadeMatch(t, u, l) })));

  const leaks = everyOutcome.filter(({ u, r }) => {
    if (!r) return false;
    const imgs = [r.beforeImage, r.afterImage].filter(Boolean) as string[];
    // Every image handed back must belong to the undertone that was asked for.
    return imgs.some((img) => !img.includes(`/${u}-`));
  });
  check(
    `no combination leaks another shade's image (${everyOutcome.length} combinations)`,
    leaks.length === 0,
    leaks.map((x) => `${x.u}/${x.l} -> ${x.r?.beforeImage} ${x.r?.afterImage}`).join(' | ')
  );

  check('an unknown undertone id resolves to null, not to profiles[0]', resolveShadeMatch(t, 'does-not-exist', 'lip-shade') === null);
  check('an empty undertone id resolves to null', resolveShadeMatch(t, '', 'lip-shade') === null);
  check('the id match is case-sensitive (no accidental aliasing)', resolveShadeMatch(t, 'WARM', 'lip-shade') === null);
  check('a null teaser resolves to null', resolveShadeMatch(null, 'warm', 'lip-shade') === null);
  check('an empty teaser resolves to null', resolveShadeMatch({ ...t, profiles: [] }, 'warm', 'lip-shade') === null);

  // Reordering the admin's profile list must not re-point anyone's images:
  // cells are addressed by id pair, never by array position.
  const reordered: CMSShadeFinderTeaser = { ...t, profiles: [...t.profiles].reverse() };
  const warmAfterReorder = resolveShadeMatch(reordered, 'warm', 'lip-shade');
  check(
    'reordering the undertone list does not change which images warm gets',
    warmAfterReorder?.beforeImage === warmLip?.beforeImage && warmAfterReorder?.afterImage === warmLip?.afterImage
  );

  // Same for reordering the matrix itself.
  const shuffledConfigs: CMSShadeFinderTeaser = { ...t, configs: [...(t.configs || [])].reverse() };
  check(
    'reordering the matrix does not change which images cool gets',
    resolveShadeMatch(shuffledConfigs, 'cool', 'lip-shade')?.beforeImage === `${CDN}/cool-lip-before.jpg`
  );

  // ========================================
  section('3. Missing and half-configured cells degrade honestly');

  // No cell at all for cool × sindoor: falls back to COOL's own visual, never
  // to warm's, and is surfaced as a single image rather than a fake slider.
  const coolSindoor = resolveShadeMatch(t, 'cool', 'sindoor-shade');
  check('an unconfigured cell still resolves the profile', !!coolSindoor);
  check('...and falls back to that undertone\'s OWN visual', coolSindoor?.afterImage === `${CDN}/cool-visual.jpg`, coolSindoor?.afterImage);
  check('...with no before, so no bogus comparison is shown', coolSindoor?.beforeImage === undefined, coolSindoor?.beforeImage);
  check('...and is not reported as a configured pair', coolSindoor?.hasConfiguredPair === false);
  check('...and never reaches for another shade', coolSindoor?.afterImage?.includes('warm') === false);

  // Half-configured: an after but no before. The real image is kept; the
  // missing side stays undefined rather than being filled with the profile
  // visual, which would present a stand-in as if it were the "before" photo.
  const neutralLip = resolveShadeMatch(t, 'neutral', 'lip-shade');
  check('a cell with only an after keeps that after', neutralLip?.afterImage === `${CDN}/neutral-lip-after.jpg`, neutralLip?.afterImage);
  check('...and leaves before undefined rather than substituting', neutralLip?.beforeImage === undefined, neutralLip?.beforeImage);
  check('...and is not reported as a complete pair', neutralLip?.hasConfiguredPair === false);

  // A deactivated cell is treated as absent, not as content.
  const deactivated: CMSShadeFinderTeaser = {
    ...t,
    configs: (t.configs || []).map((c) => (c.undertoneId === 'warm' && c.lookTypeId === 'lip-shade' ? { ...c, isActive: false } : c)),
  };
  const warmHidden = resolveShadeMatch(deactivated, 'warm', 'lip-shade');
  check('a hidden cell falls back to the profile visual', warmHidden?.afterImage === `${CDN}/warm-visual.jpg`, warmHidden?.afterImage);
  check('...which is still warm\'s own image', warmHidden?.afterImage?.includes('warm') === true);

  // A blank string is not an image.
  const blanked: CMSShadeFinderTeaser = {
    ...t,
    configs: (t.configs || []).map((c) => (c.undertoneId === 'warm' && c.lookTypeId === 'lip-shade' ? { ...c, beforeImage: '   ', afterImage: '' } : c)),
  };
  const warmBlank = resolveShadeMatch(blanked, 'warm', 'lip-shade');
  check('whitespace-only URLs count as unconfigured', warmBlank?.afterImage === `${CDN}/warm-visual.jpg`, warmBlank?.afterImage);

  // ========================================
  section('4. Copy falls back per-field without crossing shades');

  check('match title falls back to this profile\'s title', coolSindoor?.matchTitle === 'Cool & Roseate Match', coolSindoor?.matchTitle);
  check('description falls back to this profile\'s description', coolSindoor?.matchDescription === 'cool desc');
  check('primary falls back to this profile\'s lip', coolSindoor?.primary === 'Plum');
  check('swatches fall back to this profile\'s swatches', coolSindoor?.swatches.join() === '#9B2D4F', coolSindoor?.swatches.join());
  check('labels default to Before/After', coolSindoor?.beforeLabel === 'Before' && coolSindoor?.afterLabel === 'After');

  // ========================================
  section('5. Coverage report');

  const cov = shadeImageCoverage(t);
  check('every active cell is counted (3 undertones × 2 looks)', cov.total === 6, String(cov.total));
  check('complete cells counted', cov.complete === 3, String(cov.complete));
  check('partial cells counted', cov.partial === 1, String(cov.partial));
  check('empty cells counted', cov.missing === 2, String(cov.missing));

  const neutralCell = cov.cells.find((c) => c.undertoneId === 'neutral' && c.lookTypeId === 'lip-shade');
  check('the half-configured cell reports before missing', neutralCell?.hasBefore === false);
  check('...and after present', neutralCell?.hasAfter === true);
  check('...and is flagged partial', neutralCell?.partial === true);

  const coolSindoorCell = cov.cells.find((c) => c.undertoneId === 'cool' && c.lookTypeId === 'sindoor-shade');
  check('a cell with no config at all reports both missing', coolSindoorCell?.hasBefore === false && coolSindoorCell?.hasAfter === false);

  check('cells are grouped per undertone', cov.byUndertone.length === 3, String(cov.byUndertone.length));
  check('...in the admin\'s own order', cov.byUndertone[0].undertoneId === 'warm', cov.byUndertone[0].undertoneId);

  // A hidden look type is not a gap anyone needs to chase.
  const withHiddenLook: CMSShadeFinderTeaser = {
    ...t,
    lookTypes: (t.lookTypes || []).map((l) => (l.id === 'sindoor-shade' ? { ...l, isActive: false } : l)),
  };
  check('a deactivated look type drops out of coverage', shadeImageCoverage(withHiddenLook).total === 3, String(shadeImageCoverage(withHiddenLook).total));
  check('an empty teaser reports zero cells', shadeImageCoverage(null).total === 0);

  // ========================================
  section('5b. Shared-image detection (the seeded-placeholder case)');

  check('distinct per-shade images raise no warning', findSharedShadeImages(t).length === 0, JSON.stringify(findSharedShadeImages(t)));

  // Exactly the shape a freshly seeded store ships: one stand-in "before"
  // across every undertone, which a slot-counting coverage report would call
  // fully configured.
  const seeded: CMSShadeFinderTeaser = {
    ...t,
    configs: [
      { undertoneId: 'warm', lookTypeId: 'lip-shade', beforeImage: `${CDN}/stand-in.jpg`, afterImage: `${CDN}/warm-visual.jpg`, isActive: true },
      { undertoneId: 'cool', lookTypeId: 'lip-shade', beforeImage: `${CDN}/stand-in.jpg`, afterImage: `${CDN}/cool-visual.jpg`, isActive: true },
      { undertoneId: 'neutral', lookTypeId: 'lip-shade', beforeImage: `${CDN}/stand-in.jpg`, afterImage: `${CDN}/neutral-visual.jpg`, isActive: true },
    ],
  };
  const shared = findSharedShadeImages(seeded);
  check('a stand-in before shared by 3 undertones is reported', shared.length === 1, JSON.stringify(shared));
  check('...named as the Before side', shared[0]?.side === 'Before', shared[0]?.side);
  check('...listing every undertone sharing it', shared[0]?.undertones.length === 3, shared[0]?.undertones.join());
  check('...in display order', shared[0]?.undertones[0] === 'Warm & Golden', shared[0]?.undertones[0]);
  check('...while the distinct afters raise nothing', shared.filter((s) => s.side === 'After').length === 0);
  check('coverage still calls those cells complete (slots ARE filled)', shadeImageCoverage(seeded).complete === 3, String(shadeImageCoverage(seeded).complete));

  // Reuse WITHIN one undertone is legitimate and must stay quiet.
  const reusedWithinOneShade: CMSShadeFinderTeaser = {
    ...t,
    configs: [
      { undertoneId: 'warm', lookTypeId: 'lip-shade', beforeImage: `${CDN}/warm-b.jpg`, afterImage: `${CDN}/warm-a.jpg`, isActive: true },
      { undertoneId: 'warm', lookTypeId: 'sindoor-shade', beforeImage: `${CDN}/warm-b.jpg`, afterImage: `${CDN}/warm-a.jpg`, isActive: true },
    ],
  };
  check('one undertone reusing its own photo across look types is fine', findSharedShadeImages(reusedWithinOneShade).length === 0);

  // ========================================
  section('6. URL validation');

  check('a Cloudinary URL is usable', isUsableImageUrl(`${CDN}/x.jpg`));
  check('a root-relative path is usable', isUsableImageUrl('/images/legacy.jpg'));
  check('an external CDN is usable', isUsableImageUrl('https://cdn.example.test/a.png'));
  check('a data:image URI is usable', isUsableImageUrl('data:image/png;base64,iVBORw0KGgo='));

  check('an empty string is not', !isUsableImageUrl(''));
  check('whitespace is not', !isUsableImageUrl('   '));
  check('a bare word is not', !isUsableImageUrl('upload-me-later'));
  check('a lone slash is not', !isUsableImageUrl('/'));
  check('a hostless URL is not', !isUsableImageUrl('https://'));
  check('a host with no dot is not', !isUsableImageUrl('https://localhost'));
  check('a javascript: URI is not', !isUsableImageUrl('javascript:alert(1)'));
  check('a data:text URI is not', !isUsableImageUrl('data:text/html,<script>alert(1)</script>'));
  check('a file: URI is not', !isUsableImageUrl('file:///etc/passwd'));
  check('undefined is not', !isUsableImageUrl(undefined));
  check('a number is not', !isUsableImageUrl(42 as unknown));

  // ========================================
  section('7. Save validation names the offending field');

  check('a clean teaser has nothing to report', findBrokenShadeImageUrls(t).length === 0, findBrokenShadeImageUrls(t).join('; '));
  check('unset fields are not errors', findBrokenShadeImageUrls({ ...t, configs: [{ undertoneId: 'warm', lookTypeId: 'lip-shade', isActive: true }] }).length === 0);

  const dirty: CMSShadeFinderTeaser = {
    ...t,
    configs: (t.configs || []).map((c) => (c.undertoneId === 'warm' && c.lookTypeId === 'lip-shade' ? { ...c, beforeImage: 'not a url' } : c)),
  };
  const problems = findBrokenShadeImageUrls(dirty);
  check('a garbage URL is caught', problems.length === 1, problems.join('; '));
  check('...and the message names the shade', problems[0]?.includes('Warm & Golden'), problems[0]);
  check('...the look type', problems[0]?.includes('Lip Shade'), problems[0]);
  check('...and which side', problems[0]?.includes('Before Image'), problems[0]);

  const badVisual = findBrokenShadeImageUrls({ ...t, profiles: t.profiles.map((p) => (p.id === 'cool' ? { ...p, visual: 'oops' } : p)) });
  check('a broken profile visual is caught too', badVisual.length === 1 && badVisual[0].includes('Cool & Roseate'), badVisual.join('; '));

  const badIcon = findBrokenShadeImageUrls({ ...t, lookTypes: (t.lookTypes || []).map((l) => ({ ...l, iconUrl: 'javascript:alert(1)' })) });
  check('a script URI in an option icon is caught', badIcon.length === 2, badIcon.join('; '));

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
