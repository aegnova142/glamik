#!/usr/bin/env node
/**
 * Audit every image URL the CMS references and report which ones are dead.
 *
 * Image URLs in `cms_state` can outlive the files behind them: a media-library
 * entry deleted in the admin used to hard-destroy the underlying Cloudinary
 * asset even while products still pointed at it. That hole is closed now, but
 * URLs orphaned before the fix are still in the database, and the only way to
 * know which is to ask.
 *
 * Read-only. It never writes to the database and never deletes anything in
 * Cloudinary — it issues HEAD requests and prints what it finds.
 *
 * Two ways to run it, because the right one depends on where you are:
 *
 *   # Straight at the database (needs DATABASE_URL and outbound :5432)
 *   node database/audit-images.mjs
 *
 *   # Through a running site's public API (no credentials, no :5432)
 *   node database/audit-images.mjs --url https://your-site.com
 *
 * The --url form exists because outbound 5432 is blocked on some networks;
 * the public content endpoint carries the same product and shade image fields.
 * It does NOT see admin-only content (media library, unpublished pages), so
 * prefer the direct form when you can reach the database.
 *
 * Exits 1 when dead images are found, so it can gate a deploy.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CONCURRENCY = 8; // modest: this is someone else's CDN, not a load test
const REQUEST_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { url: null, json: false, all: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') args.url = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------
function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env is fine when --url is used.
  }
}

async function fetchFromDatabase() {
  loadEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString === 'MY_DATABASE_URL') {
    throw new Error(
      'DATABASE_URL is not set. Either set it, or audit a running site with:\n' +
        '  node database/audit-images.mjs --url https://your-site.com'
    );
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  try {
    const { rows } = await client.query('SELECT state FROM cms_state ORDER BY id LIMIT 1');
    if (!rows.length) throw new Error('cms_state is empty — nothing to audit.');
    return rows[0].state;
  } finally {
    await client.end();
  }
}

async function fetchFromApi(baseUrl) {
  const endpoint = new URL('/api/cms/content', baseUrl).toString();
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`GET ${endpoint} returned ${response.status}`);
  }
  const body = await response.json();
  return body?.data ?? body;
}

// ---------------------------------------------------------------------------
// collecting URLs
// ---------------------------------------------------------------------------
const IMAGE_KEY = /(image|images|photo|avatar|icon|thumbnail|banner|swatch|logo|media|url|src)/i;
const IMAGE_URL = /^https?:\/\/\S+$/i;

/**
 * Walk the CMS state and collect every string that looks like an image URL,
 * remembering a human-readable path to each so the report can say *where* a
 * dead image is referenced rather than just that one exists.
 */
function collectUrls(node, path, found, labelHint) {
  if (node == null) return;

  if (typeof node === 'string') {
    if (IMAGE_URL.test(node) && IMAGE_KEY.test(path)) {
      const existing = found.get(node);
      if (existing) existing.refs.push({ path, label: labelHint });
      else found.set(node, { refs: [{ path, label: labelHint }] });
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item, i) => collectUrls(item, `${path}[${i}]`, found, labelHint));
    return;
  }

  if (typeof node === 'object') {
    // Prefer the nearest human-readable name so a dead URL reports as
    // "Glamrik Eyeliner" rather than "products[7].shades[2].images[0]".
    const nextLabel =
      (typeof node.name === 'string' && node.name) ||
      (typeof node.title === 'string' && node.title) ||
      labelHint;

    for (const [key, value] of Object.entries(node)) {
      collectUrls(value, path ? `${path}.${key}` : key, found, nextLabel);
    }
  }
}

// ---------------------------------------------------------------------------
// checking
// ---------------------------------------------------------------------------
async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    // Some hosts refuse HEAD but serve GET happily; a 405 is about the verb,
    // not the resource, so don't report the asset as missing on that basis.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: 'GET', signal: controller.signal });
    }
    return {
      ok: response.ok,
      status: response.status,
      detail: response.headers.get('x-cld-error') || '',
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: error.name === 'AbortError' ? 'timed out' : String(error.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkAll(urls, onProgress) {
  const results = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      results.set(url, await checkUrl(url));
      onProgress(results.size, urls.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(
      [
        'Audit CMS image URLs for dead links. Read-only.',
        '',
        '  node database/audit-images.mjs                      # via DATABASE_URL',
        '  node database/audit-images.mjs --url https://site   # via public API',
        '',
        '  --json   machine-readable output',
        '  --all    list healthy images too, not just broken ones',
      ].join('\n')
    );
    return 0;
  }

  const source = args.url ? `public API at ${args.url}` : 'database (DATABASE_URL)';
  if (!args.json) console.error(`Reading CMS state from ${source} ...`);

  const state = args.url ? await fetchFromApi(args.url) : await fetchFromDatabase();

  const found = new Map();
  collectUrls(state, '', found, null);
  const urls = [...found.keys()];

  if (!urls.length) {
    console.error('No image URLs found in the CMS state.');
    return 0;
  }

  if (!args.json) console.error(`Checking ${urls.length} unique image URLs ...`);
  const results = await checkAll(urls, (done, total) => {
    if (!args.json && done % 10 === 0) process.stderr.write(`  ${done}/${total}\r`);
  });
  if (!args.json) process.stderr.write('\n');

  const broken = [];
  const healthy = [];
  for (const [url, meta] of found) {
    const result = results.get(url);
    (result.ok ? healthy : broken).push({ url, result, refs: meta.refs });
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          source,
          checked: urls.length,
          healthy: healthy.length,
          broken: broken.map((item) => ({
            url: item.url,
            status: item.result.status,
            detail: item.result.detail,
            referencedBy: item.refs,
          })),
        },
        null,
        2
      )
    );
    return broken.length ? 1 : 0;
  }

  console.log('');
  console.log(`  checked ${urls.length}   healthy ${healthy.length}   broken ${broken.length}`);
  console.log('');

  if (broken.length) {
    // Group by the thing a person would go and fix, not by URL.
    const byLabel = new Map();
    for (const item of broken) {
      for (const ref of item.refs) {
        const label = ref.label || '(unnamed)';
        if (!byLabel.has(label)) byLabel.set(label, []);
        byLabel.get(label).push({ ...item, path: ref.path });
      }
    }

    console.log('BROKEN IMAGES');
    console.log('='.repeat(72));
    for (const [label, items] of [...byLabel].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`\n  ${label}`);
      for (const item of items) {
        const status = item.result.status || 'ERR';
        console.log(`    [${status}] ${item.path}`);
        console.log(`           ${item.url}`);
        if (item.result.detail) console.log(`           ${item.result.detail}`);
      }
    }
    console.log('');
    console.log('='.repeat(72));
    console.log(
      '\nThese URLs are still stored in the CMS but the files behind them are gone.\n' +
        'Re-upload each image in the admin (Products / Media Library) to repoint the\n' +
        'field at a live asset. Deleting the Cloudinary asset is not reversible, so\n' +
        'nothing here can be restored automatically.\n'
    );
  } else {
    console.log('Every referenced image resolved. Nothing to fix.\n');
  }

  if (args.all && healthy.length) {
    console.log('HEALTHY');
    for (const item of healthy) console.log(`  [${item.result.status}] ${item.url}`);
    console.log('');
  }

  return broken.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`\nAudit failed: ${error.message}\n`);
    process.exit(2);
  });
