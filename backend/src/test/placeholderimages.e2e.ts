/**
 * Placeholder-image classification and seed cleanliness.
 *
 *   npx tsx src/test/placeholderimages.e2e.ts
 *
 * No database needed — every assertion here is pure. That is deliberate: the
 * rule being tested decides whether a product's photography gets deleted, so it
 * must be verifiable without arranging a database first, or it will not be
 * verified at all.
 *
 * Covers three questions:
 *   1. Does the seed still carry demo placeholders? (it must not)
 *   2. Does the rule keep Cloudinary uploads? (it must)
 *   3. Does the rule keep images from hosts it has never heard of? (it must —
 *      the rule is an allowlist of things to delete, not a blocklist of things
 *      to keep, and that distinction is the whole safety argument)
 */
// Pinned before any import — mailer.ts will not open an SMTP connection under
// NODE_ENV=test. See checkout.e2e.ts for why that matters.
process.env.NODE_ENV = 'test';

import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import {
  isPlaceholderImage,
  PLACEHOLDER_IMAGE_HOSTS,
  PROTECTED_IMAGE_HOSTS,
} from '@glamirk/shared/utils/placeholderImages';
import { cleanProduct } from '../db/cli-cleanup-seed-images';

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

/** Every image string reachable on a product, wherever it lives. */
function imagesOf(product: any): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = [];
  for (const [k, v] of Object.entries(product?.images || {})) {
    if (typeof v === 'string' && v.trim()) out.push({ field: `images.${k}`, value: v });
  }
  for (const shade of Array.isArray(product?.shades) ? product.shades : []) {
    if (typeof shade?.swatchImage === 'string' && shade.swatchImage.trim()) {
      out.push({ field: `shades[${shade.id}].swatchImage`, value: shade.swatchImage });
    }
    for (const img of Array.isArray(shade?.images) ? shade.images : []) {
      if (typeof img?.url === 'string' && img.url.trim()) out.push({ field: `shades[${shade.id}].images[]`, value: img.url });
    }
  }
  return out;
}

