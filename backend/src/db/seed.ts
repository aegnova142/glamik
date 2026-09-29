import type { Pool } from 'pg';
import { getInitialDatabase } from './db';

// ==========================================
// SEEDING
//
// Populates cms_state with Glamirk's default content graph — the catalog,
// categories, hero, footer, journal, FAQs, looks and settings that a brand new
// store starts from. The data itself lives in @glamirk/shared/data, because
// the storefront and admin also fall back to it when the CMS has not loaded.
//
// This already happens implicitly on first boot (loadDatabase seeds an empty
// database). This module makes it explicit and runnable on demand, which is
// what "rebuild from zero" needs.
// ==========================================

const STATE_ROW_ID = 'main';

export interface SeedResult {
  seeded: boolean;
  reason: string;
  products: number;
}

/**
 * Writes the default content graph.
 *
 * Idempotent by default: if cms_state already holds content it is left alone,
 * because overwriting it would destroy real admin edits on a live store.
 * `force: true` is the explicit opt-in to replace it.
 */
export async function seedDatabase(pool: Pool, options: { force?: boolean; silent?: boolean } = {}): Promise<SeedResult> {
  const log = (msg: string) => {
    if (!options.silent) console.log(`[seed] ${msg}`);
  };

  const existing = await pool.query('SELECT data FROM cms_state WHERE id = $1', [STATE_ROW_ID]);
  const hasContent = existing.rows.length > 0 && !!existing.rows[0].data;

  if (hasContent && !options.force) {
    const current = existing.rows[0].data;
    const count = Array.isArray(current?.products) ? current.products.length : 0;
    log(`cms_state already populated (${count} products) — leaving it untouched. Pass --force to overwrite.`);
    return { seeded: false, reason: 'already-populated', products: count };
  }

  const initial = getInitialDatabase();
  await pool.query(
    `INSERT INTO cms_state (id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [STATE_ROW_ID, JSON.stringify(initial)]
  );

  const reason = hasContent ? 'overwritten (--force)' : 'fresh database';
  log(`seeded cms_state — ${initial.products.length} products, ${initial.categories.length} categories (${reason})`);
  return { seeded: true, reason, products: initial.products.length };
}
