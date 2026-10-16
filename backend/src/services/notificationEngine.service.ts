import { pool } from '../db/db';

// ==========================================
// NOTIFICATION ENGINE
//
// One place that decides a customer should be told something, and one place
// that does the telling. Business code enqueues an event; channels are
// resolved, attempted and recorded here.
//
// It exists because the alternative was nineteen call sites each pairing
// notifyX(...) with sendOrderStatusEmail(...) by hand. Every one of them had
// to independently remember not to fire twice, not to fire before the write
// committed, and not to let a provider failure break the transition that
// caused it. Several forgot — payment failure and refunds told the customer
// nothing at all.
//
// Three guarantees:
//
//   * Exactly once per business event, enforced by a UNIQUE dedupe_key rather
//     than by each caller being careful.
//   * Nothing is sent inline. The event is persisted and the request returns;
//     delivery happens afterwards, so a slow SMTP round-trip cannot sit inside
//     a payment confirmation.
//   * Every attempt is recorded with the provider's own error, so a failed
//     notification is a row an admin can see rather than a console line nobody
//     read.
// ==========================================

/** Every customer-facing moment worth a message. */
export type NotificationEventType =
  | 'ORDER_PLACED'
  | 'ORDER_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'ORDER_PROCESSING'
  | 'ORDER_PACKED'
  | 'ORDER_SHIPPED'
  | 'ORDER_OUT_FOR_DELIVERY'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'REFUND_INITIATED'
  | 'REFUND_PENDING'
  | 'REFUND_COMPLETED'
  | 'REFUND_FAILED'
  // Return workflow. One per state the customer is actually told about; the
  // remaining return states are internal bookkeeping.
  | 'RETURN_REQUESTED'
  | 'RETURN_UNDER_REVIEW'
  | 'RETURN_APPROVED'
  | 'RETURN_PICKUP_SCHEDULED'
  | 'RETURN_REFUNDED'
  // Sent a couple of days after delivery (see notifyOrderStatus), skipped if
  // everything in the order has been reviewed by then.
  | 'REVIEW_REMINDER'
  // Store-facing. Fires the moment an order is persisted, for BOTH payment
  // methods — a prepaid order awaiting payment is still an order the store
  // should know exists, provided the message says so plainly.
  | 'ADMIN_NEW_ORDER'
  // The remaining store-facing moments. Kept as their own event types rather
  // than extra channels on the customer events so that a bug in recipient
  // resolution can never send a customer an internal message: the two sets
  // share no channel and no copy.
  | 'ADMIN_ORDER_PAID'
  | 'ADMIN_ORDER_DELIVERED'
  | 'ADMIN_REFUND_ISSUED';

export type NotificationChannel =
  | 'email'
  | 'whatsapp'
  | 'inapp'
  // Store-facing channels, kept separate from the customer ones so a bug in
  // recipient resolution can never send a customer an internal message or
  // the store a customer's.
  | 'admin_inapp'
  | 'admin_whatsapp';

/**
 * Everything a template may render, captured when the event happened.
 *
 * Deliberately a snapshot rather than an order id to re-read later: a retry
 * can run minutes after the fact, by which time the order may have moved on,
 * and describing a state the order is no longer in is worse than not writing.
 */
export interface NotificationPayload {
  orderNumber: string;
  customerName?: string | null;
  toEmail?: string | null;
  toPhone?: string | null;
  /** 'cod' | 'online' | legacy instrument names. Decides payment wording. */
  paymentMethod?: string;
  total?: number;
  /** Product lines, trimmed to what a message needs — never the full order. */
  items?: { name: string; quantity: number }[];
  trackingNumber?: string;
  courierName?: string;
  trackingUrl?: string;
  refundAmount?: number;
  refundStatus?: string;
  failureReason?: string;
  // --- store-facing fields ---
  /** Internal order id, for the admin deep link. Never sent to a customer. */
  orderId?: string;
  /** The order's payment status at the moment of the event, so a prepaid
   * order awaiting payment is never described as paid. */
  paymentStatus?: string;
}

