import type { PoolClient } from 'pg';
import { pool } from '../db/db';
import { env } from '../config/env';

// ==========================================
// SQL INVENTORY
//
// Stock as real rows with real locks, replacing read-modify-write on a JSONB
// document guarded by one global mutex.
//
// Two properties this module exists to provide:
//
//   1. Per-unit concurrency. Locking is per inventory row, so two customers
//      buying different products never wait on each other — where the old
//      advisory lock serialised every checkout in the store.
//
//   2. Reservations that expire. Stock can be held for an unpaid order and
//      automatically released, which a bare counter cannot express.
//
// Every mutation runs inside one transaction: BEGIN → SELECT ... FOR UPDATE →
// validate → UPDATE → log → COMMIT, and ROLLBACK on anything unexpected. No
// path here mutates a counter without writing the matching
// inventory_transactions row in the same transaction, so the log can never
// disagree with the balance.
// ==========================================

export type InventoryOperation = 'RESERVE' | 'RELEASE' | 'COMMIT' | 'RESTOCK' | 'ADJUST' | 'MIGRATE';

export interface InventoryUnit {
  id: string;
  productId: string;
  variantId: string | null;
  sizeLabel: string | null;
  availableStock: number;
  reservedStock: number;
  soldStock: number;
  lowStockThreshold: number;
}

export interface StockLine {
  productId: string;
  variantId?: string | null;
  sizeLabel?: string | null;
  quantity: number;
}

export interface InventoryResult {
  ok: boolean;
  error?: string;
  /** Set when the failure was insufficient stock, so the caller can tell the
   * customer how many are actually left rather than a bare refusal. */
  availableStock?: number;
  productId?: string;
}

/** Whether SQL inventory is authoritative. Off by default: the legacy JSONB
 * document keeps gating every sale until this is deliberately switched on. */
export function sqlInventoryEnabled(): boolean {
  return env.inventory.sqlMode;
}

export interface InventoryWriteTargets {
  /** Write to the SQL inventory tables. */
  sql: boolean;
  /** Write to the legacy cms_state JSONB document. */
  legacy: boolean;
  /** Whether SQL decides what may be sold. When false, a SQL write failure is
   * reported but must never block a sale legacy has already authorised. */
  sqlAuthoritative: boolean;
}

/**
 * Which stores a mutation must write to.
 *
 * The two flags mean different things, and conflating them was the bug:
 *
 *   SQL_MODE  — which system is AUTHORITATIVE for reads and for deciding
 *               whether a sale may proceed.
 *   MIRROR    — whether BOTH systems are written.
 *
 * Previously SQL was only ever written when it was authoritative, so with
 * SQL_MODE=false the SQL side received nothing: new orders deducted legacy
 * only, cancellations restocked legacy only, and reservations for cancelled
 * orders stayed ACTIVE forever. The two stores drifted on ordinary trading,
 * and the drift grew for as long as the cutover was deferred.
 *
 *   SQL_MODE  MIRROR   legacy   SQL
 *   false     true     write    write     <- mirror while legacy still decides
 *   true      true     write    write     <- mirror while SQL decides
 *   true      false    -        write     <- SQL only, post-cutover
 *   false     false    write    -         <- legacy only, pre-migration
 */
export function inventoryWriteTargets(): InventoryWriteTargets {
  const sqlMode = sqlInventoryEnabled();
  const mirror = env.inventory.mirrorLegacy;
  return {
    sql: sqlMode || mirror,
    legacy: !sqlMode || mirror,
    sqlAuthoritative: sqlMode,
  };
}

// ------------------------------------------
// Unit resolution
// ------------------------------------------

/**
 * Finds the inventory row that *gates* a sale of this line, mirroring
 * getCurrentStock's fallback chain exactly:
 *
 *     (product, variant, size) → (product, variant) → (product)
 *
 * The most specific row that exists wins. A shade or size with no row of its
 * own is one that defined no stock number in the legacy document, and legacy
 * code fell back outward for it — so this must too, or a sale would suddenly
 * start being gated by a number nothing previously consulted.
 *
 * Returns null only when the product has no inventory at all, which means it
 * is absent from the catalogue.
 */
async function resolveGatingUnit(
  client: PoolClient,
  line: StockLine,
  forUpdate: boolean
): Promise<InventoryUnit | null> {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const variantId = line.variantId || null;
  const sizeLabel = line.sizeLabel || null;

  // Ordered most-specific first; the first hit is the gating unit. Done as
  // three targeted lookups rather than one clever query so the fallback order
  // is explicit and matches the legacy chain line for line.
  const candidates: [string | null, string | null][] = [
    [variantId, sizeLabel],
    [variantId, null],
    [null, null],
  ];

  for (const [v, s] of candidates) {
    // Skip a candidate identical to one already tried (e.g. a line with no
    // variant makes the first two candidates the same lookup).
    const res = await client.query(
      `SELECT * FROM inventory
       WHERE product_id = $1
         AND variant_id IS NOT DISTINCT FROM $2
         AND size_label IS NOT DISTINCT FROM $3${lock}`,
      [line.productId, v, s]
    );
    if (res.rows.length > 0) return mapUnit(res.rows[0]);
  }
  return null;
}

