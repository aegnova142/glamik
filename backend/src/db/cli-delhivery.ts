/**
 * Delhivery configuration check.
 *
 *   npm run delhivery:check
 *
 * Answers one question before anyone flips DELHIVERY_LIVE_MODE on: will this
 * configuration actually work? Read-only — it looks up a pincode and nothing
 * else. No waybill is drawn, no shipment created, no pickup booked.
 *
 * Runs against the real API deliberately: whether the token is the right one
 * is exactly what a mock cannot tell you.
 *
 * Exits non-zero if anything required is missing or rejected, so it can gate a
 * deploy step.
 */
import crypto from 'crypto';
import { env } from '../config/env';
import { httpJson } from '../services/http.client';

const sha = (v: string): string => crypto.createHash('sha256').update(v).digest('hex').slice(0, 12);

let failures = 0;
let warnings = 0;
const ok = (l: string, d = '') => console.log(`  OK    ${l.padEnd(32)}${d}`);
const fail = (l: string, d = '') => { failures++; console.log(`  FAIL  ${l.padEnd(32)}${d}`); };
const warn = (l: string, d = '') => { warnings++; console.log(`  WARN  ${l.padEnd(32)}${d}`); };

async function main(): Promise<void> {
  console.log('\nDelhivery configuration check');
  console.log('='.repeat(76));
  console.log('  Read-only: looks up one pincode. Creates nothing.');
  console.log('='.repeat(76));

  console.log('\n1. Configuration');
  const token = env.delhivery.apiToken;
  // Never printed — only presence, length and a hash prefix, which is enough
  // to confirm two machines hold the same value.
  token ? ok('DELHIVERY_TOKEN', `[set, ${token.length} chars, sha ${sha(token)}]`) : fail('DELHIVERY_TOKEN', 'not set');
  ok('DELHIVERY_BASE_URL', env.delhivery.baseUrl);
  env.delhivery.pickupLocation
    ? ok('DELHIVERY_PICKUP_NAME', `"${env.delhivery.pickupLocation}"`)
    : fail('DELHIVERY_PICKUP_NAME', 'not set — shipment creation cannot work without it');
  ok('DELHIVERY_SELLER_NAME', env.delhivery.sellerName);
  env.delhivery.sellerAddress ? ok('DELHIVERY_SELLER_ADDRESS', '[set]') : warn('DELHIVERY_SELLER_ADDRESS', 'not set — the label will carry no return address');
  env.delhivery.webhookSecret
    ? ok('DELHIVERY_WEBHOOK_SECRET', `[set, sha ${sha(env.delhivery.webhookSecret)}]`)
    : warn('DELHIVERY_WEBHOOK_SECRET', 'not set — the Scan Push endpoint will reject every delivery');
  ok('DELHIVERY_LIVE_MODE', String(env.delhivery.liveMode));
  console.log(`  ${env.delhivery.enabled ? 'OK   ' : 'WARN '} effective mode${' '.repeat(18)}${env.delhivery.enabled ? 'LIVE — real shipments will be created' : 'MOCK — no real shipment, waybill or pickup'}`);
  if (!env.delhivery.enabled) warnings++;

  // The warehouse name cannot be verified from here: reading the account's
  // pickup list is a Settings-scope call this integration deliberately does
  // not make. The only other place it is validated is shipment creation, and
  // checking it that way would mean creating a real parcel.
  warn('warehouse name', 'cannot be verified without creating a shipment — check it by hand');
  console.log('        Delhivery One -> Settings -> Warehouses. It must match exactly,');
  console.log('        case and spaces included, or create.json rejects every shipment.');

  if (!token) {
    console.log('\n' + '='.repeat(76));
    console.log('  Cannot continue without a token.\n');
    process.exit(1);
  }

  console.log('\n2. Pincode serviceability (live, read-only)');
  const pin = process.argv[2] && /^\d{6}$/.test(process.argv[2]) ? process.argv[2] : '110001';
  const res = await httpJson<any>(`${env.delhivery.baseUrl}/c/api/pin-codes/json/?filter_codes=${pin}`, {
    headers: { Authorization: `Token ${token}` },
    timeoutMs: 20000,
    attempts: 1,
  });

  if (!res.ok) {
    fail('serviceability lookup', `HTTP ${res.status} — ${res.error}`);
    console.log('\n        A 401 here means the token is wrong or revoked.');
    console.log('        Delhivery One -> Settings -> API Setup -> Existing API Token.');
  } else {
    const codes = res.data?.delivery_codes || [];
    if (codes.length === 0) {
      warn('serviceability', `${pin} is not serviceable (empty response)`);
    } else {
      const p = codes[0]?.postal_code || {};
      const remark = (p.remarks || '').trim();
      ok('token accepted', `${pin} -> ${p.city || '?'}, ${p.state_code || '?'}`);
      remark
        ? warn('remark', `"${remark}"${/embargo/i.test(remark) ? ' — temporarily unserviceable' : ''}`)
        : ok('remark', 'blank — serviceable');
      ok('payment modes', `COD=${p.cod || '?'}  prepaid=${p.pre_paid || '?'}`);
    }
  }

  console.log('\n' + '='.repeat(76));
  if (failures > 0) {
    console.log(`  RESULT: ${failures} failure(s), ${warnings} warning(s) — not ready to go live.\n`);
    process.exit(1);
  }
  console.log(`  RESULT: credentials work. ${warnings} warning(s) above.`);
  console.log('  Confirm the warehouse name, then set DELHIVERY_LIVE_MODE=true.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nCheck failed:', err?.message || err);
  process.exit(1);
});