export interface EnqueueInput {
  orderId: string;
  userId?: string | null;
  eventType: NotificationEventType;
  /**
   * Composed from the TRANSITION, not from the clock. `ord-123:ORDER_SHIPPED`
   * collapses a repeated admin click, a redelivered courier webhook and the
   * reconciliation sweep onto one event. Events that may legitimately recur
   * per-object add that object's id: `ord-123:REFUND_COMPLETED:rfnd-9`.
   */
  dedupeKey: string;
  payload: NotificationPayload;
  /** Defaults to every channel the event type targets. */
  channels?: NotificationChannel[];
  /** Earliest send time. Defaults to now; the worker picks the delivery up
   * once next_attempt_at has passed, so a delay needs no separate scheduler. */
  sendAt?: Date;
}

/** Which channels each event goes to. In-app is always included: it is the one
 * channel that is actually working today, and it costs nothing. */
const EVENT_CHANNELS: Record<NotificationEventType, NotificationChannel[]> = {
  ORDER_PLACED: ['inapp', 'email', 'whatsapp'],
  ORDER_CONFIRMED: ['inapp', 'email', 'whatsapp'],
  PAYMENT_FAILED: ['inapp', 'email'],
  ORDER_PROCESSING: ['inapp', 'email'],
  ORDER_PACKED: ['inapp', 'email'],
  ORDER_SHIPPED: ['inapp', 'email', 'whatsapp'],
  ORDER_OUT_FOR_DELIVERY: ['inapp', 'email', 'whatsapp'],
  ORDER_DELIVERED: ['inapp', 'email', 'whatsapp'],
  ORDER_CANCELLED: ['inapp', 'email'],
  REFUND_INITIATED: ['inapp', 'email'],
  REFUND_PENDING: ['inapp'],
  REFUND_COMPLETED: ['inapp', 'email', 'whatsapp'],
  REFUND_FAILED: ['inapp'],
  // Return updates go in-app and by email. Not WhatsApp: a return is a
  // conversation, and the reply-to on an email is somewhere a customer can
  // actually answer.
  RETURN_REQUESTED: ['inapp', 'email'],
  RETURN_UNDER_REVIEW: ['inapp', 'email'],
  RETURN_APPROVED: ['inapp', 'email'],
  RETURN_PICKUP_SCHEDULED: ['inapp', 'email'],
  RETURN_REFUNDED: ['inapp', 'email'],
  REVIEW_REMINDER: ['inapp', 'email'],
  ADMIN_NEW_ORDER: ['admin_inapp', 'admin_whatsapp'],
  // Admin in-app only. These three fired to the notification bell before the
  // outbox existed and still do; adding WhatsApp to them would multiply store
  // alerts the day a provider is connected, which is a decision to make
  // deliberately rather than inherit from a migration.
  ADMIN_ORDER_PAID: ['admin_inapp'],
  ADMIN_ORDER_DELIVERED: ['admin_inapp'],
  ADMIN_REFUND_ISSUED: ['admin_inapp'],
};

/** The retry budget one delivery gets. Exported because the admin panel shows
 * "attempt 3 of 5" and must not hardcode its own copy of the number. */
export const MAX_ATTEMPTS = 5;
/** Bounded exponential backoff: ~1m, 4m, 9m, 16m. Squared rather than
 * doubled so the early retries — which catch most transient failures — stay
 * close together without the tail running away. */
function backoffSeconds(attempt: number): number {
  return Math.min(60 * attempt * attempt, 60 * 60);
}

