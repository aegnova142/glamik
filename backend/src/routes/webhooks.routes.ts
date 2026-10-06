import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db/db';
import { env } from '../config/env';
import { rateLimit } from '../middleware/rateLimit';
import {
  verifyDelhiveryWebhook,
  parseDelhiveryScanPush,
  mapDelhiveryStatus,
  delhiveryStatusKey,
  DelhiveryScanPayload,
} from '../services/couriers/delhivery.service';
import { verifyWebhookSignature, fromMinorUnits } from '../services/payment.service';
import {
  markOrderPaid,
  markOrderPaymentFailed,
  recordRefund,
  restoreOrderStock,
  applyShippingStatus,
  recordTrackingEvents,
} from '../services/fulfillment.service';

// ==========================================
// INBOUND WEBHOOKS
//
// Mounted BEFORE express.json() in server.ts and parsed with express.raw(),
// because signature verification is an HMAC over the exact bytes received.
// Re-serialising a parsed body would reorder keys or change whitespace and the
// HMAC would never match — which is the single most common way webhook
// verification gets silently disabled.
//
// Every handler follows the same four steps:
//
//   1. Verify the signature before reading anything else. An unverified body
//      is attacker-controlled input and is never acted on.
//   2. Claim the event in webhook_events. The unique (source, event_id) index
//      is what makes processing idempotent across restarts, not an in-memory
//      set.
//   3. Acknowledge fast. Providers retry on timeout, so the HTTP response is
//      sent as soon as the event is durably recorded; the work happens after.
//   4. Record the outcome, so a failed event can be found and replayed by the
//      reconciliation sweep rather than being lost.
// ==========================================

const router = express.Router();

/** Raw body, kept as a Buffer so the HMAC is computed over the exact bytes. */
const rawJson = express.raw({ type: ['application/json', 'text/plain'], limit: '1mb' });

/** Providers that do not send an event id still need a stable one, or every
 * retry would look like a new event and be processed again. */
function deterministicEventId(source: string, body: Buffer): string {
  return `${source}-${crypto.createHash('sha256').update(body).digest('hex').slice(0, 32)}`;
}

function parseJsonBody(body: Buffer): any | null {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Records the event and reports whether this caller owns processing it.
 *
 * `fresh: false` means some earlier delivery already claimed it. The caller
 * acknowledges and stops — that is the whole duplicate-suppression mechanism.
 */
async function claimEvent(input: {
  source: string;
  eventId: string;
  eventType?: string;
  orderId?: string | null;
  payload: unknown;
}): Promise<{ fresh: boolean; rowId: string }> {
  const rowId = 'whk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const result = await pool.query(
    `INSERT INTO webhook_events (id, source, event_id, event_type, order_id, payload, status)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'RECEIVED')
     ON CONFLICT (source, event_id) DO NOTHING
     RETURNING id`,
    [rowId, input.source, input.eventId, input.eventType || null, input.orderId || null, JSON.stringify(input.payload)]
  );
  if (result.rows.length > 0) return { fresh: true, rowId: result.rows[0].id };

  const existing = await pool.query('SELECT id FROM webhook_events WHERE source = $1 AND event_id = $2', [
    input.source,
    input.eventId,
  ]);
  return { fresh: false, rowId: existing.rows[0]?.id || rowId };
}

async function finishEvent(rowId: string, status: 'PROCESSED' | 'FAILED' | 'IGNORED', error?: string): Promise<void> {
  await pool
    .query(
      `UPDATE webhook_events SET status = $2, error = $3, processed_at = now(),
              attempt_count = attempt_count + 1
       WHERE id = $1`,
      [rowId, status, error ? String(error).slice(0, 1000) : null]
    )
    .catch((err) => console.error('[webhook] could not record outcome:', err));
}

// ==========================================
// RAZORPAY
// ==========================================

/**
 * Resolves the Glamirk order a Razorpay payment belongs to.
 *
 * Looked up through the payments ledger by gateway order id rather than read
 * from the webhook's `notes`. Notes are set by us at order creation and are
 * almost certainly correct — but they arrive back inside attacker-shaped input,
 * and the ledger is the record we actually control.
 */
