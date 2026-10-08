/**
 * Shade/variant flow, end to end over the real HTTP routes.
 *
 * Run against a THROWAWAY database only:
 *
 *   DATABASE_URL=postgres://postgres:test@localhost:55434/glamirk_test \
 *     npx tsx src/test/variantflow.e2e.ts
 *
 * variants.e2e.ts asserts the resolution rules in isolation. This asserts that
 * the SERVER applies them: that a shade a shopper picks is the shade that gets
 * priced, reserved, ordered, cancelled and restocked, with no step re-deriving
 * any of it from a different number.
 *
 * The fixture is the product the brief describes — four shades, different
 * sizes, prices, stock, SKUs and images — because every bug this covers is a
 * bug about one variant being confused for another, and a single-variant
 * fixture cannot show it.
 */

// ==========================================
// SAFETY GUARD — must run before anything imports db.ts.
// The repo-root .env points at the production database and this script writes
// orders and mutates stock. Same refusal the other DB suites use.
// ==========================================
process.env.NODE_ENV = 'test';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  console.error(
    '\nREFUSING TO RUN.\n\nDATABASE_URL must point at a local database whose name contains "test".\n' +
      `Got: ${url ? url.replace(/:[^:@/]+@/, ':***@') : '(unset)'}\n`
  );
  process.exit(1);
}

// Pinned before any import reads them, same as the checkout harness: the mock
// courier handles the shipment booking that follows a placed order, so no run
// of this file can reach a real carrier. The repo .env already has live mode
// off; this makes it a property of the test rather than of the environment it
// happens to run in.
process.env.DELHIVERY_LIVE_MODE = 'false';
process.env.DELHIVERY_PICKUP_NAME = 'Test Warehouse';

import express from 'express';
import { createServer, Server } from 'http';
import { pool, loadDatabase, saveDatabase, ensureSchema } from '../db/db';
import { signCustomerToken } from '../auth/tokens';
import customerRouter from '../routes/customer.routes';
import { ensureProductInventory } from '../services/inventory.service';
import type { Product } from '@glamirk/shared/types';

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

const USER = 'variant-user-1';
const PRODUCT_ID = 'variant-product-1';
const LEGACY_ID = 'variant-legacy-1';
const CDN = 'https://res.cloudinary.com/demo/image/upload/v1/glamirk-beauty';

/** The brief's product: 4 shades, different sizes/prices/stock/SKUs/images. */
function fixtureProduct(): Product {
  return {
    id: PRODUCT_ID,
    name: 'Velvet Matte Lipstick',
    category: 'Makeup',
    subCategory: 'Lips',
    subtitle: '',
    description: '',
    ritual: '',
    price: 1299,
    originalPrice: 1599,
    currency: '₹',
    inStock: true,
    stock: 100,
    benefits: [],
    images: { primary: `${CDN}/product-primary.jpg`, secondary: `${CDN}/product-secondary.jpg` },
    details: { overview: '', howToUse: '', ingredientsList: '', shippingReturns: '' },
    relatedProductIds: [],
    completeTheLookProductIds: [],
    shades: [
      {
        id: 'heritage',
        name: 'Heritage Maroon',
        hex: '#7B1E3A',
        undertone: 'Cool',
        description: 'Deep cool maroon.',
        isActive: true,
        sku: 'GLM-HM',
        images: [{ id: 'hm-1', url: `${CDN}/heritage-primary.jpg`, sortOrder: 0, isPrimary: true }],
        sizes: [{ id: 'hm-50', label: '50g', price: 1499, compareAtPrice: 1799, stock: 8, sku: 'GLM-HM-50', isActive: true }],
      },
      {
        id: 'ceremonial',
        name: 'Ceremonial Scarlet',
        hex: '#C21E36',
        undertone: 'Warm',
        description: 'Bright festive scarlet.',
        isActive: true,
        images: [{ id: 'cs-1', url: `${CDN}/ceremonial-primary.jpg`, sortOrder: 0, isPrimary: true }],
        sizes: [
          { id: 'cs-30', label: '30g', price: 699, compareAtPrice: 799, stock: 20, sku: 'GLM-CS-30', isActive: true },
          { id: 'cs-50', label: '50g', price: 899, compareAtPrice: 999, stock: 3, sku: 'GLM-CS-50', isActive: true },
        ],
      },
      {
        id: 'rose-quartz',
        name: 'Rose Quartz',
        hex: '#E8A0A8',
        undertone: 'Neutral',
        description: 'Soft everyday rose.',
        isActive: true,
        sku: 'GLM-RQ',
        stock: 12,
        images: [],
      },
      {
        id: 'midnight',
        name: 'Midnight Plum',
        hex: '#2B1B33',
        undertone: 'Cool',
        description: 'Deep evening plum.',
        isActive: false,
        sku: 'GLM-MP',
        price: 1899,
        stock: 40,
        images: [{ id: 'mp-1', url: `${CDN}/midnight-primary.jpg`, sortOrder: 0, isPrimary: true }],
      },
    ],
  };
}