/**
 * Records that something happened. Does NOT send.
 *
 * Safe to call inside the same request that performed the transition: two
 * statements in one transaction, with no outbound I/O. Returns `false` when
 * the event was already recorded, which is how a caller can tell a genuine
 * transition from a replay.
 *
 * WHY A TRANSACTION. The event row and its delivery rows used to be written
 * as separate autocommitted statements. A crash, a connection reset or a
 * failing delivery INSERT in between left an event with no deliveries — and
 * an event with no deliveries is invisible: it is not PENDING, so the worker
 * never looks at it, and it is not FAILED, so it never reaches the admin
 * panel. The message is simply lost, silently, with a row in the database
 * claiming it happened. Wrapping both makes the outbox entry all-or-nothing.
 *
 * WHY ONE MULTI-ROW INSERT. The deliveries were inserted in a loop, one
 * round-trip per channel, so a three-channel event cost four queries. Against
 * a hosted Postgres the round-trip dominates. Now it is two, whatever the
 * channel count.
 */
export async function enqueueNotification(input: EnqueueInput): Promise<{ enqueued: boolean; eventId?: string }> {
  const channels = input.channels || EVENT_CHANNELS[input.eventType] || ['inapp'];
  const eventId = 'nev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO notification_events (id, order_id, user_id, event_type, dedupe_key, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [eventId, input.orderId, input.userId || null, input.eventType, input.dedupeKey, JSON.stringify(input.payload)]
    );

    // Already recorded by an earlier delivery of the same business event.
    if (inserted.rows.length === 0) {
      await client.query('ROLLBACK');
      return { enqueued: false };
    }

    if (channels.length > 0) {
      // One VALUES list rather than one statement per channel.
      const values = channels
        .map((_, i) => `($${i * 2 + 1}, $${channels.length * 2 + 1}, $${i * 2 + 2}, 'PENDING', $${channels.length * 2 + 2})`)
        .join(', ');
      const params: any[] = [];
      channels.forEach((channel, i) => {
        params.push('nd-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 8), channel);
      });
      params.push(eventId, input.sendAt || new Date());

      await client.query(
        `INSERT INTO notification_deliveries (id, event_id, channel, status, next_attempt_at)
         VALUES ${values}
         ON CONFLICT (event_id, channel) DO NOTHING`,
        params
      );
    }

    await client.query('COMMIT');
    return { enqueued: true, eventId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** What a channel adapter must answer. `skip` means "deliberately not sent" —
 * unconfigured, opted out, no address — and is terminal without being a
 * failure. */
export interface ChannelResult {
  ok: boolean;
  skip?: boolean;
  reason?: string;
  /** False for a permanent refusal, so the worker stops rather than burning
   * five attempts on something that will never succeed. */
  retryable?: boolean;
}

export type ChannelSender = (payload: NotificationPayload, eventType: NotificationEventType) => Promise<ChannelResult>;

const channelSenders = new Map<NotificationChannel, ChannelSender>();

/** Channels register themselves rather than being imported here, so the engine
 * has no dependency on any particular provider. */
export function registerChannel(channel: NotificationChannel, sender: ChannelSender): void {
  channelSenders.set(channel, sender);
}

/** How many deliveries are attempted at once.
 *
 * The worker used to await each delivery in turn. That is fine while every
 * channel is a local INSERT, and badly wrong the moment a real one is
 * connected: an SMTP round-trip is ~300ms, so a batch of 50 took fifteen
 * seconds of mostly-idle waiting, and a single provider timing out at 30s
 * stalled the other forty-nine behind it.
 *
 * Six at a time, not fifty: these are outbound provider calls, and most
 * transactional mail providers rate-limit well below fifty concurrent
 * connections. The point is to stop one slow send blocking the queue, not to
 * flood the provider.
 */
const DELIVERY_CONCURRENCY = 6;

/**
 * Attempts everything that is due. Called after a transition commits, and by
 * a periodic sweep for anything that failed transiently.
 *
 * Each delivery is claimed with a conditional UPDATE before it is attempted,
 * so two concurrent workers cannot send the same message twice. That claim is
 * also what makes the bounded concurrency below safe — the workers share no
 * state, they race for rows.
 */
export async function processPendingNotifications(limit = 50): Promise<{ attempted: number; sent: number; failed: number }> {
  const due = await pool.query(
    `SELECT d.id, d.channel, d.attempts, e.event_type, e.payload
     FROM notification_deliveries d
     JOIN notification_events e ON e.id = d.event_id
     WHERE d.status = 'PENDING'
       AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
     ORDER BY d.created_at ASC
     LIMIT $1`,
    [limit]
  );

  let sent = 0;
  let failed = 0;
  let attempted = 0;

  const attemptOne = async (row: any) => {
    // Claim it, by taking a LEASE.
    //
    // This used to be `WHERE id = $1 AND status = 'PENDING'`, which claimed
    // nothing at all: the row stays PENDING for the whole attempt, so a
    // second worker's identical UPDATE matched too and the same message went
    // out twice. Four concurrent processors sent it four times.
    //
    // The lease pushes next_attempt_at into the future and requires it to be
    // due, so the second worker's WHERE no longer matches and it moves on.
    // Deliberately reusing the existing due-ness column rather than adding a
    // 'SENDING' status: a status would leak a transient internal state into
    // the admin panel, and would strand rows forever if the process died
    // mid-send. A lease simply expires — a delivery abandoned by a crashed
    // worker becomes due again on its own, with no reaper to write.
    //
    // Five minutes is far longer than any provider call should take and far
    // shorter than the shortest retry the customer would notice.
    const claim = await pool.query(
      `UPDATE notification_deliveries
       SET attempts = attempts + 1,
           total_attempts = total_attempts + 1,
           last_attempt_at = now(),
           updated_at = now(),
           next_attempt_at = now() + interval '5 minutes'
       WHERE id = $1
         AND status = 'PENDING'
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       RETURNING attempts`,
      [row.id]
    );
    // Lost the race — another worker holds the lease on this delivery.
    if (claim.rows.length === 0) return;
    attempted++;

    const attemptNo = Number(claim.rows[0].attempts);
    const sender = channelSenders.get(row.channel as NotificationChannel);

    let result: ChannelResult;
    if (!sender) {
      result = { ok: false, skip: true, reason: `No sender registered for channel '${row.channel}'.` };
    } else {
      try {
        result = await sender(row.payload as NotificationPayload, row.event_type as NotificationEventType);
      } catch (err: any) {
        // A throwing adapter is a bug, not a provider refusal — treated as
        // retryable so a transient crash does not permanently drop a message.
        result = { ok: false, retryable: true, reason: err?.message || 'Channel threw.' };
      }
    }

    if (result.skip) {
      await pool.query(
        `UPDATE notification_deliveries
         SET status = 'SKIPPED', last_error = $2, next_attempt_at = NULL, updated_at = now()
         WHERE id = $1`,
        [row.id, (result.reason || 'Skipped.').slice(0, 1000)]
      );
      return;
    }

    if (result.ok) {
      await pool.query(
        `UPDATE notification_deliveries
         SET status = 'SENT', sent_at = now(), last_error = NULL, next_attempt_at = NULL, updated_at = now()
         WHERE id = $1`,
        [row.id]
      );
      sent++;
      return;
    }

    const giveUp = result.retryable === false || attemptNo >= MAX_ATTEMPTS;
    if (giveUp) {
      await pool.query(
        `UPDATE notification_deliveries
         SET status = 'FAILED', last_error = $2, next_attempt_at = NULL, updated_at = now()
         WHERE id = $1`,
        [row.id, (result.reason || 'Delivery failed.').slice(0, 1000)]
      );
      failed++;
    } else {
      await pool.query(
        `UPDATE notification_deliveries
         SET status = 'PENDING', last_error = $2,
             next_attempt_at = now() + ($3 || ' seconds')::interval,
             updated_at = now()
         WHERE id = $1`,
        [row.id, (result.reason || 'Delivery failed.').slice(0, 1000), String(backoffSeconds(attemptNo))]
      );
    }
  };

  // A fixed pool of workers pulling from one shared cursor. Each claims its
  // own row, so a worker that loses the race simply moves to the next.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(DELIVERY_CONCURRENCY, due.rows.length) }, async () => {
    for (;;) {
      const row = due.rows[cursor++];
      if (!row) return;
      // One delivery must never take the batch down with it; every failure
      // mode is already recorded on the row by attemptOne itself.
      try {
        await attemptOne(row);
      } catch (err) {
        console.error('[notifications] delivery attempt crashed outside the adapter:', err);
      }
    }
  });
  await Promise.all(workers);

  return { attempted, sent, failed };
}