/**
 * The rows a mutation must touch.
 *
 * The legacy write path is a CASCADE, not a single update: it always adjusts
 * the product-level pool, and additionally adjusts the most specific level
 * when that level defines its own number. Reproducing that is what keeps the
 * two systems agreeing during the dual-write window.
 *
 * Returned sorted by id. That ordering is load-bearing: when two concurrent
 * transactions lock overlapping sets of rows, locking them in a consistent
 * order is what turns a potential deadlock into one transaction simply
 * waiting for the other.
 */
async function resolveCascadeUnits(client: PoolClient, line: StockLine): Promise<InventoryUnit[]> {
  const gating = await resolveGatingUnit(client, line, false);
  if (!gating) return [];

  const ids = new Set<string>([gating.id]);

  const poolRow = await client.query(
    `SELECT id FROM inventory WHERE product_id = $1 AND variant_id IS NULL AND size_label IS NULL`,
    [line.productId]
  );
  if (poolRow.rows[0]) ids.add(poolRow.rows[0].id);

  const locked = await client.query(
    `SELECT * FROM inventory WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`,
    [[...ids]]
  );
  return locked.rows.map(mapUnit);
}

function mapUnit(row: any): InventoryUnit {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    sizeLabel: row.size_label,
    availableStock: Number(row.available_stock),
    reservedStock: Number(row.reserved_stock),
    soldStock: Number(row.sold_stock),
    lowStockThreshold: Number(row.low_stock_threshold),
  };
}

// ------------------------------------------
// Transaction log
// ------------------------------------------

async function logTransaction(
  client: PoolClient,
  input: {
    unit: InventoryUnit;
    operation: InventoryOperation;
    quantity: number;
    next: { available: number; reserved: number; sold: number };
    orderId?: string | null;
    reservationId?: string | null;
    actor?: string | null;
    reason?: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO inventory_transactions
       (id, inventory_id, product_id, variant_id, size_label, operation, quantity,
        previous_available, new_available, previous_reserved, new_reserved,
        previous_sold, new_sold, order_id, reservation_id, actor, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      'invtx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
      input.unit.id,
      input.unit.productId,
      input.unit.variantId,
      input.unit.sizeLabel,
      input.operation,
      input.quantity,
      input.unit.availableStock,
      input.next.available,
      input.unit.reservedStock,
      input.next.reserved,
      input.unit.soldStock,
      input.next.sold,
      input.orderId || null,
      input.reservationId || null,
      input.actor || 'system',
      input.reason || null,
    ]
  );
}

/** Quantities are never taken on trust: a negative or fractional quantity
 * would corrupt every counter it touched. */
function validQuantity(quantity: unknown): boolean {
  return Number.isInteger(quantity) && (quantity as number) > 0;
}

// ------------------------------------------
// Reads
// ------------------------------------------

/**
 * Sellable units for one line.
 *
 * A single indexed query against three candidate rows — not a load of the
 * entire catalogue document, which is what every stock check used to cost.
 */
export async function getAvailableStock(line: Omit<StockLine, 'quantity'>): Promise<number> {
  const client = await pool.connect();
  try {
    const unit = await resolveGatingUnit(client, { ...line, quantity: 1 }, false);
    return unit ? unit.availableStock : 0;
  } finally {
    client.release();
  }
}

/**
 * The sellable count for a line, from whichever system is currently
 * authoritative.
 *
 * One call site shape for both modes, so the flag is honoured consistently and
 * no caller has to remember to branch. `legacyStock` is what getCurrentStock
 * returned from the JSONB document — evaluated by the caller either way, since
 * the product object is already in hand there and reading a field costs
 * nothing.
 */
export async function resolveAvailableStock(
  line: Omit<StockLine, 'quantity'>,
  legacyStock: number
): Promise<number> {
  if (!sqlInventoryEnabled()) return legacyStock;
  return getAvailableStock(line);
}

/**
 * Creates any inventory rows a product is missing.
 *
 * Called whenever a product is created or edited. Without it, a product added
 * after migration 012 would have no inventory row at all and would be
 * unsellable the moment SQL inventory became authoritative — the reservation
 * would find nothing to lock and refuse the sale.
 *
 * Deliberately only ever CREATES. An existing row's available_stock is left
 * alone even when the product form carries a different number, because that
 * row also carries reserved and sold counts tied to live orders: letting a
 * product save overwrite it would discard real sales and silently change
 * stock, which is exactly what the migration brief forbids. Stock corrections
 * go through adjustInventory, which locks the row and writes an audit entry.
 *
 * Mirrors the level rules used by the migration backfill: a level gets a row
 * only when it defines its own number, so a shade that falls back to the
 * product pool keeps falling back.
 */
