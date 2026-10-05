/**
 * One-time cleanup: remove seed/demo placeholder images from products.
 *
 *   npm run images:cleanup              dry run — reports, writes nothing
 *   APPLY=true npm run images:cleanup   actually writes
 *
 * Context, because the name "cleanup" is vague and this touches the catalogue:
 *
 * The product catalogue ships with demo photographs from a stock-photo host,
 * written into the document by the seed in db.ts. They are placeholders — they
 * are not Glamirk's product photography, and they were never uploaded by an
 * admin. This removes them so that only genuinely uploaded imagery remains.
 *
 * WHAT IS REMOVED is an explicit allowlist of placeholder hosts (PLACEHOLDER_HOSTS
 * below) — NOT "everything that is not Cloudinary". That direction matters: an
 * allowlist fails safe. If someone later points a product at a real CDN, a
 * blocklist-shaped rule would silently wipe it; this one ignores anything it
 * does not recognise.
 *
 * NEVER TOUCHED:
 *   - Cloudinary URLs (res.cloudinary.com) — admin uploads
 *   - any other external http(s) URL
 *   - data: URIs
 *   - any field that is not an image field
 *   - any file on disk. This project stores NO images locally: admin uploads
 *     stream from memory straight to Cloudinary (multer.memoryStorage), and
 *     there is no public/ or uploads/ directory anywhere. So there is nothing
 *     to unlink, and this script deliberately performs no filesystem deletion.
 */
import fs from 'fs';
import path from 'path';
import { pool } from './db';
import { env } from '../config/env';
import { classifyDatabaseTarget, maskConnectionString } from '../config/databaseTarget';
// The one definition of "placeholder", shared with the seed data and the tests
// so the three cannot drift apart.
import { isPlaceholderImage } from '@glamirk/shared/utils/placeholderImages';

const APPLY = process.env.APPLY === 'true';
const ALLOW_PRODUCTION = process.env.ALLOW_PRODUCTION === 'true';

/** The string keys on `product.images`. primary/secondary are required by the
 * type, so they are blanked rather than deleted; the rest are optional and are
 * removed outright. */
const REQUIRED_IMAGE_KEYS = ['primary', 'secondary'];
const OPTIONAL_IMAGE_KEYS = ['detail', 'texture', 'lifestyle', 'swatch'];

interface Hit {
  productId: string;
  productName: string;
  field: string;
  url: string;
}

/**
 * Rewrites one product in place, returning what it removed.
 *
 * Walks only the three places a product image can live. A generic deep walk
 * would be shorter and would also reach fields that merely look like images —
 * this stays explicit so it cannot surprise anyone.
 */
export function cleanProduct(product: any): Hit[] {
  const hits: Hit[] = [];
  const name = product?.name || '(unnamed)';

  if (product?.images && typeof product.images === 'object') {
    for (const key of REQUIRED_IMAGE_KEYS) {
      if (isPlaceholderImage(product.images[key])) {
        hits.push({ productId: product.id, productName: name, field: `images.${key}`, url: product.images[key] });
        product.images[key] = '';
      }
    }
    for (const key of OPTIONAL_IMAGE_KEYS) {
      if (isPlaceholderImage(product.images[key])) {
        hits.push({ productId: product.id, productName: name, field: `images.${key}`, url: product.images[key] });
        delete product.images[key];
      }
    }
  }

  for (const shade of Array.isArray(product?.shades) ? product.shades : []) {
    if (isPlaceholderImage(shade?.swatchImage)) {
      hits.push({ productId: product.id, productName: name, field: `shades[${shade.id}].swatchImage`, url: shade.swatchImage });
      delete shade.swatchImage;
    }
    if (Array.isArray(shade?.images)) {
      const keep = shade.images.filter((img: any) => {
        if (isPlaceholderImage(img?.url)) {
          hits.push({ productId: product.id, productName: name, field: `shades[${shade.id}].images[]`, url: img.url });
          return false;
        }
        return true;
      });
      shade.images = keep;
    }
  }

  return hits;
}

/** Every image URL still on a product after cleaning. */
function remainingImages(product: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v);
  };
  if (product?.images) for (const v of Object.values(product.images)) push(v);
  for (const shade of Array.isArray(product?.shades) ? product.shades : []) {
    push(shade?.swatchImage);
    for (const img of Array.isArray(shade?.images) ? shade.images : []) push(img?.url);
  }
  return out;
}