/** Every status a delivery row may hold. Used to validate admin filters, so an
 * unknown value is rejected rather than silently matching nothing. */
export const DELIVERY_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  'email',
  'whatsapp',
  'inapp',
  'admin_inapp',
  'admin_whatsapp',
];

export interface DeliveryRecord {
  id: string;
  eventId: string;
  channel: string;
  eventType: string;
  orderId: string | null;
  orderNumber: string | null;
  /** Masked. Never the full address or number — see maskRecipient. */
  recipient: string | null;
  status: DeliveryStatus;
  /** Attempts against the CURRENT budget, i.e. since the last requeue. */
  attempts: number;
  /** Cumulative across every requeue. Survives Retry; see migration 019. */
  totalAttempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  requeuedAt: string | null;
  requeuedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Whether Retry would do anything, and if not, why. Resolved server-side so
   * the UI never has to re-implement the policy. */
  canRetry: boolean;
  retryBlockedReason: string | null;
}

/**
 * Hides most of a recipient while leaving enough to recognise it.
 *
 * An operator diagnosing "did this reach the right person" needs to tell one
 * customer's address from another's; they do not need the address itself, and
 * a notifications screen is a far wider audience than the order record. So:
 * first two characters of the local part, the domain, and the last two digits
 * of a phone number.
 */