export async function ensureProductInventory(product: {
  id: string;
  stock?: number;
  shades?: { id: string; stock?: number; sizes?: { label: string; stock?: number }[] }[];
  sizePricing?: Record<string, { stock?: number }>;
}): Promise<number> {
  const units: { variantId: string | null; sizeLabel: string | null; stock: number }[] = [
    { variantId: null, sizeLabel: null, stock: Math.max(0, Number(product.stock) || 0) },
  ];

  for (const shade of product.shades || []) {
    if (typeof shade.stock === 'number') {
      units.push({ variantId: shade.id, sizeLabel: null, stock: Math.max(0, shade.stock) });
    }
    for (const size of shade.sizes || []) {
      if (typeof size.stock === 'number') {
        units.push({ variantId: shade.id, sizeLabel: size.label, stock: Math.max(0, size.stock) });
      }
    }
  }
  for (const [label, entry] of Object.entries(product.sizePricing || {})) {
    if (typeof entry?.stock === 'number') {
      units.push({ variantId: null, sizeLabel: label, stock: Math.max(0, entry.stock) });
    }
  }

  const client = await pool.connect();
  let created = 0;
  try {
    await client.query('BEGIN');
    for (const unit of units) {
      const id = 'inv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      // ON CONFLICT against the unique unit index: an existing row is left
      // exactly as it is.
      const result = await client.query(
        `INSERT INTO inventory (id, product_id, variant_id, size_label, available_stock)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (product_id, COALESCE(variant_id, ''), COALESCE(size_label, '')) DO NOTHING
         RETURNING id`,
        [id, product.id, unit.variantId, unit.sizeLabel, unit.stock]
      );
      if (result.rows.length > 0) {
        await client.query(
          `INSERT INTO inventory_transactions
             (id, inventory_id, product_id, variant_id, size_label, operation, quantity,
              previous_available, new_available, previous_reserved, new_reserved,
              previous_sold, new_sold, actor, reason)
           VALUES ($1,$2,$3,$4,$5,'MIGRATE',$6,0,$6,0,0,0,0,'system','Inventory row created for product')`,
          ['invtx-' + id, result.rows[0].id, product.id, unit.variantId, unit.sizeLabel, unit.stock]
        );
        created++;
      }
    }
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[inventory] could not provision rows for product', product.id, err?.message);
  } finally {
    client.release();
  }
  return created;
}

/** Every inventory row for a product, for the admin screen and the verifier. */
export async function getProductInventory(productId: string): Promise<InventoryUnit[]> {
  const res = await pool.query('SELECT * FROM inventory WHERE product_id = $1 ORDER BY id', [productId]);
  return res.rows.map(mapUnit);
}

// ------------------------------------------
// Reserve
// ------------------------------------------

/**
 * Holds stock for an order, atomically across every line.
 *
 * All-or-nothing by design: a basket of three items where the third is out of
 * stock reserves none of them. A partial reservation would leave the customer
 * with an order they did not place and stock held for goods they cannot buy.
 *
 * `expiresAt` is what stops an abandoned online checkout holding the last unit
 * forever. A COD order passes null — it is confirmed on placement, so its hold
 * lasts until delivery or cancellation.
 */