async function resolveOrderForGatewayOrder(gatewayOrderId: string): Promise<{ orderId: string; paymentRowId: string; amountMinor: number } | null> {
  const result = await pool.query(
    'SELECT id, order_id, amount_minor FROM payments WHERE provider_order_id = $1 LIMIT 1',
    [gatewayOrderId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { orderId: row.order_id, paymentRowId: row.id, amountMinor: Number(row.amount_minor) };
}

router.post('/webhooks/razorpay', rawJson, async (req: Request, res: Response) => {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const signature = req.get('x-razorpay-signature');

  if (!verifyWebhookSignature(body, signature)) {
    // 401 and nothing else. No detail about why, so this cannot be used as an
    // oracle to probe the secret.
    console.warn('[webhook] rejected a Razorpay delivery with an invalid signature');
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  const payload = parseJsonBody(body);
  if (!payload) return res.status(400).json({ error: 'Malformed payload.' });

  const eventType: string = payload.event || 'unknown';
  // Razorpay sends x-razorpay-event-id on every delivery; the hash is a
  // fallback for older integrations.
  const eventId = req.get('x-razorpay-event-id') || deterministicEventId('razorpay', body);

  const entity = payload.payload?.payment?.entity || payload.payload?.refund?.entity || {};
  const gatewayOrderId: string | undefined = entity.order_id;

  const resolved = gatewayOrderId ? await resolveOrderForGatewayOrder(gatewayOrderId) : null;

  const claim = await claimEvent({
    source: 'razorpay',
    eventId,
    eventType,
    orderId: resolved?.orderId,
    payload,
  });

  // Acknowledged immediately either way. A duplicate is a success from the
  // provider's point of view — it asked us to be sure we have the event, and
  // we do.
  res.json({ received: true, duplicate: !claim.fresh });
  if (!claim.fresh) return;

  try {
    if (!resolved) {
      // A payment we have no ledger row for. Recorded and ignored rather than
      // guessed at — acting on it would mean trusting the payload to tell us
      // which order to credit.
      await finishEvent(claim.rowId, 'IGNORED', `No payment row for gateway order ${gatewayOrderId || '(none)'}`);
      return;
    }

    switch (eventType) {
      case 'payment.captured': {
        // The amount is checked against what the order actually costs. A
        // verified webhook for the wrong amount is a reconciliation problem,
        // not an authorisation to fulfil.
        if (Number(entity.amount) !== resolved.amountMinor) {
          await finishEvent(
            claim.rowId,
            'FAILED',
            `Amount mismatch: webhook ${entity.amount}, expected ${resolved.amountMinor}`
          );
          console.error(`[webhook] amount mismatch on order ${resolved.orderId}`);
          return;
        }
        await pool.query(
          `UPDATE payments SET provider_payment_id = $2, status = 'PAID', method = $3,
                  gateway_response = $4::jsonb, updated_at = now()
           WHERE id = $1`,
          [resolved.paymentRowId, entity.id, entity.method || null, JSON.stringify(entity)]
        );
        await markOrderPaid({
          orderId: resolved.orderId,
          amountPaid: fromMinorUnits(Number(entity.amount)),
          gatewayPaymentId: entity.id,
          method: entity.method,
        });
        await finishEvent(claim.rowId, 'PROCESSED');
        return;
      }

      case 'payment.failed': {
        await pool.query(
          `UPDATE payments SET provider_payment_id = $2, status = 'FAILED', method = $3,
                  error_code = $4, error_description = $5, gateway_response = $6::jsonb, updated_at = now()
           WHERE id = $1`,
          [
            resolved.paymentRowId,
            entity.id || null,
            entity.method || null,
            entity.error_code || null,
            entity.error_description || null,
            JSON.stringify(entity),
          ]
        );
        await markOrderPaymentFailed({
          orderId: resolved.orderId,
          status: 'FAILED',
          reason: entity.error_description || 'Payment failed',
        });
        // The reservation is released so the stock goes back on sale rather
        // than waiting for the expiry sweep.
        await restoreOrderStock(resolved.orderId);
        await finishEvent(claim.rowId, 'PROCESSED');
        return;
      }

      case 'refund.created':
      case 'refund.processed': {
        const refundMinor = Number(entity.amount) || 0;
        await pool.query(
          `UPDATE payments SET refunded_minor = LEAST(amount_minor, refunded_minor + $2), updated_at = now()
           WHERE id = $1`,
          [resolved.paymentRowId, refundMinor]
        );
        await recordRefund({ orderId: resolved.orderId, amount: fromMinorUnits(refundMinor) });
        await finishEvent(claim.rowId, 'PROCESSED');
        return;
      }

      default:
        // Razorpay sends many events we have no use for. Recorded so the
        // ledger is complete, then ignored.
        await finishEvent(claim.rowId, 'IGNORED', `Unhandled event type ${eventType}`);
    }
  } catch (err: any) {
    // Never rethrown: the response has already been sent, and an unhandled
    // rejection here would be noise. The FAILED row is what the sweep looks for.
    await finishEvent(claim.rowId, 'FAILED', err?.message || 'Unknown error');
    console.error('[webhook] razorpay processing failed:', err);
  }
});

// ==========================================
// DELHIVERY — Scan Push
// ==========================================

/**
 * Resolves which Glamirk order a Delhivery push is about.
 *
 * Two identifiers arrive and they mean different things: the waybill is the
 * tracking number we drew and stored, and the reference is the order number we
 * sent at creation. Both are values Glamirk wrote, so both are checked against
 * what we hold rather than either being taken on trust.
 *
 * Any identifier present on both sides that disagrees stops processing. A push
 * claiming one order's number and another's waybill is either a provider bug
 * or someone probing, and acting on either alone moves the wrong parcel's
 * order.
 */
interface ResolvedDelhiveryOrder {
  ok: boolean;
  orderId?: string;
  shipmentRowId?: string | null;
  matchedBy?: string;
  reason?: string;
}

async function resolveDelhiveryOrder(payload: DelhiveryScanPayload): Promise<ResolvedDelhiveryOrder> {
  const candidates: { orderId: string; via: string }[] = [];

  if (payload.waybill) {
    // waybill first, then awb_code — a historical Shiprocket row only has the
    // latter, and this route must not resurrect one by accident.
    const res = await pool.query(
      `SELECT order_id FROM shipments WHERE waybill = $1 OR (waybill IS NULL AND awb_code = $1) LIMIT 1`,
      [payload.waybill]
    );
    if (res.rows[0]) candidates.push({ orderId: res.rows[0].order_id, via: 'waybill' });
  }
  if (payload.orderRef) {
    const res = await pool.query('SELECT id FROM orders WHERE order_number = $1 LIMIT 1', [payload.orderRef]);
    if (res.rows[0]) candidates.push({ orderId: res.rows[0].id, via: 'order_ref' });
  }

  if (candidates.length === 0) {
    return { ok: false, reason: 'No Glamirk order matches any identifier in this push' };
  }

  const distinct = [...new Set(candidates.map((c) => c.orderId))];
  if (distinct.length > 1) {
    return { ok: false, reason: `Identifiers disagree: ${candidates.map((c) => `${c.via}→${c.orderId}`).join(', ')}` };
  }

  const orderId = distinct[0];
  const shipmentRes = await pool.query(
    'SELECT id, waybill, awb_code FROM shipments WHERE order_id = $1 LIMIT 1',
    [orderId]
  );
  const shipment = shipmentRes.rows[0];

  if (shipment && payload.waybill) {
    const stored = shipment.waybill || shipment.awb_code;
    if (stored && String(stored) !== payload.waybill) {
      return { ok: false, reason: 'Waybill in the push does not match the one stored for this order' };
    }
  }

  return {
    ok: true,
    orderId,
    shipmentRowId: shipment?.id || null,
    matchedBy: candidates.find((c) => c.via === 'waybill')?.via || candidates[0].via,
  };
}

/**
 * Delhivery Scan Push.
 *
 * NOT production-enabled. Delhivery configures Scan Push through its own
 * webhook request process and tests the endpoint before switching it on, so
 * this is ready to receive but has not been exercised by Delhivery yet. Until
 * they have, nothing arrives here in production.
 *
 * Deliberately a separate route from the Shiprocket one rather than a reused
 * path with a renamed secret: the two providers authenticate differently, send
 * different payloads, and are configured by different people. Sharing a URL
 * would mean one provider's retry storm rate-limiting the other.
 */
router.post(
  '/webhooks/delhivery',
  rateLimit({ windowMs: 60 * 1000, max: 600, scope: 'webhook-delhivery', message: 'Too many requests.' }),
  rawJson,
  async (req: Request, res: Response) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    // Checked before the body is parsed — an unverified payload is attacker
    // input. Fails closed with no secret configured, in every environment.
    if (!verifyDelhiveryWebhook(req.get('x-api-key') || req.get('authorization'))) {
      console.warn('[webhook] rejected a Delhivery delivery with a missing or invalid key');
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const parsedBody = parseJsonBody(body);
    const payload = parseDelhiveryScanPush(parsedBody);
    if (!payload) return res.status(400).json({ error: 'Malformed payload.' });

    const resolved = await resolveDelhiveryOrder(payload);
    const orderId = resolved.ok ? resolved.orderId! : null;

    // Delhivery sends no event id. One is derived from the fields it does
    // send, so an identical redelivery collapses onto the same row while a
    // genuine next status does not.
    const eventId =
      payload.waybill && (payload.status || payload.statusType)
        ? delhiveryStatusKey({
            waybill: payload.waybill,
            orderId: orderId || payload.orderRef || '',
            statusType: payload.statusType,
            status: payload.status,
            timestamp: payload.statusDateTimeRaw,
          })
        : deterministicEventId('delhivery', body);

    const claim = await claimEvent({
      source: 'delhivery',
      eventId,
      eventType: payload.status || 'unknown',
      orderId,
      payload: parsedBody,
    });

    // Acknowledged before the work starts. A duplicate is a success from
    // Delhivery's point of view: it asked us to be sure we have the event.
    res.json({ received: true, duplicate: !claim.fresh });
    if (!claim.fresh) return;

    try {
      if (!resolved.ok) {
        console.warn(`[webhook] delhivery push not applied: ${resolved.reason}`);
        await finishEvent(claim.rowId, 'IGNORED', resolved.reason);
        return;
      }

      const shipmentRowId = resolved.shipmentRowId ?? null;

      if (shipmentRowId) {
        await pool.query('UPDATE shipments SET last_webhook_at = now(), updated_at = now() WHERE id = $1', [
          shipmentRowId,
        ]);
      }

      // Strict mapping: null when Delhivery reports a pair this build does not
      // recognise. Unknown statuses are recorded but never approximated —
      // guessing DELIVERED converts reserved stock to sold.
      const mapped = mapDelhiveryStatus(payload.statusType, payload.status);

      if (shipmentRowId) {
        await pool.query(
          `UPDATE shipments SET tracking_status = COALESCE($2, tracking_status),
                  provider_status_type = COALESCE($3, provider_status_type),
                  tracking_updated_at = COALESCE($4, tracking_updated_at),
                  updated_at = now()
           WHERE id = $1`,
          [
            shipmentRowId,
            payload.status,
            payload.statusType,
            payload.statusDateTime ? payload.statusDateTime.toISOString() : null,
          ]
        );
      }

      // Scan history. Idempotent at the database level, so the full list
      // Delhivery resends on every push inserts only what is new.
      const newScans = await recordTrackingEvents({
        orderId: resolved.orderId!,
        shipmentRowId,
        awb: payload.waybill,
        scans: payload.scans,
        source: 'webhook',
        providerStatus: payload.status,
        mappedStatus: mapped,
      });

      if (!mapped) {
        await finishEvent(
          claim.rowId,
          'PROCESSED',
          `Unrecognised status "${payload.statusType}/${payload.status}" — recorded, order state unchanged`
        );
        return;
      }

      // The order lifecycle moves through applyShippingStatus and nothing
      // else. That function owns the transition, the refusal to drag a
      // terminal order backwards, the COD cash-collected rule, and the
      // reservation→sold conversion through the inventory mirror.
      const changed = await applyShippingStatus({
        orderId: resolved.orderId!,
        status: mapped,
        awbCode: payload.waybill || undefined,
        courierName: 'Delhivery',
        note: payload.status ? `Courier update: ${payload.status}` : undefined,
        deliveredAt: mapped === 'DELIVERED' ? (payload.statusDateTime || new Date()).toISOString() : undefined,
      });

      await finishEvent(
        claim.rowId,
        'PROCESSED',
        changed ? undefined : `No status change; ${newScans} new scan(s) recorded`
      );
    } catch (err: any) {
      await finishEvent(claim.rowId, 'FAILED', err?.message || 'Unknown error');
      console.error('[webhook] delhivery processing failed:', err);
    }
  }
);

// ==========================================
// RECONCILIATION
// ==========================================

/**
 * Re-runs webhook events that were received but never processed.
 *
 * Webhooks are the primary path and are reliable, but not perfectly so: a
 * deploy mid-delivery, a database blip, or a bug in a handler all leave an
 * event stuck at RECEIVED or FAILED. Without a sweep, a customer's paid order
 * would sit unconfirmed until someone noticed by hand.
 *
 * Only reconciles what it can verify independently — it re-reads the order's
 * current state and the stored payload rather than trusting that the original
 * payload is still accurate.
 */
export async function reconcileStuckWebhookEvents(): Promise<{ examined: number; recovered: number }> {
  const stuck = await pool.query(
    `SELECT id, source, event_type, order_id, payload, attempt_count
     FROM webhook_events
     WHERE status IN ('RECEIVED', 'FAILED')
       AND attempt_count < 5
       AND received_at < now() - interval '2 minutes'
     ORDER BY received_at ASC
     LIMIT 50`
  );

  let recovered = 0;
  for (const row of stuck.rows) {
    try {
      if (!row.order_id) {
        await finishEvent(row.id, 'IGNORED', 'No order could be resolved');
        continue;
      }

      if (row.source === 'razorpay' && row.event_type === 'payment.captured') {
        const entity = row.payload?.payload?.payment?.entity || {};
        const paymentRes = await pool.query('SELECT amount_minor FROM payments WHERE order_id = $1 LIMIT 1', [row.order_id]);
        const expected = Number(paymentRes.rows[0]?.amount_minor);
        if (expected && Number(entity.amount) === expected) {
          await markOrderPaid({
            orderId: row.order_id,
            amountPaid: fromMinorUnits(Number(entity.amount)),
            gatewayPaymentId: entity.id,
            method: entity.method,
          });
          await finishEvent(row.id, 'PROCESSED');
          recovered++;
          continue;
        }
        await finishEvent(row.id, 'FAILED', 'Amount mismatch on replay');
        continue;
      }

      if (row.source === 'shiprocket') {
        // Shiprocket is no longer an active provider. Historical events stay in
        // the ledger for audit, but there is nothing left to replay them
        // through — and reviving a dead integration to re-apply a months-old
        // scan would be worse than leaving it recorded and closed.
        await finishEvent(row.id, 'IGNORED', 'Shiprocket integration retired; historical event left as-is');
        continue;
      }

      if (row.source === 'delhivery') {
        // Replayed through the same parser and the same strict mapping as a
        // live push, so a stored payload cannot take a more permissive path on
        // its second attempt than it would have on its first.
        const payload = parseDelhiveryScanPush(row.payload);
        if (!payload) {
          await finishEvent(row.id, 'IGNORED', 'Stored payload is not a Delhivery Scan Push body');
          continue;
        }
        const status = mapDelhiveryStatus(payload.statusType, payload.status);
        const shipmentRes = await pool.query('SELECT id FROM shipments WHERE order_id = $1 LIMIT 1', [row.order_id]);
        await recordTrackingEvents({
          orderId: row.order_id,
          shipmentRowId: shipmentRes.rows[0]?.id || null,
          awb: payload.waybill,
          scans: payload.scans,
          source: 'webhook',
          providerStatus: payload.status,
          mappedStatus: status,
        });
        if (!status) {
          await finishEvent(row.id, 'PROCESSED', `Unrecognised status "${payload.statusType}/${payload.status}" on replay`);
          recovered++;
          continue;
        }
        await applyShippingStatus({
          orderId: row.order_id,
          status,
          awbCode: payload.waybill || undefined,
          courierName: 'Delhivery',
        });
        await finishEvent(row.id, 'PROCESSED');
        recovered++;
        continue;
      }
      await finishEvent(row.id, 'IGNORED', 'No reconciliation rule for this event');
    } catch (err: any) {
      await finishEvent(row.id, 'FAILED', err?.message || 'Replay failed');
    }
  }

  return { examined: stuck.rows.length, recovered };
}

/**
 * Releases orders whose payment window has lapsed.
 *
 * An online order reserves stock at creation. Without this, one abandoned
 * checkout would hold the last unit of a product off sale permanently.
 */
export async function expirePendingPaymentOrders(): Promise<number> {
  const stale = await pool.query(
    `SELECT id FROM orders
     WHERE status = 'PENDING_PAYMENT'
       AND payment_status = 'PENDING'
       AND created_at < now() - interval '30 minutes'
     LIMIT 100`
  );

  for (const row of stale.rows) {
    // markOrderPaymentFailed refuses to touch an order the gateway has
    // meanwhile confirmed, so a payment that landed during the sweep is safe.
    await markOrderPaymentFailed({ orderId: row.id, status: 'EXPIRED', reason: 'Payment window expired' });
    await restoreOrderStock(row.id);
  }
  return stale.rows.length;
}

export default router;