export function maskRecipient(value: string | null | undefined): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;

  if (raw.includes('@')) {
    const [local, domain] = raw.split('@');
    const head = local.slice(0, 2);
    return `${head}${'•'.repeat(Math.max(3, local.length - 2))}@${domain}`;
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return '•'.repeat(digits.length || 3);
  return `${raw.startsWith('+') ? '+' : ''}${digits.slice(0, 2)}${'•'.repeat(Math.max(3, digits.length - 4))}${digits.slice(-2)}`;
}

/**
 * Why a channel cannot currently deliver, independent of any one message.
 *
 * Registered by the channel module rather than known here, because the engine
 * deliberately has no idea which providers exist. Its purpose is the Retry
 * button: re-queueing a WhatsApp delivery while no provider is configured
 * spends an attempt to arrive back at exactly the same SKIPPED row, so the
 * backend refuses and says precisely what is missing instead.
 */
export type ChannelBlockProbe = () => Promise<string | null>;
const channelBlocks = new Map<NotificationChannel, ChannelBlockProbe>();

export function registerChannelBlockProbe(channel: NotificationChannel, probe: ChannelBlockProbe): void {
  channelBlocks.set(channel, probe);
}

async function blockedReasonFor(channel: string): Promise<string | null> {
  const probe = channelBlocks.get(channel as NotificationChannel);
  if (!probe) return null;
  try {
    return await probe();
  } catch {
    // A broken probe must not make a retryable delivery look blocked.
    return null;
  }
}

