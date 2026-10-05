/**
 * Shiprocket configuration check.
 *
 *   npm run shiprocket:check
 *
 * Answers one question before anyone flips SHIPROCKET_LIVE_MODE on: will this
 * configuration actually work? It is read-only — it authenticates and asks for a
 * courier quote, and that is all. No order is created, no AWB is bought, no
 * pickup is scheduled, nothing is written to the database.
 *
 * Runs against the real Shiprocket API deliberately: the point is to find out
 * whether the credentials in .env are the right ones, which a mock cannot tell
 * you. It stays within the Orders/Shipments/Courier permissions the API user is
 * meant to have, and never touches Settings or Listings.
 *
 * Exits non-zero if anything required is missing or rejected, so it can gate a
 * deploy step.
 */
import crypto from 'crypto';
import { env } from '../config/env';
import { httpJson } from '../services/http.client';

/** Enough to confirm two machines hold the same secret, without printing it. */
const sha = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);

let failures = 0;
let warnings = 0;

function ok(label: string, detail = ''): void {
  console.log(`  OK    ${label.padEnd(34)}${detail}`);
}
function fail(label: string, detail = ''): void {
  failures++;
  console.log(`  FAIL  ${label.padEnd(34)}${detail}`);
}
function warn(label: string, detail = ''): void {
  warnings++;
  console.log(`  WARN  ${label.padEnd(34)}${detail}`);
}

async function main(): Promise<void> {
  console.log('\nShiprocket configuration check');
  console.log('='.repeat(74));
  console.log('  Read-only: logs in and asks for a quote. Creates nothing.');
  console.log('='.repeat(74));

  // ------------------------------------------
  console.log('\n1. Configuration');
  // ------------------------------------------
  const email = env.shiprocket.email;
  const password = env.shiprocket.password;
  const pincode = env.shiprocket.pickupPincode;

  // Secrets are never printed — only whether they are present, their length,
  // and a hash prefix, which is enough to confirm two machines agree.
  email ? ok('SHIPROCKET_EMAIL', email) : fail('SHIPROCKET_EMAIL', 'not set');
  password
    ? ok('SHIPROCKET_PASSWORD', `[set, ${password.length} chars, sha ${sha(password)}]`)
    : fail('SHIPROCKET_PASSWORD', 'not set');
  pincode && /^\d{6}$/.test(pincode)
    ? ok('SHIPROCKET_PICKUP_PINCODE', pincode)
    : fail('SHIPROCKET_PICKUP_PINCODE', pincode ? `not 6 digits: ${pincode}` : 'not set');
  ok('SHIPROCKET_BASE_URL', env.shiprocket.baseUrl);
  env.shiprocket.webhookSecret
    ? ok('SHIPROCKET_WEBHOOK_SECRET', `[set, sha ${sha(env.shiprocket.webhookSecret)}]`)
    : warn('SHIPROCKET_WEBHOOK_SECRET', 'not set — the webhook will reject every delivery');

  // This one cannot be checked from here. Reading the account's pickup list
  // needs the Settings permission, which this API user deliberately does not
  // have, and the only other place the name is validated is order creation —
  // which would mean creating a real order to find out. So it is reported as
  // unverifiable rather than quietly assumed correct.
  warn(
    'SHIPROCKET_PICKUP_LOCATION',
    `"${env.shiprocket.pickupLocation}" — cannot be verified without the Settings permission`
  );
  console.log(
    '        Check it by hand: Shiprocket -> Settings -> Company -> Pickup Addresses.\n' +
      '        The nickname there must match exactly, or order creation fails with\n' +
      '        "Invalid pickup location".'
  );

  if (!email || !password) {
    console.log('\n' + '='.repeat(74));
    console.log('  Cannot continue without credentials.\n');
    process.exit(1);
  }

  // ------------------------------------------
  console.log('\n2. Authentication');
  // ------------------------------------------
  const login = await httpJson<any>(`${env.shiprocket.baseUrl}/v1/external/auth/login`, {
    method: 'POST',
    body: { email, password },
    timeoutMs: 20000,
    // One attempt. Repeatedly replaying credentials against an auth endpoint is
    // how an API user gets locked out, and a wrong password will not become
    // right on the second try.
    attempts: 1,
  });

  if (!login.ok || typeof login.data?.token !== 'string') {
    fail('login', `HTTP ${login.status} — ${login.error || 'no token in response'}`);
    console.log(
      '\n        Shiprocket requires a dedicated API user, which is NOT your normal\n' +
        '        dashboard login. Create or inspect one at:\n' +
        '          Shiprocket -> Settings -> API -> Configure\n' +
        '        It needs Orders, Shipments and Courier permissions.\n' +
        '        Listings and Settings are not required for this integration.'
    );
    console.log('\n' + '='.repeat(74));
    console.log(`  RESULT: ${failures} failure(s) — not ready to go live.\n`);
    process.exit(1);
  }

  const token = login.data.token;
  ok('login', `token received [${token.length} chars] — not printed`);
  if (login.data.company_id) ok('company_id', String(login.data.company_id));

  // ------------------------------------------
  console.log('\n3. Courier serviceability (a real quote, nothing booked)');
  // ------------------------------------------
  // A representative parcel to a known-serviceable metro pincode. Reading a
  // quote is the strongest check available without creating something.
  const DESTINATION = '110001'; // New Delhi
  const params = new URLSearchParams({
    pickup_postcode: String(pincode),
    delivery_postcode: DESTINATION,
    weight: String(env.shiprocket.defaultWeightKg),
    cod: '0',
    declared_value: '500',
  });

  const quote = await httpJson<any>(
    `${env.shiprocket.baseUrl}/v1/external/courier/serviceability/?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 20000, attempts: 2 }
  );

  if (!quote.ok) {
    fail('serviceability', `HTTP ${quote.status} — ${quote.error}`);
  } else {
    const couriers = quote.data?.data?.available_courier_companies || [];
    if (couriers.length === 0) {
      fail('serviceability', `no courier serves ${pincode} -> ${DESTINATION}`);
      console.log('        Usually means the pickup pincode is not one your account can ship from.');
    } else {
      ok('serviceability', `${couriers.length} courier(s) for ${pincode} -> ${DESTINATION}`);
      for (const c of couriers.slice(0, 3)) {
        console.log(`        ${String(c.courier_name).padEnd(28)} Rs ${c.rate}  ${c.estimated_delivery_days || '?'} days`);
      }
    }
  }

  // ------------------------------------------
  console.log('\n' + '='.repeat(74));
  if (failures > 0) {
    console.log(`  RESULT: ${failures} failure(s), ${warnings} warning(s) — not ready to go live.\n`);
    process.exit(1);
  }
  console.log(`  RESULT: credentials and courier access work. ${warnings} warning(s) above.`);
  console.log('  Confirm the pickup location nickname, then set SHIPROCKET_LIVE_MODE=true.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nCheck failed:', err?.message || err);
  process.exit(1);
});