export async function reserveStockForOrder(input: {
  orderId: string;
  userId: string;
  lines: StockLine[];
  expiresAt?: Date | null;
  actor?: string;
  /**
   * Whether SQL availability may refuse the reservation.
   *
   * True (the default) when SQL is authoritative: a shortfall is a real
   * refusal and the whole basket rolls back.
   *
   * False when SQL is only being mirrored and legacy has already authorised
   * the sale. Refusing here would move the decision about what may be sold
   * from legacy to SQL — silently changing behaviour, which is exactly what
   * turning mirroring on must not do. Instead the reservation records what
   * SQL could actually account for, and any shortfall surfaces through
   * inventory:verify and inventory:health rather than blocking a customer.
   */
  enforceAvailability?: boolean;
}): Promise<InventoryResult> {
  const enforce = input.enforceAvailability !== false;
  for (const line of input.lines) {
    if (!validQuantity(line.quantity)) {
      return { ok: false, error: 'Quantity must be a positive whole number.' };
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lines are processed in a stable order so two concurrent baskets
    // containing the same two products acquire their locks in the same
    // sequence and one waits instead of both deadlocking.
    const ordered = [...input.lines].sort((a, b) =>
      `${a.productId}|${a.variantId || ''}|${a.sizeLabel || ''}`.localeCompare(
        `${b.productId}|${b.variantId || ''}|${b.sizeLabel || ''}`
      )
    );

    for (const line of ordered) {
      const gating = await resolveGatingUnit(client, line, true);
      if (!gating) {
        if (!enforce) {
          // Nothing in SQL to mirror onto — a product deleted from the
          // catalogue, for instance. Skipped rather than failing the whole
          // mirror: the other lines of this order can still be recorded.
          console.warn(
            `[inventory] mirror: no inventory row for ${line.productId} (order ${input.orderId}) — line skipped`
          );
          continue;
        }
        await client.query('ROLLBACK');
        return { ok: false, error: 'This product is no longer available.', productId: line.productId };
      }

      // Validated against the gating unit only — exactly which number the
      // legacy code checked. Re-read under FOR UPDATE, so this is the value
      // after any concurrent transaction committed, not a stale snapshot.
      if (gating.availableStock < line.quantity) {
        if (enforce) {
          await client.query('ROLLBACK');
          return {
            ok: false,
            error: `Only ${gating.availableStock} left in stock.`,
            availableStock: gating.availableStock,
            productId: line.productId,
          };
        }
        // Mirroring only. Legacy already allowed this sale, so SQL records
        // what it can and the discrepancy is reported by verify/health rather
        // than silently overriding the authoritative system.
        console.warn(
          `[inventory] mirror: SQL shows ${gating.availableStock} of ${line.productId} but order ${input.orderId} ` +
            `needs ${line.quantity} — recording what SQL can account for; run inventory:verify`
        );
      }

      const units = await resolveCascadeUnits(client, line);
      for (const unit of units) {
        // Already reserved by an earlier attempt for this same order?
        //
        // Checked while holding this row's FOR UPDATE lock, which is what
        // makes it reliable: any competing transaction must acquire the same
        // lock to deduct, so it either committed its reservation before this
        // read (and is visible here) or is still waiting behind us.
        //
        // The unique index alone is NOT sufficient. It prevents a duplicate
        // reservation ROW, but the deduction below happens first — so without
        // this guard, five retries of one checkout each subtracted stock while
        // only one reservation survived to give it back, silently destroying
        // the difference.
        const alreadyHeld = await client.query(
          `SELECT id FROM inventory_reservations
           WHERE order_id = $1 AND inventory_id = $2 AND status = 'ACTIVE'`,
          [input.orderId, unit.id]
        );
        if (alreadyHeld.rows.length > 0) continue;

        // Floored at zero. The legacy product-level pool was allowed to go
        // negative (it was decremented without a clamp while only the gating
        // unit was validated); the CHECK constraint forbids that here, and a
        // negative count is meaningless anyway. The gating unit is already
        // known to have enough, so this clamp can only ever affect a
        // product-level pool that legacy would have driven below zero.
        const nextAvailable = Math.max(0, unit.availableStock - line.quantity);
        const actuallyTaken = unit.availableStock - nextAvailable;
        // Nothing moved — this cascade level was already exhausted. Skipped
        // rather than recorded: a zero-quantity reservation violates the
        // CHECK, and there would be nothing for a later release to give back.
        if (actuallyTaken === 0) continue;

        const nextReserved = unit.reservedStock + actuallyTaken;

        await client.query(
          'UPDATE inventory SET available_stock = $2, reserved_stock = $3, updated_at = now() WHERE id = $1',
          [unit.id, nextAvailable, nextReserved]
        );

        const reservationId = 'rsv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
        // ON CONFLICT on the partial unique index: a retried checkout for the
        // same order and unit finds its existing ACTIVE reservation and does
        // not create a second one. The quantity recorded is what was actually
        // taken, so releasing it returns exactly that and no more.
        const reservation = await client.query(
          `INSERT INTO inventory_reservations
             (id, inventory_id, order_id, user_id, product_id, variant_id, size_label, quantity, status, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9)
           ON CONFLICT (order_id, inventory_id) WHERE status = 'ACTIVE' DO NOTHING
           RETURNING id`,
          [
            reservationId,
            unit.id,
            input.orderId,
            input.userId,
            unit.productId,
            unit.variantId,
            unit.sizeLabel,
            actuallyTaken,
            input.expiresAt || null,
          ]
        );

        await logTransaction(client, {
          unit,
          operation: 'RESERVE',
          quantity: -actuallyTaken,
          next: { available: nextAvailable, reserved: nextReserved, sold: unit.soldStock },
          orderId: input.orderId,
          reservationId: reservation.rows[0]?.id || null,
          actor: input.actor || input.userId,
          reason: 'Stock reserved for order',
        });
      }
    }

    await client.query('COMMIT');
    return { ok: true };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[inventory] reservation failed, rolled back:', err?.message);
    return { ok: false, error: 'Could not reserve stock. Please try again.' };
  } finally {
    client.release();
  }
}

// ------------------------------------------
// Release / commit / restock
// ------------------------------------------

/**
 * Returns an order's held stock to the sellable pool.
 *
 * Idempotent: only reservations still ACTIVE are acted on, so a cancellation
 * racing a payment-failure webhook releases once. Used for payment failure,
 * cancellation before dispatch, and expiry.
 */
export async function releaseOrderReservations(input: {
  orderId: string;
  reason: string;
  actor?: string;
}): Promise<{ ok: boolean; released: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Locked in id order for the same deadlock-avoidance reason as above.
    const reservations = await client.query(
      `SELECT r.* FROM inventory_reservations r
       WHERE r.order_id = $1 AND r.status = 'ACTIVE'
       ORDER BY r.inventory_id
       FOR UPDATE`,
      [input.orderId]
    );

    let released = 0;
    for (const row of reservations.rows) {
      const unitRes = await client.query('SELECT * FROM inventory WHERE id = $1 FOR UPDATE', [row.inventory_id]);
      if (unitRes.rows.length === 0) continue;
      const unit = mapUnit(unitRes.rows[0]);

      const qty = Number(row.quantity);
      // Clamped so a reservation larger than the recorded reserved count
      // cannot drive it negative — which could only happen if the two were
      // already inconsistent, and crashing here would make that worse.
      const takeBack = Math.min(qty, unit.reservedStock);
      const nextReserved = unit.reservedStock - takeBack;
      const nextAvailable = unit.availableStock + takeBack;

      await client.query(
        'UPDATE inventory SET available_stock = $2, reserved_stock = $3, updated_at = now() WHERE id = $1',
        [unit.id, nextAvailable, nextReserved]
      );
      await client.query(
        `UPDATE inventory_reservations SET status = 'RELEASED', released_at = now(), updated_at = now() WHERE id = $1`,
        [row.id]
      );
      await logTransaction(client, {
        unit,
        operation: 'RELEASE',
        quantity: takeBack,
        next: { available: nextAvailable, reserved: nextReserved, sold: unit.soldStock },
        orderId: input.orderId,
        reservationId: row.id,
        actor: input.actor || 'system',
        reason: input.reason,
      });
      released++;
    }

    await client.query('COMMIT');
    return { ok: true, released };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[inventory] release failed, rolled back:', err?.message);
    return { ok: false, released: 0 };
  } finally {
    client.release();
  }
}

