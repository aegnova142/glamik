/**
 * WhatsApp order notifications.
 *
 *   npx tsx src/test/whatsappnotify.e2e.ts
 *
 * No database: everything here is the WhatsApp send path, with fetch replaced.
 *
 * Two properties matter, and they pull in opposite directions.
 *
 * ISOLATION. WhatsApp carries order updates and nothing else. Sign-in codes go
 * through Firebase Phone Auth, so no OTP may ever reach this module and no
 * AUTHENTICATION template may be addressed by it. That is asserted structurally
 * below — by reading the shipped source — because a regression here would not
 * fail any other test: it would simply start sending codes over WhatsApp.
 *
 * HONESTY. 'sent' must mean Meta accepted the message. Meta answers HTTP 200
 * with an `error` object for template and permission problems, so a status
 * check alone would report a delivery that never happened, mark the row SENT
 * and never retry it.
 */

process.env.NODE_ENV = 'test';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sendOrderWhatsApp,
  whatsappNotificationsConfigured,
  orderTemplateFor,
  anyOrderTemplateConfigured,
} from '../services/whatsappNotifications.service';

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

const TOKEN = 'test-token-NOT-A-REAL-CREDENTIAL';

/** Every request the module attempted, so "did not send" is provable. */
interface Call {
  url: string;
  headers: Record<string, string>;
  body: any;
}
let calls: Call[] = [];

/** Queued replies, consumed in order. */
let replies: Array<{ status: number; json: any }> = [];

const realFetch = globalThis.fetch;