async function main(): Promise<void> {
  const target = classifyDatabaseTarget(env.databaseUrl);

  console.log('\nSeed/placeholder image cleanup');
  console.log('='.repeat(78));
  console.log(`  target     ${maskConnectionString(env.databaseUrl)}`);
  console.log(`  classified ${target.kind}`);
  console.log(`  mode       ${APPLY ? '*** APPLY — will write ***' : 'DRY RUN — nothing will be written'}`);
  console.log('='.repeat(78));

  // A catalogue-wide rewrite against production needs to be asked for twice,
  // not once. APPLY alone is not enough.
  if (APPLY && target.kind === 'production' && !ALLOW_PRODUCTION) {
    console.error(
      '\nREFUSING TO WRITE.\n\n' +
        'This is a production database and APPLY=true rewrites every product in the\n' +
        'catalogue. If that is genuinely intended, re-run with BOTH:\n\n' +
        '    APPLY=true ALLOW_PRODUCTION=true npm run images:cleanup\n\n' +
        'Run it without APPLY first and read the report.\n'
    );
    await pool.end();
    process.exit(1);
  }

  // Read with a plain SELECT, never loadDatabase(): that function normalises the
  // document on the way through (backfilling missing sections, correcting a
  // couple of product categories), so saving what it returned would commit
  // changes this script never intended to make.
  const res = await pool.query<{ products: any[] }>(
    `SELECT COALESCE(data->'products', '[]'::jsonb) AS products FROM cms_state WHERE id = 'main'`
  );
  if (res.rows.length === 0) {
    console.error('\nNo cms_state row — nothing to do.\n');
    await pool.end();
    process.exit(1);
  }

  const products: any[] = res.rows[0].products || [];
  console.log(`\n  ${products.length} product(s) in the catalogue`);

  // Backup BEFORE anything is modified, including in dry run — the cost is a
  // file, and the alternative is discovering you wanted one after the fact.
  const backupDir = path.resolve(process.cwd(), '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `products-before-image-cleanup-${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(products, null, 2));
  console.log(`  backup     ${path.relative(path.resolve(process.cwd(), '..'), backupFile)}`);

  // Deep clone so the dry-run report is computed without touching the array we
  // would otherwise write back.
  const working: any[] = JSON.parse(JSON.stringify(products));
  const allHits: Hit[] = [];
  const emptied: { id: string; name: string }[] = [];
  const perProduct: { id: string; name: string; removed: number; kept: number }[] = [];

  for (const product of working) {
    const before = remainingImages(product).length;
    const hits = cleanProduct(product);
    const after = remainingImages(product).length;
    allHits.push(...hits);
    perProduct.push({ id: product.id, name: product.name, removed: hits.length, kept: after });
    if (before > 0 && after === 0) emptied.push({ id: product.id, name: product.name });
  }

  // ------------------------------------------
  console.log('\n  Per product');
  console.log('  ' + '-'.repeat(76));
  for (const p of perProduct) {
    const flag = p.removed > 0 && p.kept === 0 ? '  <-- no images left' : '';
    console.log(`    ${String(p.id).slice(0, 38).padEnd(40)} remove ${String(p.removed).padStart(2)}   keep ${String(p.kept).padStart(2)}${flag}`);
  }

  // Unique URLs, because the same placeholder is reused across products — the
  // count of fields changed and the count of distinct images differ.
  const uniqueRemoved = new Set(allHits.map((h) => h.url));
  console.log('\n  Summary');
  console.log('  ' + '-'.repeat(76));
  console.log(`    products to update          ${perProduct.filter((p) => p.removed > 0).length}`);
  console.log(`    image fields to clear       ${allHits.length}`);
  console.log(`    distinct placeholder URLs   ${uniqueRemoved.size}`);
  console.log(`    products left with NO image ${emptied.length}`);
  console.log(`    files to delete from disk   0  (this project stores no local images)`);

  if (emptied.length > 0) {
    console.log('\n    These products will have no image at all afterwards:');
    for (const e of emptied) console.log(`      ${e.id.slice(0, 40).padEnd(42)} ${e.name}`);
  }

  const kept = new Set<string>();
  for (const product of working) for (const url of remainingImages(product)) kept.add(url);
  console.log(`\n    Preserved images (${kept.size}):`);
  for (const url of [...kept].slice(0, 10)) console.log(`      ${url.slice(0, 90)}`);

  if (!APPLY) {
    console.log('\n' + '='.repeat(78));
    console.log('  DRY RUN — nothing was written.');
    console.log('  Re-run with APPLY=true to apply.\n');
    await pool.end();
    process.exit(0);
  }

  // ------------------------------------------
  if (allHits.length === 0) {
    console.log('\n  Nothing to change.\n');
    await pool.end();
    process.exit(0);
  }

  // Written with a targeted jsonb_set so only the products array moves. Every
  // other section of the document — media library, pages, settings, audit log —
  // is left byte-identical, which a whole-document write could not promise.
  await pool.query(`UPDATE cms_state SET data = jsonb_set(data, '{products}', $1::jsonb), updated_at = now() WHERE id = 'main'`, [
    JSON.stringify(working),
  ]);

  const verify = await pool.query<{ n: number }>(
    `SELECT jsonb_array_length(data->'products')::int AS n FROM cms_state WHERE id = 'main'`
  );
  console.log('\n' + '='.repeat(78));
  console.log(`  APPLIED. ${allHits.length} image field(s) cleared across ${perProduct.filter((p) => p.removed > 0).length} product(s).`);
  console.log(`  Catalogue still has ${verify.rows[0].n} product(s) (was ${products.length}).`);
  console.log(`  Backup: ${backupFile}`);
  console.log('\n  The running server caches the CMS document in process, so restart it');
  console.log('  (pm2 restart glamirk-beauty) for the change to show on the site.\n');

  await pool.end();
  process.exit(0);
}

/**
 * Only run when invoked directly.
 *
 * Without this, importing the module to unit-test isPlaceholderImage() would
 * execute the whole cleanup — open a pool, write a backup file and hang. A
 * script whose safety logic cannot be tested without running the script is not
 * one anybody should point at a catalogue.
 */
const invokedDirectly = process.argv[1] ? /cli-cleanup-seed-images/.test(process.argv[1]) : false;

if (invokedDirectly) {
  main().catch(async (err) => {
    console.error('\nCleanup failed:', err?.message || err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
}