/**
 * Converts an order's reservations into sold stock.
 *
 * Called on delivery, which is the only moment the goods have demonstrably
 * reached the customer. Reserved stock decreases and sold increases;
 * available is untouched, because those units left the sellable pool when they
 * were reserved.
 */
export async function commitOrderReservations(input: {
  orderId: string;
  actor?: string;
}): Promise<{ ok: boolean; committed: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reservations = await client.query(
      `SELECT * FROM inventory_reservations
       WHERE order_id = $1 AND status = 'ACTIVE'
       ORDER BY inventory_id
       FOR UPDATE`,
      [input.orderId]
    );

    let committed = 0;
    for (const row of reservations.rows) {
      const unitRes = await client.query('SELECT * FROM inventory WHERE id = $1 FOR UPDATE', [row.inventory_id]);
      if (unitRes.rows.length === 0) continue;
      const unit = mapUnit(unitRes.rows[0]);

      const qty = Math.min(Number(row.quantity), unit.reservedStock);
      const nextReserved = unit.reservedStock - qty;
      const nextSold = unit.soldStock + qty;

      await client.query(
        'UPDATE inventory SET reserved_stock = $2, sold_stock = $3, updated_at = now() WHERE id = $1',
        [unit.id, nextReserved, nextSold]
      );
      await client.query(
        `UPDATE inventory_reservations SET status = 'COMMITTED', committed_at = now(), updated_at = now() WHERE id = $1`,
        [row.id]
      );
      await logTransaction(client, {
        unit,
        operation: 'COMMIT',
        quantity: qty,
        next: { available: unit.availableStock, reserved: nextReserved, sold: nextSold },
        orderId: input.orderId,
        reservationId: row.id,
        actor: input.actor || 'system',
        reason: 'Delivered — reservation converted to sold',
      });
      committed++;
    }

    await client.query('COMMIT');
    return { ok: true, committed };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[inventory] commit failed, rolled back:', err?.message);
    return { ok: false, committed: 0 };
  } finally {
    client.release();
  }
}

/**
 * Puts delivered goods back on sale after a return or RTO.
 *
 * Moves units out of sold and back into available. Separate from
 * releaseOrderReservations because the units are in a different counter by
 * then — releasing a committed reservation would credit available from a
 * reserved pool that no longer holds them, inventing stock.
 */
export async function restockReturnedOrder(input: {
  orderId: string;
  reason: string;
  actor?: string;
}): Promise<{ ok: boolean; restocked: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reservations = await client.query(
      `SELECT * FROM inventory_reservations
       WHERE order_id = $1 AND status IN ('ACTIVE', 'COMMITTED')
       ORDER BY inventory_id
       FOR UPDATE`,
      [input.orderId]
    );

    let restocked = 0;
    for (const row of reservations.rows) {
      const unitRes = await client.query('SELECT * FROM inventory WHERE id = $1 FOR UPDATE', [row.inventory_id]);
      if (unitRes.rows.length === 0) continue;
      const unit = mapUnit(unitRes.rows[0]);
      const qty = Number(row.quantity);

      // Which counter the units are sitting in depends on whether the order
      // was delivered. Taking them from the wrong one would either invent
      // stock or lose it.
      const fromSold = row.status === 'COMMITTED';
      const takeBack = Math.min(qty, fromSold ? unit.soldStock : unit.reservedStock);
      const nextSold = fromSold ? unit.soldStock - takeBack : unit.soldStock;
      const nextReserved = fromSold ? unit.reservedStock : unit.reservedStock - takeBack;
      const nextAvailable = unit.availableStock + takeBack;

      await client.query(
        `UPDATE inventory SET available_stock = $2, reserved_stock = $3, sold_stock = $4, updated_at = now()
         WHERE id = $1`,
        [unit.id, nextAvailable, nextReserved, nextSold]
      );
      await client.query(
        `UPDATE inventory_reservations SET status = 'RELEASED', released_at = now(), updated_at = now() WHERE id = $1`,
        [row.id]
      );
      await logTransaction(client, {
        unit,
        operation: 'RESTOCK',
        quantity: takeBack,
        next: { available: nextAvailable, reserved: nextReserved, sold: nextSold },
        orderId: input.orderId,
        reservationId: row.id,
        actor: input.actor || 'system',
        reason: input.reason,
      });
      restocked++;
    }

    await client.query('COMMIT');
    return { ok: true, restocked };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[inventory] restock failed, rolled back:', err?.message);
    return { ok: false, restocked: 0 };
  } finally {
    client.release();
  }
}