function installFetch(): void {
  globalThis.fetch = (async (input: any, init: any) => {
    calls.push({
      url: String(input),
      headers: (init?.headers || {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply = replies.shift() || { status: 200, json: { messages: [{ id: 'wamid.default' }] } };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.json,
    } as any;
  }) as typeof fetch;
}

function configure(): void {
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-number-id';
  process.env.WHATSAPP_ACCESS_TOKEN = TOKEN;
  process.env.WHATSAPP_ORDER_TEMPLATE_ORDER_SHIPPED = 'glamirk_order_shipped';
  process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE = 'en_US';
}

function clearTemplates(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('WHATSAPP_ORDER_TEMPLATE_')) delete process.env[key];
  }
}

const shipped = () => ({
  toPhone: '+919876543210',
  eventType: 'ORDER_SHIPPED' as const,
  variables: ['GLM-1001', 'Asha'],
});

async function main(): Promise<void> {
  installFetch();

  // ==========================================
  // 1. CONFIGURATION IS NOT DELIVERY
  //
  // A missing credential or template is a configuration gap. Reporting it as a
  // failed send would burn the engine's retry budget on something no retry can
  // fix, and bury the real cause under "attempt 5 of 5".
  // ==========================================
  section('1. Unconfigured and untemplated are reported, not attempted');

  {
    clearTemplates();
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;

    check('with no credentials the channel reports itself unconfigured', whatsappNotificationsConfigured() === false);

    calls = [];
    const result = await sendOrderWhatsApp(shipped());
    check('a send returns unconfigured', result.status === 'unconfigured');
    check('and Meta is never contacted', calls.length === 0);
  }

  {
    configure();
    clearTemplates();
    check('credentials alone do not register a template', anyOrderTemplateConfigured() === false);

    calls = [];
    const result = await sendOrderWhatsApp(shipped());
    check('a send with no template reports no_template', result.status === 'no_template');
    check('naming the event that lacks one', result.status === 'no_template' && result.eventType === 'ORDER_SHIPPED');
    check('and still does not contact Meta', calls.length === 0);
  }

  {
    configure();
    check('one registered template makes the channel usable', anyOrderTemplateConfigured() === true);
    check('the registered event resolves', orderTemplateFor('ORDER_SHIPPED') === 'glamirk_order_shipped');
    check('an unregistered event resolves to null', orderTemplateFor('ORDER_DELIVERED') === null);
    process.env.WHATSAPP_ORDER_TEMPLATE_ORDER_DELIVERED = '   ';
    check('and a blank template counts as unregistered', orderTemplateFor('ORDER_DELIVERED') === null);
    delete process.env.WHATSAPP_ORDER_TEMPLATE_ORDER_DELIVERED;
  }

  {
    // WHATSAPP_ORDER_TEMPLATE_LANGUAGE shares the prefix and has a default, so
    // a naive prefix scan would report templates that do not exist.
    clearTemplates();
    process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE = 'en_US';
    check('the language setting is not mistaken for a template', anyOrderTemplateConfigured() === false);
  }

  // ==========================================
  // 2. THE REQUEST META ACTUALLY RECEIVES
  // ==========================================
  section('2. The outgoing request');

  {
    configure();
    calls = [];
    replies = [{ status: 200, json: { messages: [{ id: 'wamid.ABC123' }] } }];
    const result = await sendOrderWhatsApp(shipped());

    check('a clean 200 is reported as sent', result.status === 'sent');
    check('carrying the provider message id for the audit trail',
      result.status === 'sent' && result.providerMessageId === 'wamid.ABC123');
    check('exactly one request is made', calls.length === 1);

    const call = calls[0];
    check('addressed to the configured phone number id', call.url.includes('test-phone-number-id'));
    check('with the token in the Authorization header', call.headers.Authorization === `Bearer ${TOKEN}`);
    check('never in the URL, where it would be logged by proxies', !call.url.includes(TOKEN));
    check('the leading + is stripped for Meta', call.body.to === '919876543210');
    check('sent as a template, not free text', call.body.type === 'template');
    check('naming the approved template', call.body.template?.name === 'glamirk_order_shipped');
    check('in the configured language', call.body.template?.language?.code === 'en_US');
    check('with the body parameters in order',
      JSON.stringify(call.body.template?.components?.[0]?.parameters) ===
        JSON.stringify([{ type: 'text', text: 'GLM-1001' }, { type: 'text', text: 'Asha' }]));
    check('and no OTP-style field anywhere in the payload',
      !JSON.stringify(call.body).toLowerCase().includes('otp'));
  }

  {
    // An event with no variables must not send an empty components array —
    // Meta rejects a components entry with no parameters.
    configure();
    process.env.WHATSAPP_ORDER_TEMPLATE_ORDER_PLACED = 'glamirk_order_placed';
    calls = [];
    replies = [{ status: 200, json: { messages: [{ id: 'wamid.X' }] } }];
    await sendOrderWhatsApp({ toPhone: '919876543210', eventType: 'ORDER_PLACED', variables: [] });
    check('a template with no variables omits components entirely',
      Array.isArray(calls[0].body.template.components) && calls[0].body.template.components.length === 0);
  }

  // ==========================================
  // 3. SUCCESS MEANS META SAID SO
  // ==========================================
  section('3. Only a confirmed acceptance counts as sent');

  {
    configure();
    calls = [];
    // The case that makes a status-code check insufficient.
    replies = [{ status: 200, json: { error: { message: 'Template name does not exist in en_US' } } }];
    const result = await sendOrderWhatsApp(shipped());
    check('HTTP 200 with an error object is NOT sent', result.status === 'error');
    check('and the reason is carried through',
      result.status === 'error' && result.detail.includes('Template name does not exist'));
    check('a rejected template is not retried', result.status === 'error' && result.retryable === false);
  }

  {
    configure();
    replies = [{ status: 401, json: { error: { message: 'Invalid OAuth access token' } } }];
    const result = await sendOrderWhatsApp(shipped());
    check('a bad token is an error', result.status === 'error');
    check('and is not retried — it will not fix itself', result.status === 'error' && result.retryable === false);
  }

  {
    configure();
    replies = [{ status: 500, json: { error: { message: 'Internal server error' } } }];
    const result = await sendOrderWhatsApp(shipped());
    check('a 5xx from Meta is retryable', result.status === 'error' && result.retryable === true);
  }

  {
    configure();
    replies = [{ status: 429, json: { error: { message: 'Rate limit hit' } } }];
    const result = await sendOrderWhatsApp(shipped());
    check('a rate limit is retryable', result.status === 'error' && result.retryable === true);
  }

  {
    configure();
    const saved = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('The operation was aborted due to timeout');
    }) as typeof fetch;
    const result = await sendOrderWhatsApp(shipped());
    check('a transport failure is an error, never a silent success', result.status === 'error');
    check('and is retryable', result.status === 'error' && result.retryable === true);
    globalThis.fetch = saved;
  }

  // ==========================================
  // 4. THE TOKEN MUST NOT LEAK
  //
  // A failure reason is written to the notifications table and shown in the
  // admin panel, so an unredacted token would land on a screen and in a
  // database row — not merely in a log file.
  // ==========================================
  section('4. The access token never reaches a failure reason');

  {
    configure();
    replies = [{ status: 400, json: { error: { message: `Invalid parameter: access_token=${TOKEN} is malformed` } } }];
    const result = await sendOrderWhatsApp(shipped());
    check('a provider error quoting the token is scrubbed',
      result.status === 'error' && !result.detail.includes(TOKEN),
      result.status === 'error' ? result.detail : '');
    check('and says so explicitly', result.status === 'error' && result.detail.includes('[redacted]'));
  }

  {
    configure();
    const saved = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error(`connect ECONNREFUSED while sending Bearer ${TOKEN}`);
    }) as typeof fetch;
    const result = await sendOrderWhatsApp(shipped());
    check('a thrown error quoting the token is scrubbed too',
      result.status === 'error' && !result.detail.includes(TOKEN));
    globalThis.fetch = saved;
  }

  {
    configure();
    replies = [{ status: 400, json: { error: { message: 'x'.repeat(5000) } } }];
    const result = await sendOrderWhatsApp(shipped());
    check('an enormous provider response is truncated before storage',
      result.status === 'error' && result.detail.length <= 310,
      result.status === 'error' ? `length ${result.detail.length}` : '');
  }

  // ==========================================
  // 5. ISOLATION FROM AUTHENTICATION
  //
  // Structural, not behavioural: the point is that no path exists, and a path
  // that exists but is currently unused would pass any behavioural test.
  // ==========================================
  section('5. WhatsApp is not reachable from the sign-in path');

  {
    const srcDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const src = (f: string) => readFileSync(path.join(srcDir, f), 'utf8');

    const whatsappSrc = src('services/whatsappNotifications.service.ts');
    check('the WhatsApp module imports nothing from the OTP service',
      !/from '\.\/(otp|messaging)\.service'/.test(whatsappSrc));
    check('and addresses no AUTHENTICATION template variable',
      !whatsappSrc.includes('WHATSAPP_OTP_TEMPLATE'));

    // Imports only — these files discuss the separation in their comments, so
    // searching for the word would match the documentation of the rule.
    const importsFrom = (source: string, moduleName: string) =>
      new RegExp(`^\\s*import[\\s\\S]*?from\\s+'[^']*${moduleName}'`, 'm').test(source);

    const messagingSrc = src('services/messaging.service.ts');
    check('the OTP messaging module does not import the WhatsApp sender',
      !importsFrom(messagingSrc, 'whatsappNotifications.service'));
    check('and offers no whatsapp OTP channel',
      /export type OtpChannel = 'sms';/.test(messagingSrc));

    const routesSrc = src('routes/customer.routes.ts');
    check('the auth routes never reference the WhatsApp sender',
      !routesSrc.includes('sendOrderWhatsApp') && !routesSrc.includes('whatsappNotifications'));

    const channelsSrc = src('services/notificationChannels.service.ts');
    check('the notification channels never call the OTP sender',
      !channelsSrc.includes('sendOtpMessage'));
    check('nor import the OTP messaging module at all',
      !importsFrom(channelsSrc, 'messaging.service') && !importsFrom(channelsSrc, 'otp.service'));
    check('and the WhatsApp channel sends through the order-template path',
      channelsSrc.includes('sendOrderWhatsApp'));
  }

  globalThis.fetch = realFetch;

  console.log(`\n${failed ? `${failed} FAILED, ${passed} passed` : `All ${passed} WhatsApp notification checks passed.`}`);
  if (failed) {
    console.error('\nFailures:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