export interface ListDeliveriesOptions {
  status?: DeliveryStatus | 'ALL';
  channel?: NotificationChannel | 'ALL';
  /** Matches order number or event type. */
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * The admin panel's view of the outbox.
 *
 * Lists FAILED and PENDING side by side on purpose: a delivery stuck at
 * "attempt 4 of 5, next try in 16 minutes" is the one an operator most wants
 * to see, and it is not FAILED yet. Showing only terminal failures would mean
 * the panel goes quiet exactly while something is going wrong.
 */
export async function listNotificationDeliveries(
  opts: ListDeliveriesOptions = {}
): Promise<{ deliveries: DeliveryRecord[]; total: number; page: number; pageSize: number; counts: Record<string, number> }> {
  const page = Math.max(1, Math.floor(opts.page || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize || 20)));

  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.status && opts.status !== 'ALL') {
    params.push(opts.status);
    conditions.push(`d.status = $${params.length}`);
  }
  if (opts.channel && opts.channel !== 'ALL') {
    params.push(opts.channel);
    conditions.push(`d.channel = $${params.length}`);
  }
  const search = (opts.search || '').trim();
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const i = params.length;
    conditions.push(`(LOWER(COALESCE(o.order_number, '')) LIKE $${i} OR LOWER(e.event_type) LIKE $${i})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRes = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM notification_deliveries d
     JOIN notification_events e ON e.id = d.event_id
     LEFT JOIN orders o ON o.id = e.order_id
     ${where}`,
    params
  );

  params.push(pageSize, (page - 1) * pageSize);
  const res = await pool.query(
    `${DELIVERY_SELECT}
     ${where}
     ORDER BY d.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  // Status tallies for the filter chips, over the whole table rather than the
  // current page — "3 failed" must not mean "3 failed on page 2 of 7".
  const countRes = await pool.query(`SELECT status, COUNT(*)::int AS n FROM notification_deliveries GROUP BY status`);
  const counts: Record<string, number> = {};
  for (const r of countRes.rows) counts[r.status] = Number(r.n);

  // One probe per distinct channel on the page, not one per row.
  const blockCache = new Map<string, string | null>();
  for (const channel of new Set(res.rows.map((r) => r.channel))) {
    blockCache.set(channel, await blockedReasonFor(channel));
  }

  const deliveries: DeliveryRecord[] = res.rows.map((r) => toDeliveryRecord(r, blockCache.get(r.channel) || null));

  return { deliveries, total: Number(totalRes.rows[0].n), page, pageSize, counts };
}

/** The columns listNotificationDeliveries and getNotificationDelivery share. */
const DELIVERY_SELECT = `
  SELECT d.id, d.event_id, d.channel, d.status, d.attempts, d.total_attempts,
         d.last_error, d.last_attempt_at, d.next_attempt_at, d.sent_at,
         d.requeued_at, d.requeued_by, d.created_at, d.updated_at,
         e.event_type, e.order_id, e.payload,
         o.order_number
  FROM notification_deliveries d
  JOIN notification_events e ON e.id = d.event_id
  LEFT JOIN orders o ON o.id = e.order_id`;

function toDeliveryRecord(r: any, blocked: string | null): DeliveryRecord {
  const payload = (r.payload || {}) as NotificationPayload;

  // Admin-facing channels go to the store, not to a customer, so there is no
  // customer contact to show or to leak.
  const isAdminChannel = String(r.channel).startsWith('admin_');
  const rawRecipient = isAdminChannel
    ? null
    : r.channel === 'email'
    ? payload.toEmail
    : r.channel === 'whatsapp'
    ? payload.toPhone
    : null;

  const terminal = r.status === 'FAILED' || r.status === 'SKIPPED';

  return {
    id: r.id,
    eventId: r.event_id,
    channel: r.channel,
    eventType: r.event_type,
    orderId: r.order_id,
    orderNumber: r.order_number || null,
    recipient: maskRecipient(rawRecipient),
    status: r.status as DeliveryStatus,
    attempts: Number(r.attempts),
    totalAttempts: Number(r.total_attempts),
    maxAttempts: MAX_ATTEMPTS,
    lastError: r.last_error,
    lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at).toISOString() : null,
    nextAttemptAt: r.next_attempt_at ? new Date(r.next_attempt_at).toISOString() : null,
    sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    requeuedAt: r.requeued_at ? new Date(r.requeued_at).toISOString() : null,
    requeuedBy: r.requeued_by || null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    canRetry: terminal && !blocked,
    retryBlockedReason: !terminal
      ? r.status === 'SENT'
        ? 'Already delivered.'
        : 'Already queued — the worker will attempt it automatically.'
      : blocked,
  };
}

/** One delivery, for reporting the outcome straight after a retry. */
export async function getNotificationDelivery(deliveryId: string): Promise<DeliveryRecord | null> {
  const res = await pool.query(`${DELIVERY_SELECT} WHERE d.id = $1`, [deliveryId]);
  if (res.rows.length === 0) return null;
  return toDeliveryRecord(res.rows[0], await blockedReasonFor(res.rows[0].channel));
}

/** Failed deliveries only. Kept as the narrow convenience over the general
 * listing above rather than a second query against the same tables. */
export async function listFailedNotifications(limit = 100): Promise<DeliveryRecord[]> {
  const { deliveries } = await listNotificationDeliveries({ status: 'FAILED', pageSize: Math.min(100, limit) });
  return deliveries;
}

export interface RetryResult {
  ok: boolean;
  error?: string;
  /** True when the channel itself cannot deliver — a configuration problem the
   * operator must fix first, not a transient failure worth re-queueing. */
  blocked?: boolean;
  /** The delivery's status after the call, for the UI to report honestly. */
  status?: DeliveryStatus;
}

/**
 * Puts a terminal delivery back in the queue. Does NOT send, and cannot mark
 * anything delivered — only the worker, via the provider, decides that.
 *
 * `attempts` resets so the operator gets a full budget again: the usual reason
 * to press Retry is that the underlying cause (bad SMTP password, missing
 * template) has just been fixed, which the previous attempts could not have
 * known. `total_attempts` does not reset, so the history survives.
 *
 * The WHERE clause doubles as the concurrency guard. Two admins pressing Retry
 * at the same moment both run this UPDATE; the first moves the row to PENDING,
 * the second matches nothing because PENDING is not in the terminal set, and
 * is told the delivery is already queued. No lock, no double send.
 */
export async function retryNotification(deliveryId: string, actor?: string | null): Promise<RetryResult> {
  const id = String(deliveryId || '').trim();
  if (!id || id.length > 100) return { ok: false, error: 'Invalid delivery id.' };

  const existing = await pool.query(`SELECT id, channel, status FROM notification_deliveries WHERE id = $1`, [id]);
  if (existing.rows.length === 0) return { ok: false, error: 'No notification delivery with that id.' };

  const row = existing.rows[0];
  if (row.status === 'SENT') {
    return { ok: false, error: 'This notification was already delivered.', status: 'SENT' };
  }
  if (row.status === 'PENDING') {
    return {
      ok: false,
      error: 'This notification is already queued — the worker will attempt it automatically.',
      status: 'PENDING',
    };
  }

  // Refuse an impossible send rather than spending an attempt to rediscover
  // that the channel has no provider behind it.
  const blocked = await blockedReasonFor(row.channel);
  if (blocked) return { ok: false, blocked: true, error: blocked, status: row.status };

  const res = await pool.query(
    `UPDATE notification_deliveries
     SET status = 'PENDING', attempts = 0, next_attempt_at = now(),
         requeued_at = now(), requeued_by = $2, updated_at = now()
     WHERE id = $1 AND status IN ('FAILED', 'SKIPPED')
     RETURNING id`,
    [id, actor || null]
  );
  // Lost the race against another admin between the read and the update.
  if (res.rows.length === 0) {
    return { ok: false, error: 'This notification is already queued — another admin just retried it.', status: 'PENDING' };
  }
  return { ok: true, status: 'PENDING' };
}

/** Test seam: drops registered channels so a suite can install its own. */
export function resetChannelsForTest(): void {
  channelSenders.clear();
  channelBlocks.clear();
}