/**
 * Releases reservations whose hold has lapsed.
 *
 * Without this one abandoned checkout would keep the last unit off sale
 * permanently. Bounded per run so a large backlog is worked through steadily
 * rather than in one burst that would hold locks across the whole catalogue.
 */
export async function releaseExpiredReservations(limit = 200): Promise<number> {
  const expired = await pool.query(
    `SELECT DISTINCT order_id FROM inventory_reservations
     WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < now()
     LIMIT $1`,
    [limit]
  );

  let released = 0;
  for (const row of expired.rows) {
    const result = await releaseOrderReservations({
      orderId: row.order_id,
      reason: 'Reservation expired',
      actor: 'system',
    });
    released += result.released;
  }
  return released;
}

/**
 * Admin stock correction.
 *
 * Deliberately the only way to set an absolute number: every other operation
 * is a relative movement tied to an order. An absolute set needs the same lock
 * and the same audit row, so a stocktake is as traceable as a sale.
 */
export async function adjustInventory(input: {
  productId: string;
  variantId?: string | null;
  sizeLabel?: string | null;
  availableStock: number;
  lowStockThreshold?: number;
  actor: string;
  reason: string;
}): Promise<InventoryResult> {
  if (!Number.isInteger(input.availableStock) || input.availableStock < 0) {
    return { ok: false, error: 'Available stock must be a whole number of zero or more.' };
  }
  if (
    input.lowStockThreshold !== undefined &&
    (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0)
  ) {
    return { ok: false, error: 'Low stock threshold must be a whole number of zero or more.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT * FROM inventory
       WHERE product_id = $1
         AND variant_id IS NOT DISTINCT FROM $2
         AND size_label IS NOT DISTINCT FROM $3
       FOR UPDATE`,
      [input.productId, input.variantId || null, input.sizeLabel || null]
    );

    let unit: InventoryUnit;
    if (existing.rows.length === 0) {
      // A level that previously fell back now gets its own number. Created
      // rather than refused, because that is a legitimate thing for an admin
      // to do when a shade starts being stocked separately.
      const id = 'inv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const created = await client.query(
        `INSERT INTO inventory (id, product_id, variant_id, size_label, available_stock, low_stock_threshold)
         VALUES ($1,$2,$3,$4,0,COALESCE($5, 5)) RETURNING *`,
        [id, input.productId, input.variantId || null, input.sizeLabel || null, input.lowStockThreshold ?? null]
      );
      unit = mapUnit(created.rows[0]);
    } else {
      unit = mapUnit(existing.rows[0]);
    }

    await client.query(
      `UPDATE inventory SET available_stock = $2,
              low_stock_threshold = COALESCE($3, low_stock_threshold), updated_at = now()
       WHERE id = $1`,
      [unit.id, input.availableStock, input.lowStockThreshold ?? null]
    );

    await logTransaction(client, {
      unit,
      operation: 'ADJUST',
      quantity: input.availableStock - unit.availableStock,
      next: { available: input.availableStock, reserved: unit.reservedStock, sold: unit.soldStock },
      actor: input.actor,
      reason: input.reason,
    });

    await client.query('COMMIT');
    return { ok: true };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[inventory] adjustment failed, rolled back:', err?.message);
    return { ok: false, error: 'Could not adjust inventory.' };
  } finally {
    client.release();
  }
}

/** Movement history for one unit, newest first. */
export async function getInventoryTransactions(
  productId: string,
  limit = 100
): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM inventory_transactions WHERE product_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [productId, limit]
  );
  return res.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id || undefined,
    sizeLabel: row.size_label || undefined,
    operation: row.operation,
    quantity: Number(row.quantity),
    previousAvailable: Number(row.previous_available),
    newAvailable: Number(row.new_available),
    previousReserved: Number(row.previous_reserved),
    newReserved: Number(row.new_reserved),
    previousSold: Number(row.previous_sold),
    newSold: Number(row.new_sold),
    orderId: row.order_id || undefined,
    actor: row.actor || undefined,
    reason: row.reason || undefined,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

// ------------------------------------------
// Consistency monitoring
// ------------------------------------------

export interface InventoryHealthProblem {
  check: string;
  detail: string;
  /** critical = stock is provably wrong and money/goods are at risk.
   *  warning = something is not running as intended but nothing is corrupt. */
  severity: 'critical' | 'warning';
}

export interface InventoryHealthReport {
  problems: InventoryHealthProblem[];
  totals: { units: number; available: number; reserved: number; sold: number; lowStock: number };
  orphanedProducts: string[];
}

/**
 * Checks the invariants SQL inventory is supposed to maintain on its own.
 *
 * Lives here rather than in the CLI so the operator tool and the running
 * server check exactly the same things — two definitions of "healthy" would
 * eventually disagree, and the one that drifted would be the one nobody was
 * watching.
 *
 * Purely diagnostic: it reads, compares and reports. Nothing here repairs
 * anything, because every violation below is a bug in a write path, and
 * quietly correcting the symptom would hide the cause.
 */
export async function runInventoryHealthChecks(): Promise<InventoryHealthReport> {
  const problems: InventoryHealthProblem[] = [];

  // The central invariant. reserved_stock is maintained incrementally by
  // reserve/release/commit; the reservation rows are an independent record of
  // the same thing. Disagreement means one of those paths is wrong.
  const drift = await pool.query(`
    SELECT i.product_id, i.variant_id, i.size_label, i.reserved_stock,
           COALESCE(r.active_qty, 0) AS active_qty
    FROM inventory i
    LEFT JOIN (
      SELECT inventory_id, SUM(quantity)::int AS active_qty
      FROM inventory_reservations WHERE status = 'ACTIVE' GROUP BY inventory_id
    ) r ON r.inventory_id = i.id
    WHERE i.reserved_stock <> COALESCE(r.active_qty, 0)
    ORDER BY i.product_id LIMIT 50
  `);
  for (const row of drift.rows) {
    problems.push({
      severity: 'critical',
      check: 'reserved_stock drift',
      detail: `${row.product_id}/${row.variant_id || '-'}/${row.size_label || '-'}: counter=${row.reserved_stock} active reservations=${row.active_qty}`,
    });
  }

  // Impossible while the CHECK constraints exist, so a hit means they were
  // dropped.
  const negatives = await pool.query(
    `SELECT COUNT(*)::int AS n FROM inventory WHERE available_stock < 0 OR reserved_stock < 0 OR sold_stock < 0`
  );
  if (negatives.rows[0].n > 0) {
    problems.push({
      severity: 'critical',
      check: 'negative counters',
      detail: `${negatives.rows[0].n} row(s) hold a negative count — the CHECK constraints may have been dropped`,
    });
  }

  // A few expired holds in flight is normal; the sweep runs every five
  // minutes. A backlog older than that means it is not running.
  const stale = await pool.query(`
    SELECT COUNT(*)::int AS n FROM inventory_reservations
    WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < now() - interval '15 minutes'
  `);
  if (stale.rows[0].n > 0) {
    problems.push({
      severity: 'warning',
      check: 'stale reservations',
      detail: `${stale.rows[0].n} reservation(s) expired over 15 minutes ago and still hold stock — is the expiry sweep running?`,
    });
  }

  // Stock that left inventory with nothing recording where it went.
  //
  // Scoped to orders that have at least one line resolving to an inventory
  // row. An order whose every product has since been deleted from the
  // catalogue has nothing to hold a reservation against — there is no
  // inventory row to reserve from, and inventing one would create stock for a
  // product that is no longer sold. Flagging those would be a permanent,
  // unfixable failure that trains people to ignore this check, so they are
  // counted separately below instead of being buried here.
  const orphanedCommits = await pool.query(`
    SELECT o.order_number, o.status FROM orders o
    WHERE o.stock_committed = true AND o.stock_restored = false
      AND o.status NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'RTO')
      AND NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.order_id = o.id AND r.status = 'ACTIVE')
      AND EXISTS (
        SELECT 1 FROM order_items oi
        WHERE oi.order_id = o.id
          AND EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = oi.product_id)
      )
    ORDER BY o.created_at DESC LIMIT 25
  `);
  for (const row of orphanedCommits.rows) {
    problems.push({
      severity: 'critical',
      check: 'order holds stock with no reservation',
      detail: `${row.order_number} (${row.status}) committed stock but has no ACTIVE reservation`,
    });
  }

  // In-flight order lines for products that no longer exist in inventory.
  // Reported so they are never silently dropped, but not a failure: nothing
  // in the system can act on them, and no action would improve matters.
  const deletedProductLines = await pool.query(`
    SELECT o.order_number, oi.product_id, oi.quantity
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'RTO')
      AND o.stock_committed = true AND o.stock_restored = false
      AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = oi.product_id)
    ORDER BY o.created_at DESC LIMIT 25
  `);
  for (const row of deletedProductLines.rows) {
    problems.push({
      severity: 'warning',
      check: 'in-flight line for a deleted product',
      detail: `${row.order_number}: ${row.quantity}x ${row.product_id} — product no longer in the catalogue, so it holds no reservation`,
    });
  }

  // Stock still reserved for an order that has finished.
  //
  // This was a blind spot. The two checks either side of it both passed while
  // an orphan existed: "reserved_stock matches active reservations" compares
  // two numbers that are wrong together, and "in-flight orders hold a
  // reservation" only looks at orders that are still in flight — a cancelled
  // one is skipped. So stock could sit reserved for a cancelled order
  // indefinitely with every invariant reporting OK.
  //
  // It is reachable whenever an order reaches a terminal state without its
  // reservation being released — which is exactly what happens if an order is
  // cancelled while INVENTORY_SQL_MODE is off, since restoreOrderStock only
  // touches the SQL side when SQL inventory is authoritative.
  const terminalHoldings = await pool.query(`
    SELECT o.order_number, o.status, SUM(r.quantity)::int AS qty
    FROM inventory_reservations r
    JOIN orders o ON o.id = r.order_id
    WHERE r.status = 'ACTIVE'
      AND o.status IN ('CANCELLED', 'RETURNED', 'RTO', 'DELIVERED')
    GROUP BY o.order_number, o.status
    ORDER BY o.order_number
    LIMIT 25
  `);
  for (const row of terminalHoldings.rows) {
    problems.push({
      severity: 'critical',
      check: 'finished order still holding stock',
      detail: `${row.order_number} is ${row.status} but still holds an ACTIVE reservation for ${row.qty} unit(s) — that stock is off sale for an order that has ended`,
    });
  }

  // Delivered goods should be counted as sold, not still reserved.
  const uncommitted = await pool.query(`
    SELECT o.order_number FROM orders o
    JOIN inventory_reservations r ON r.order_id = o.id AND r.status = 'ACTIVE'
    WHERE o.status = 'DELIVERED' GROUP BY o.order_number LIMIT 25
  `);
  for (const row of uncommitted.rows) {
    problems.push({
      severity: 'warning',
      check: 'delivered order still reserving',
      detail: `${row.order_number} is DELIVERED but still holds an ACTIVE reservation`,
    });
  }

  // Inventory for products no longer in the catalogue. Informational, not a
  // problem: there is deliberately no foreign key, precisely so deleting a
  // product can never cascade-delete real stock counts.
  //
  // Only the ids are selected, not the whole document. `SELECT data FROM
  // cms_state` transfers the entire catalogue — images, descriptions, every
  // CMS block — which on production is ~72KB and repeatedly exceeded the
  // pool's 15s query_timeout against a throttled endpoint. This check runs
  // hourly in production, so it has to be cheap.
  const cms = await pool.query<{ id: string }>(
    `SELECT jsonb_array_elements(data->'products')->>'id' AS id FROM cms_state WHERE id = 'main'`
  );
  const catalogueIds = new Set<string>(cms.rows.map((r) => r.id).filter(Boolean));
  const distinct = await pool.query('SELECT DISTINCT product_id FROM inventory');
  const orphanedProducts = distinct.rows.map((r) => r.product_id).filter((id) => !catalogueIds.has(id));

  const totalsRes = await pool.query(`
    SELECT COUNT(*)::int AS units,
           COALESCE(SUM(available_stock),0)::int AS available,
           COALESCE(SUM(reserved_stock),0)::int  AS reserved,
           COALESCE(SUM(sold_stock),0)::int      AS sold,
           COUNT(*) FILTER (WHERE available_stock <= low_stock_threshold)::int AS low_stock
    FROM inventory
  `);
  const t = totalsRes.rows[0];

  return {
    problems,
    totals: {
      units: t.units,
      available: t.available,
      reserved: t.reserved,
      sold: t.sold,
      lowStock: t.low_stock,
    },
    orphanedProducts,
  };
}