function run(): void {
  // ========================================
  section('1. Classification — what gets removed');
  // ========================================

  check('an unsplash CDN image is a placeholder', isPlaceholderImage('https://images.unsplash.com/photo-1586495777744.jpg'));
  check('the unsplash apex domain too', isPlaceholderImage('https://unsplash.com/photos/abc.jpg'));
  check('source.unsplash.com too', isPlaceholderImage('https://source.unsplash.com/800x600'));
  check('placehold.co is a placeholder', isPlaceholderImage('https://placehold.co/600x400'));
  check('picsum.photos is a placeholder', isPlaceholderImage('https://picsum.photos/200'));

  // ========================================
  section('2. Classification — what must survive');
  // ========================================

  check('a Cloudinary upload is kept', !isPlaceholderImage('https://res.cloudinary.com/emu1kahg/image/upload/v1/x.jpg'));
  check('any cloudinary.com subdomain is kept', !isPlaceholderImage('https://foo.cloudinary.com/x.jpg'));

  // The point of an allowlist: a host nobody anticipated is left alone.
  check('an unknown CDN is kept', !isPlaceholderImage('https://cdn.glamirk.com/products/hero.jpg'));
  check('an S3 bucket is kept', !isPlaceholderImage('https://my-bucket.s3.amazonaws.com/a.jpg'));
  check('an arbitrary external host is kept', !isPlaceholderImage('https://images.example.com/real-photo.jpg'));
  check('a photographer\'s own site is kept', !isPlaceholderImage('https://studio.photographer.co.uk/glamirk/01.jpg'));

  check('a data: URI is kept', !isPlaceholderImage('data:image/png;base64,iVBORw0KGgo='));
  check('a root-relative path is kept', !isPlaceholderImage('/images/local.jpg'));
  check('a relative path is kept', !isPlaceholderImage('assets/thing.png'));
  check('an empty string is not a placeholder', !isPlaceholderImage(''));
  check('whitespace is not a placeholder', !isPlaceholderImage('   '));
  check('undefined is not a placeholder', !isPlaceholderImage(undefined));
  check('null is not a placeholder', !isPlaceholderImage(null));
  check('a non-string is not a placeholder', !isPlaceholderImage({ url: 'https://images.unsplash.com/x.jpg' }));

  // Host matching must be exact-or-subdomain. Substring matching would treat
  // a completely different registrable domain as unsplash.
  check('a lookalike suffix domain is NOT a placeholder', !isPlaceholderImage('https://images.unsplash.com.evil.test/x.jpg'));
  check('a lookalike prefix domain is NOT a placeholder', !isPlaceholderImage('https://notunsplash.com/x.jpg'));
  check('a host merely containing the word is NOT a placeholder', !isPlaceholderImage('https://my-unsplash-mirror.net/x.jpg'));

  // ========================================
  section('3. The two lists cannot overlap');
  // ========================================

  const overlap = PLACEHOLDER_IMAGE_HOSTS.filter((h) => PROTECTED_IMAGE_HOSTS.includes(h));
  check('no host is both placeholder and protected', overlap.length === 0, overlap.join(', '));
  check('cloudinary is in the protected list', PROTECTED_IMAGE_HOSTS.includes('res.cloudinary.com'));

  // ========================================
  section('4. Seed data carries no placeholders');
  // ========================================

  check('the seed has products', GLAMIRK_PRODUCTS.length > 0, String(GLAMIRK_PRODUCTS.length));

  const offenders: string[] = [];
  for (const product of GLAMIRK_PRODUCTS as any[]) {
    for (const { field, value } of imagesOf(product)) {
      if (isPlaceholderImage(value)) offenders.push(`${product.id} ${field} = ${value.slice(0, 50)}`);
    }
  }
  check('no product in the seed references a placeholder image', offenders.length === 0, offenders.slice(0, 3).join(' | '));

  // Guards the specific regression: the seed used to carry 22 unsplash URLs,
  // and a careless revert or a new product copied from an old one would bring
  // them back.
  const seedJson = JSON.stringify(GLAMIRK_PRODUCTS);
  check('the literal string "images.unsplash.com" is gone from the seed', !seedJson.includes('images.unsplash.com'));
  check('no unsplash host of any form remains', !/unsplash\.com/i.test(seedJson));

  // The Product type requires primary/secondary, so they must still exist as
  // strings rather than having been deleted outright.
  let shapeOk = true;
  for (const product of GLAMIRK_PRODUCTS as any[]) {
    if (typeof product?.images?.primary !== 'string' || typeof product?.images?.secondary !== 'string') shapeOk = false;
  }
  check('every product still has string primary/secondary (type stays valid)', shapeOk);

  // ========================================
  section('5. cleanProduct removes only placeholders');
  // ========================================

  // One product carrying all three kinds at once — the case that actually
  // matters, and the one a blocklist-shaped rule would get wrong.
  const mixed: any = {
    id: 'p-mixed',
    name: 'Mixed',
    images: {
      primary: 'https://res.cloudinary.com/demo/image/upload/real.jpg',
      secondary: 'https://images.unsplash.com/photo-placeholder.jpg',
      detail: 'https://cdn.glamirk.com/products/detail.jpg',
      texture: 'https://images.unsplash.com/photo-texture.jpg',
      lifestyle: '/local/path.jpg',
    },
    shades: [
      {
        id: 's1',
        swatchImage: 'https://images.unsplash.com/swatch.jpg',
        images: [
          { id: 'i1', url: 'https://res.cloudinary.com/demo/a.jpg', sortOrder: 0, isPrimary: true },
          { id: 'i2', url: 'https://images.unsplash.com/b.jpg', sortOrder: 1, isPrimary: false },
          { id: 'i3', url: 'https://cdn.glamirk.com/c.jpg', sortOrder: 2, isPrimary: false },
        ],
      },
    ],
  };

  const hits = cleanProduct(mixed);
  check('removed exactly the 4 placeholder references', hits.length === 4, String(hits.length));

  check('the Cloudinary primary is untouched', mixed.images.primary === 'https://res.cloudinary.com/demo/image/upload/real.jpg');
  check('the unsplash secondary is blanked (required key)', mixed.images.secondary === '');
  check('the unknown CDN detail is untouched', mixed.images.detail === 'https://cdn.glamirk.com/products/detail.jpg');
  check('the unsplash texture is deleted (optional key)', !('texture' in mixed.images));
  check('the local path lifestyle is untouched', mixed.images.lifestyle === '/local/path.jpg');
  check('the unsplash swatchImage is deleted', !('swatchImage' in mixed.shades[0]));

  const urls = mixed.shades[0].images.map((i: any) => i.url);
  check('the Cloudinary variant image survives', urls.includes('https://res.cloudinary.com/demo/a.jpg'));
  check('the unknown-CDN variant image survives', urls.includes('https://cdn.glamirk.com/c.jpg'));
  check('the unsplash variant image is gone', !urls.some((u: string) => u.includes('unsplash')));
  check('exactly 2 variant images remain', mixed.shades[0].images.length === 2, String(mixed.shades[0].images.length));

  // Running it twice must change nothing further.
  const second = cleanProduct(mixed);
  check('a second pass removes nothing (idempotent)', second.length === 0, String(second.length));

  // A product with nothing to clean must come back untouched.
  const clean: any = { id: 'p-clean', name: 'Clean', images: { primary: 'https://res.cloudinary.com/x/a.jpg', secondary: '' }, shades: [] };
  const before = JSON.stringify(clean);
  const noHits = cleanProduct(clean);
  check('a clean product yields no hits', noHits.length === 0);
  check('...and is not mutated at all', JSON.stringify(clean) === before);

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