/** A record in the shape that existed before per-shade price/stock/sizes/
 * images/isActive were added — it must keep working untouched. */
function legacyProduct(): Product {
  return {
    id: LEGACY_ID,
    name: 'Legacy Kajal',
    category: 'Makeup',
    subCategory: 'Eyes',
    subtitle: '',
    description: '',
    ritual: '',
    price: 499,
    currency: '₹',
    inStock: true,
    stock: 30,
    benefits: [],
    images: { primary: `${CDN}/legacy-primary.jpg`, secondary: `${CDN}/legacy-secondary.jpg` },
    details: { overview: '', howToUse: '', ingredientsList: '', shippingReturns: '' },
    relatedProductIds: [],
    completeTheLookProductIds: [],
    shades: [
      { id: 'legacy-black', name: 'Classic Black', hex: '#121212', undertone: 'Universal', description: 'Classic.' },
    ],
  } as Product;
}

let server: Server;
let port = 0;
let token = '';

async function api(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<{ status: number; body: any }> {
  const res = await fetch(`http://127.0.0.1:${port}/api/customer${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.auth === false ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function resetDatabase(): Promise<void> {
  await ensureSchema();
  await pool.query('DELETE FROM order_items');
  await pool.query('DELETE FROM order_status_history');
  await pool.query('DELETE FROM payments').catch(() => undefined);
  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM cart_items');
  await pool.query('DELETE FROM notifications').catch(() => undefined);
  await pool.query('DELETE FROM customers');
  await pool.query(
    `INSERT INTO customers (id, name, email, password_hash) VALUES ($1, 'Variant Tester', 'variant@test.local', 'x')`,
    [USER]
  );

  const db = await loadDatabase();
  db.products = [fixtureProduct(), legacyProduct()];
  await saveDatabase(db);

  await pool.query('DELETE FROM inventory_transactions').catch(() => undefined);
  await pool.query('DELETE FROM inventory_reservations').catch(() => undefined);
  await pool.query('DELETE FROM inventory').catch(() => undefined);
  for (const product of db.products) await ensureProductInventory(product as any);
}

async function currentProduct(): Promise<Product> {
  const db = await loadDatabase();
  return db.products.find((p) => p.id === PRODUCT_ID)!;
}

const shadeOf = (product: Product, id: string) => product.shades!.find((s) => s.id === id)!;
const sizeOf = (product: Product, shadeId: string, label: string) =>
  shadeOf(product, shadeId).sizes!.find((s) => s.label === label)!;

async function clearCart(): Promise<void> {
  await pool.query('DELETE FROM cart_items WHERE user_id = $1', [USER]);
}

async function run(): Promise<void> {
  await resetDatabase();

  // ==========================================
  section('Cart — the selected variant is what gets priced');
  // ==========================================
  {
    const add = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '30g', quantity: 2 } });
    check('a shade + size can be added', add.status === 200, JSON.stringify(add.body).slice(0, 160));

    const cart = await api('/cart');
    const line = cart.body.items?.[0];
    check('the line records the variant id', line?.variantId === 'ceremonial');
    check('and the size label', line?.selectedSize === '30g');
    check('the shade is resolved back onto the line', line?.selectedShade?.name === 'Ceremonial Scarlet');
    // 699 is the SIZE price. The shade has no price of its own and the product
    // charges 1299 — so either of the other two levels winning would be
    // visible here as a different number.
    check('the server prices the SIZE, not the shade or the product', line?.lineTotal === 1398, String(line?.lineTotal));
    check('the subtotal matches', cart.body.subtotal === 1398, String(cart.body.subtotal));
    check('max available comes from the size', line?.maxAvailable === 20, String(line?.maxAvailable));

    // The same shade at the other size is a DIFFERENT sellable unit, not a
    // quantity bump on the first.
    const addSibling = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '50g', quantity: 1 } });
    check('the sibling size is accepted', addSibling.status === 200);
    const cart2 = await api('/cart');
    check('it is a separate cart line', cart2.body.items?.length === 2);
    check(
      'priced at its own size price',
      cart2.body.items?.find((i: any) => i.selectedSize === '50g')?.lineTotal === 899
    );

    const addOther = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'heritage', size: '50g', quantity: 1 } });
    check('a different shade at the SAME label is also separate', addOther.status === 200);
    const cart3 = await api('/cart');
    check('three distinct lines', cart3.body.items?.length === 3);
    check(
      "and the other shade's 50g charges ITS price, not the first shade's",
      cart3.body.items?.find((i: any) => i.variantId === 'heritage')?.lineTotal === 1499
    );

    const shadeOnly = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'rose-quartz', quantity: 1 } });
    check('a shade with no sizes needs no size', shadeOnly.status === 200);
    const cart4 = await api('/cart');
    check(
      'and inherits the product price',
      cart4.body.items?.find((i: any) => i.variantId === 'rose-quartz')?.lineTotal === 1299
    );
  }

  // ==========================================
  section('Cart — what the server refuses');
  // ==========================================
  {
    await clearCart();

    const noVariant = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, quantity: 1 } });
    check('a shaded product cannot be added without a shade', noVariant.status === 400);

    const unknownVariant = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'no-such-shade', quantity: 1 } });
    check('an unknown shade id is refused', unknownVariant.status === 400);

    const pausedShade = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'midnight', quantity: 1 } });
    check('a PAUSED shade is refused even though it has 40 units', pausedShade.status === 400, JSON.stringify(pausedShade.body));
    check('and is named in the message', String(pausedShade.body.error || '').includes('Midnight Plum'));

    const noSize = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', quantity: 1 } });
    check('a shade that has sizes cannot be added without one', noSize.status === 400);

    const wrongSize = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'heritage', size: '30g', quantity: 1 } });
    check("a size belonging to a DIFFERENT shade is refused", wrongSize.status === 400, JSON.stringify(wrongSize.body));

    const overStock = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '50g', quantity: 4 } });
    check('more than the size holds is refused (3 in stock)', overStock.status === 400);
    check('and the refusal states the real number', overStock.body.maxAvailable === 3 || String(overStock.body.error).includes('3'));

    await clearCart();
  }

  // ==========================================
  section('Cart — a client price is never trusted');
  // ==========================================
  {
    await clearCart();
    await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '30g', quantity: 1, price: 1, lineTotal: 1 } });
    const cart = await api('/cart');
    check('a price smuggled into the request body is ignored', cart.body.items?.[0]?.lineTotal === 699, String(cart.body.items?.[0]?.lineTotal));

    // An admin re-price must be reflected on an existing cart line, because
    // the line stores identity only and the price is resolved on every read.
    const db = await loadDatabase();
    const product = db.products.find((p) => p.id === PRODUCT_ID)!;
    sizeOf(product, 'ceremonial', '30g').price = 749;
    await saveDatabase(db);

    const repriced = await api('/cart');
    check('a cart line re-prices itself after an admin edit', repriced.body.items?.[0]?.lineTotal === 749, String(repriced.body.items?.[0]?.lineTotal));

    sizeOf(product, 'ceremonial', '30g').price = 699;
    await saveDatabase(db);
    await clearCart();
  }

  // ==========================================
  section('Cart — a shade paused while it sits in the bag');
  // ==========================================
  {
    await clearCart();
    await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'rose-quartz', quantity: 1 } });

    const db = await loadDatabase();
    shadeOf(db.products.find((p) => p.id === PRODUCT_ID)!, 'rose-quartz').isActive = false;
    await saveDatabase(db);

    const cart = await api('/cart');
    check('the line is marked unavailable rather than silently priced', cart.body.items?.[0]?.unavailable === true);
    check('and contributes nothing to the subtotal', cart.body.subtotal === 0, String(cart.body.subtotal));

    const checkout = await api('/checkout', {
      method: 'POST',
      body: {
        shippingAddress: { addressLine1: '1 Test St', city: 'Pune', state: 'MH', pinCode: '411001', phone: '9876543210' },
        customerName: 'Variant Tester',
        customerPhone: '9876543210',
        customerEmail: 'variant@test.local',
        paymentMethod: 'cod',
      },
    });
    check('checkout refuses rather than shipping a withdrawn shade', checkout.status === 409, String(checkout.status));
    check('and says which shade', String(checkout.body.error || '').includes('Rose Quartz'));

    shadeOf(db.products.find((p) => p.id === PRODUCT_ID)!, 'rose-quartz').isActive = true;
    await saveDatabase(db);
    await clearCart();
  }

  // ==========================================
  section('Order — the variant identity survives into history');
  // ==========================================
  let orderId = '';
  {
    await clearCart();
    await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '50g', quantity: 2 } });
    await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'heritage', size: '50g', quantity: 1 } });

    const before = await currentProduct();
    const ceremonial50Before = sizeOf(before, 'ceremonial', '50g').stock!;
    const heritage50Before = sizeOf(before, 'heritage', '50g').stock!;
    const ceremonial30Before = sizeOf(before, 'ceremonial', '30g').stock!;
    const roseBefore = shadeOf(before, 'rose-quartz').stock!;

    const checkout = await api('/checkout', {
      method: 'POST',
      body: {
        shippingAddress: { addressLine1: '1 Test St', city: 'Pune', state: 'MH', pinCode: '411001', phone: '9876543210' },
        customerName: 'Variant Tester',
        customerPhone: '9876543210',
        customerEmail: 'variant@test.local',
        paymentMethod: 'cod',
      },
    });
    check('checkout succeeds', checkout.status === 200, JSON.stringify(checkout.body).slice(0, 200));
    orderId = checkout.body.order?.id;

    // 899×2 + 1499 = 3297, computed server-side from the catalogue.
    check('the total is computed from live catalogue prices', checkout.body.order?.subtotal === 3297, String(checkout.body.order?.subtotal));

    const items = await pool.query('SELECT product_id, variant_id, selected_size, quantity, price FROM order_items WHERE order_id = $1 ORDER BY variant_id', [orderId]);
    check('two order lines were written', items.rows.length === 2);
    check('each carries its own variant id', items.rows.map((r) => r.variant_id).join(',') === 'ceremonial,heritage');
    check('and its own size label', items.rows.map((r) => r.selected_size).join(',') === '50g,50g');
    check('and the price that was actually charged', Number(items.rows[0].price) === 899 && Number(items.rows[1].price) === 1499);

    const after = await currentProduct();
    check('stock came off the exact size bought', sizeOf(after, 'ceremonial', '50g').stock === ceremonial50Before - 2);
    check('and off the other shade separately', sizeOf(after, 'heritage', '50g').stock === heritage50Before - 1);
    check('a sibling size of the same shade is untouched', sizeOf(after, 'ceremonial', '30g').stock === ceremonial30Before);
    check('an uninvolved shade is untouched', shadeOf(after, 'rose-quartz').stock === roseBefore);
    check('a paused shade is untouched', shadeOf(after, 'midnight').stock === 40);

    const order = await api(`/orders/${orderId}`);
    check('the order reads back with its shades named', order.status === 200);
    const names = (order.body.order?.items || []).map((i: any) => i.shade?.name).sort().join(',');
    check('each line names the shade that was bought', names === 'Ceremonial Scarlet,Heritage Maroon', names);
    check('and the size', (order.body.order?.items || []).every((i: any) => i.size === '50g'));
  }

  // ==========================================
  section('Cancellation — restocks the same shade and size');
  // ==========================================
  {
    const before = await currentProduct();
    const ceremonial50Before = sizeOf(before, 'ceremonial', '50g').stock!;
    const heritage50Before = sizeOf(before, 'heritage', '50g').stock!;
    const ceremonial30Before = sizeOf(before, 'ceremonial', '30g').stock!;

    const cancel = await api(`/orders/${orderId}/cancel`, { method: 'POST', body: { reason: 'Changed my mind' } });
    check('the order cancels', cancel.status === 200, JSON.stringify(cancel.body).slice(0, 160));

    const after = await currentProduct();
    check('the exact size bought is restocked', sizeOf(after, 'ceremonial', '50g').stock === ceremonial50Before + 2);
    check('the other shade is restocked separately', sizeOf(after, 'heritage', '50g').stock === heritage50Before + 1);
    check('a sibling size is not credited units it never sold', sizeOf(after, 'ceremonial', '30g').stock === ceremonial30Before);
    check('stock is back where it started', sizeOf(after, 'ceremonial', '50g').stock === 3 && sizeOf(after, 'heritage', '50g').stock === 8);

    const items = await pool.query('SELECT variant_id, selected_size FROM order_items WHERE order_id = $1', [orderId]);
    check('the cancelled order keeps its variant identity for history', items.rows.length === 2 && items.rows.every((r) => !!r.variant_id));
  }

  // ==========================================
  section('ONE SHADE, TWO SIZES — the case the old cart constraint made impossible');
  //
  // Before migration 016, cart_items was unique on (user, product, variant),
  // so the second line below hit a 23505 and the request died with a 500. The
  // whole scenario — two sizes of one shade bought together, deducted
  // separately and restocked separately — is what that index was blocking.
  // ==========================================
  {
    await clearCart();
    const before = await currentProduct();
    const size30Before = sizeOf(before, 'ceremonial', '30g').stock!;
    const size50Before = sizeOf(before, 'ceremonial', '50g').stock!;
    const heritageBefore = sizeOf(before, 'heritage', '50g').stock!;
    const roseBefore = shadeOf(before, 'rose-quartz').stock!;

    const add30 = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '30g', quantity: 3 } });
    const add50 = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '50g', quantity: 2 } });
    check('30g of the shade is added', add30.status === 200, JSON.stringify(add30.body).slice(0, 160));
    check('50g of the SAME shade is added, not merged into the first line', add50.status === 200, JSON.stringify(add50.body).slice(0, 160));

    const cart = await api('/cart');
    const lines = (cart.body.items || []).filter((i: any) => i.variantId === 'ceremonial');
    check('both sizes coexist as separate cart lines', lines.length === 2, String(lines.length));
    check('each keeps its own quantity', lines.map((l: any) => `${l.selectedSize}:${l.quantity}`).sort().join(',') === '30g:3,50g:2');
    check('and is priced at its own size price', cart.body.subtotal === 3 * 699 + 2 * 899, String(cart.body.subtotal));

    const checkout = await api('/checkout', {
      method: 'POST',
      body: {
        shippingAddress: { addressLine1: '1 Test St', city: 'Pune', state: 'MH', pinCode: '411001', phone: '9876543210' },
        customerName: 'Variant Tester',
        customerPhone: '9876543210',
        customerEmail: 'variant@test.local',
        paymentMethod: 'cod',
      },
    });
    check('checkout succeeds with both sizes in the bag', checkout.status === 200, JSON.stringify(checkout.body).slice(0, 200));
    const twoSizeOrderId = checkout.body.order?.id;
    check('the total is the sum of the two size prices', checkout.body.order?.subtotal === 3 * 699 + 2 * 899, String(checkout.body.order?.subtotal));

    const items = await pool.query(
      'SELECT variant_id, selected_size, quantity, price FROM order_items WHERE order_id = $1 ORDER BY selected_size',
      [twoSizeOrderId]
    );
    check('two order lines were written', items.rows.length === 2);
    check('both carry the same variant id', items.rows.every((r) => r.variant_id === 'ceremonial'));
    check('but different sizes', items.rows.map((r) => r.selected_size).join(',') === '30g,50g');
    check('each at its own price', Number(items.rows[0].price) === 699 && Number(items.rows[1].price) === 899);
    check('and its own quantity', items.rows[0].quantity === 3 && items.rows[1].quantity === 2);

    const afterOrder = await currentProduct();
    check('30g lost exactly 3', sizeOf(afterOrder, 'ceremonial', '30g').stock === size30Before - 3);
    check('50g lost exactly 2', sizeOf(afterOrder, 'ceremonial', '50g').stock === size50Before - 2);
    check('a sibling shade is untouched', sizeOf(afterOrder, 'heritage', '50g').stock === heritageBefore);
    check('an unsized sibling shade is untouched', shadeOf(afterOrder, 'rose-quartz').stock === roseBefore);

    const cancel = await api(`/orders/${twoSizeOrderId}/cancel`, { method: 'POST', body: { reason: 'Changed my mind' } });
    check('the order cancels', cancel.status === 200, JSON.stringify(cancel.body).slice(0, 160));

    const afterCancel = await currentProduct();
    check('30g is restocked to exactly where it started', sizeOf(afterCancel, 'ceremonial', '30g').stock === size30Before);
    check('50g is restocked to exactly where it started', sizeOf(afterCancel, 'ceremonial', '50g').stock === size50Before);
    check('neither size was credited the other\'s units', sizeOf(afterCancel, 'ceremonial', '30g').stock !== size30Before + 2);
    check('siblings still untouched after the restock', sizeOf(afterCancel, 'heritage', '50g').stock === heritageBefore);

    await clearCart();
  }

  // ==========================================
  section('A paused SIZE cannot be selected');
  // ==========================================
  {
    await clearCart();
    const db = await loadDatabase();
    const product = db.products.find((p) => p.id === PRODUCT_ID)!;
    sizeOf(product, 'ceremonial', '30g').isActive = false;
    await saveDatabase(db);

    const paused = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '30g', quantity: 1 } });
    check('the paused size is refused', paused.status === 400, JSON.stringify(paused.body));

    const sibling = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '50g', quantity: 1 } });
    check('its sibling size is still buyable', sibling.status === 200, JSON.stringify(sibling.body));

    // With one size paused the shade still has a size dimension, so a bare
    // add must still be refused rather than silently falling back.
    const bare = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', quantity: 1 } });
    check('a sizeless add is still refused while one size remains active', bare.status === 400);

    sizeOf(product, 'ceremonial', '30g').isActive = true;
    await saveDatabase(db);
    await clearCart();
  }

  // ==========================================
  section('Out of stock is decided per unit, not per product');
  // ==========================================
  {
    await clearCart();
    const db = await loadDatabase();
    const product = db.products.find((p) => p.id === PRODUCT_ID)!;
    // Drain the product-level pool completely while every shade keeps stock.
    product.stock = 0;
    await saveDatabase(db);

    const add = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '30g', quantity: 1 } });
    check('a drained product pool does not block a shade that has stock', add.status === 200, JSON.stringify(add.body));

    // Now empty exactly one size and leave its sibling stocked.
    sizeOf(product, 'ceremonial', '50g').stock = 0;
    await saveDatabase(db);

    const soldOutSize = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '50g', quantity: 1 } });
    check('the emptied size is refused', soldOutSize.status === 400);
    const stockedSibling = await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'ceremonial', size: '30g', quantity: 1 } });
    check('while its stocked sibling is still buyable', stockedSibling.status === 200);

    sizeOf(product, 'ceremonial', '50g').stock = 3;
    product.stock = 100;
    await saveDatabase(db);
    await clearCart();
  }

  // ==========================================
  section('Backward compatibility — a product saved before any of this');
  // ==========================================
  {
    await clearCart();
    const add = await api('/cart/items', { method: 'POST', body: { productId: LEGACY_ID, variantId: 'legacy-black', quantity: 2 } });
    check('a legacy shade with no isActive/price/stock/sizes still adds', add.status === 200, JSON.stringify(add.body));

    const cart = await api('/cart');
    const line = cart.body.items?.[0];
    check('it is priced at the product price', line?.lineTotal === 998, String(line?.lineTotal));
    check('its availability comes from the product pool', line?.maxAvailable === 30, String(line?.maxAvailable));
    check('and it is not marked unavailable', line?.unavailable !== true);

    const checkout = await api('/checkout', {
      method: 'POST',
      body: {
        shippingAddress: { addressLine1: '1 Test St', city: 'Pune', state: 'MH', pinCode: '411001', phone: '9876543210' },
        customerName: 'Variant Tester',
        customerPhone: '9876543210',
        customerEmail: 'variant@test.local',
        paymentMethod: 'cod',
      },
    });
    check('a legacy product still checks out', checkout.status === 200, JSON.stringify(checkout.body).slice(0, 160));

    const db = await loadDatabase();
    check('and deducts from the product pool as before', db.products.find((p) => p.id === LEGACY_ID)!.stock === 28);
    await clearCart();
  }

  // ==========================================
  section('Reorder — a withdrawn shade is reported, never substituted');
  // ==========================================
  {
    await clearCart();
    await api('/cart/items', { method: 'POST', body: { productId: PRODUCT_ID, variantId: 'rose-quartz', quantity: 1 } });
    const checkout = await api('/checkout', {
      method: 'POST',
      body: {
        shippingAddress: { addressLine1: '1 Test St', city: 'Pune', state: 'MH', pinCode: '411001', phone: '9876543210' },
        customerName: 'Variant Tester',
        customerPhone: '9876543210',
        customerEmail: 'variant@test.local',
        paymentMethod: 'cod',
      },
    });
    const reorderableId = checkout.body.order?.id;
    await clearCart();

    const db = await loadDatabase();
    shadeOf(db.products.find((p) => p.id === PRODUCT_ID)!, 'rose-quartz').isActive = false;
    await saveDatabase(db);

    const reorder = await api(`/orders/${reorderableId}/reorder`, { method: 'POST' });
    check('reorder succeeds as a request', reorder.status === 200);
    check('the withdrawn shade is not silently re-added', (reorder.body.items || []).length === 0, JSON.stringify(reorder.body.items));
    check('it is reported as unavailable instead', (reorder.body.unavailable || []).length === 1);
    check('naming the shade', String(reorder.body.unavailable?.[0]?.reason || '').includes('Rose Quartz'));

    shadeOf(db.products.find((p) => p.id === PRODUCT_ID)!, 'rose-quartz').isActive = true;
    await saveDatabase(db);
    await clearCart();
  }
}

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use('/api/customer', customerRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  port = (server.address() as any).port;

  await pool.query('SELECT 1');
  token = signCustomerToken(USER, 'variant@test.local', 0);

  try {
    await run();
  } catch (err) {
    console.error('\nHarness crashed:', err);
    failed++;
    failures.push('harness crashed');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f}`));
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