/**
 * Periodic in-process consistency check.
 *
 * The CLI answers "is it healthy right now" when someone asks; this is what
 * notices at 3am that it stopped being healthy. Logs only — see
 * runInventoryHealthChecks for why nothing here repairs.
 *
 * A no-op while SQL inventory is switched off, since none of these invariants
 * apply to the legacy document.
 */
export async function monitorInventoryConsistency(): Promise<void> {
  if (!sqlInventoryEnabled()) return;

  let report: InventoryHealthReport;
  try {
    report = await runInventoryHealthChecks();
  } catch (err) {
    console.error('[inventory] consistency check could not run:', err);
    return;
  }

  const critical = report.problems.filter((p) => p.severity === 'critical');
  const warnings = report.problems.filter((p) => p.severity === 'warning');

  if (critical.length > 0) {
    // Loud and itemised: a stock inconsistency is worth paging on, and a
    // summary line alone would not tell whoever is woken up what to look at.
    console.error(
      `[inventory] CONSISTENCY FAILURE — ${critical.length} critical problem(s). Stock figures may be wrong.`
    );
    for (const p of critical.slice(0, 10)) console.error(`[inventory]   [${p.check}] ${p.detail}`);
  }
  if (warnings.length > 0) {
    console.warn(`[inventory] ${warnings.length} consistency warning(s):`);
    for (const p of warnings.slice(0, 5)) console.warn(`[inventory]   [${p.check}] ${p.detail}`);
  }
  if (critical.length === 0 && warnings.length === 0) {
    const t = report.totals;
    console.log(
      `[inventory] consistent — ${t.units} units · ${t.available} available · ${t.reserved} reserved · ${t.sold} sold · ${t.lowStock} low`
    );
  }
}

/** Units at or below their threshold, for the admin low-stock view. */
export async function getLowStockUnits(): Promise<InventoryUnit[]> {
  const res = await pool.query(
    'SELECT * FROM inventory WHERE available_stock <= low_stock_threshold ORDER BY available_stock ASC, product_id'
  );
  return res.rows.map(mapUnit);
}
