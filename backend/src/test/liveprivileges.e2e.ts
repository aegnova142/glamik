// Live Privileges popup: validation, normalisation, scheduling and card
// resolution. Pure-function coverage — no database, no network.
//
// Run: npm run test:liveprivileges --workspace @glamirk/backend
import assert from 'node:assert/strict';
import type { CMSOffer, LivePrivilegesPopupConfig } from '@glamirk/shared/types';
import {
  DEFAULT_LIVE_PRIVILEGES_POPUP,
  validateLivePrivilegesConfig,
  normalizeLivePrivilegesConfig,
  isLivePrivilegesScheduled,
  resolveLivePrivilegesCards,
  offerDiscountLabel,
} from '@glamirk/shared/utils/livePrivilegesPopup';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${(err as Error).message}`);
  }
}

const base = (): LivePrivilegesPopupConfig => JSON.parse(JSON.stringify(DEFAULT_LIVE_PRIVILEGES_POPUP));
const offer = (o: Partial<CMSOffer>): CMSOffer =>
  ({
    id: 'o1', name: 'Internal', publicTitle: 'Public', tag: 'TAG', description: 'Desc',
    discountType: 'percentage', discountValue: 15, minOrderValue: 999, couponCode: 'CODE',
    startDate: '', endDate: '', timezone: 'Asia/Kolkata', status: 'active', showCountdown: false, ...o,
  }) as CMSOffer;

// --- validation ---------------------------------------------------------
test('defaults are valid', () => assert.deepEqual(validateLivePrivilegesConfig(base()), []));
test('non-object is rejected', () => assert.ok(validateLivePrivilegesConfig(null).length > 0));
test('empty title is rejected', () => {
  const c = base(); c.title = '  ';
  assert.ok(validateLivePrivilegesConfig(c).some((e) => /Title/.test(e)));
});
test('javascript: CTA url is rejected', () => {
  const c = base(); c.cta.url = 'javascript:alert(1)';
  assert.ok(validateLivePrivilegesConfig(c).some((e) => /destination/.test(e)));
});
test('protocol-relative CTA url is rejected', () => {
  const c = base(); c.cta.url = '//evil.example';
  assert.ok(validateLivePrivilegesConfig(c).length > 0);
});
test('disabled CTA may have a blank url', () => {
  const c = base(); c.cta.enabled = false; c.cta.url = ''; c.cta.label = '';
  assert.deepEqual(validateLivePrivilegesConfig(c), []);
});
test('data: image url is rejected', () => {
  const c = base(); c.image.url = 'data:image/png;base64,AAAA';
  assert.ok(validateLivePrivilegesConfig(c).some((e) => /Main image/.test(e)));
});
test('bad focal point is rejected', () => {
  const c = base(); c.image = { url: 'https://res.cloudinary.com/x.jpg', focus: '50% 50%; color:red' };
  assert.ok(validateLivePrivilegesConfig(c).some((e) => /focal/.test(e)));
});
test('non-hex colour is rejected', () => {
  const c = base(); c.theme.accent = 'red; background:url(x)';
  assert.ok(validateLivePrivilegesConfig(c).some((e) => /accent/.test(e)));
});
test('out-of-range layout is rejected', () => {
  const c = base(); c.layout.maxWidth = 4000; c.layout.overlayOpacity = 1.5;
  assert.equal(validateLivePrivilegesConfig(c).filter((e) => /width|Overlay/.test(e)).length, 2);
});
test('schedule end before start is rejected', () => {
  const c = base(); c.display.startAt = '2026-12-01T00:00:00Z'; c.display.endAt = '2026-11-01T00:00:00Z';
  assert.ok(validateLivePrivilegesConfig(c).some((e) => /end must be after/.test(e)));
});
test('duplicate offer ids are rejected', () => {
  const c = base(); c.offers = [{ offerId: 'a', visible: true }, { offerId: 'a', visible: false }];
  assert.ok(validateLivePrivilegesConfig(c).some((e) => /twice/.test(e)));
});
test('unknown badge icon is rejected', () => {
  const c = base(); c.offers = [{ offerId: 'a', visible: true, badgeIcon: 'skull' as any }];
  assert.ok(validateLivePrivilegesConfig(c).some((e) => /icon/.test(e)));
});

// --- normalisation -------------------------------------------------------
test('normalise drops unknown fields everywhere', () => {
  const c: any = base();
  c.isAdmin = true; c.theme.extra = '#000000'; c.offers = [{ offerId: 'a', visible: true, hack: 1, title: '  ' }];
  const n: any = normalizeLivePrivilegesConfig(c);
  assert.equal('isAdmin' in n, false);
  assert.equal('extra' in n.theme, false);
  assert.deepEqual(n.offers[0], { offerId: 'a', visible: true });
});
test('normalise omits an empty mobile image', () => {
  const c: any = base(); c.mobileImage = { url: '' };
  assert.equal('mobileImage' in normalizeLivePrivilegesConfig(c), false);
});

// --- schedule ------------------------------------------------------------
test('no window = always scheduled', () => assert.equal(isLivePrivilegesScheduled(base()), true));
test('before start = not scheduled', () => {
  const c = base(); c.display.startAt = '2030-01-01T00:00:00Z';
  assert.equal(isLivePrivilegesScheduled(c, new Date('2026-01-01')), false);
});
test('after end = not scheduled', () => {
  const c = base(); c.display.endAt = '2025-01-01T00:00:00Z';
  assert.equal(isLivePrivilegesScheduled(c, new Date('2026-01-01')), false);
});

// --- cards ---------------------------------------------------------------
const a = offer({ id: 'a', couponCode: 'AAA', publicTitle: 'Offer A', tag: 'LIMITED', minOrderValue: 999 });
const b = offer({ id: 'b', couponCode: 'BBB', publicTitle: 'Offer B', tag: 'WELCOME', minOrderValue: 799, discountValue: 10 });
const noCode = offer({ id: 'c', couponCode: undefined });

test('unlisted live offers appear in their own order', () => {
  assert.deepEqual(resolveLivePrivilegesCards(base(), [a, b]).map((x) => x.offerId), ['a', 'b']);
});
test('admin order wins', () => {
  const c = base(); c.offers = [{ offerId: 'b', visible: true }, { offerId: 'a', visible: true }];
  assert.deepEqual(resolveLivePrivilegesCards(c, [a, b]).map((x) => x.offerId), ['b', 'a']);
});
test('hidden offers are skipped', () => {
  const c = base(); c.offers = [{ offerId: 'a', visible: false }];
  assert.deepEqual(resolveLivePrivilegesCards(c, [a, b]).map((x) => x.offerId), ['b']);
});
test('offers that are not live (absent from the list) never show', () => {
  const c = base(); c.offers = [{ offerId: 'expired', visible: true }];
  assert.deepEqual(resolveLivePrivilegesCards(c, [a]).map((x) => x.offerId), ['a']);
});
test('offers without a coupon code are skipped', () => {
  assert.deepEqual(resolveLivePrivilegesCards(base(), [noCode]), []);
});
test('code, minimum and discount always come from the offer record', () => {
  const c = base(); c.offers = [{ offerId: 'a', visible: true, title: 'Override', badgeText: 'NEW' }];
  const [card] = resolveLivePrivilegesCards(c, [a]);
  assert.equal(card.title, 'Override');
  assert.equal(card.badge, 'NEW');
  assert.equal(card.couponCode, 'AAA');
  assert.equal(card.minOrderValue, 999);
  assert.equal(card.discountLabel, '15% off');
});
test('blank overrides fall back to the offer text', () => {
  const [card] = resolveLivePrivilegesCards(base(), [b]);
  assert.equal(card.title, 'Offer B');
  assert.equal(card.badge, 'WELCOME');
});
test('discount labels', () => {
  assert.equal(offerDiscountLabel({ discountType: 'flat', discountValue: 150 }), '₹150 off');
  assert.equal(offerDiscountLabel({ discountType: 'gift', discountValue: 0 }), null);
});

console.log(`liveprivileges: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
