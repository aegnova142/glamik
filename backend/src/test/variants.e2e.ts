/**
 * Shade/variant resolution and validation.
 *
 *   npx tsx src/test/variants.e2e.ts
 *
 * No database needed — every assertion is pure, which is the point. What is
 * under test here is the chain that decides what a customer is charged, what
 * they are shown, and what the warehouse is told to pick:
 *
 *   price   size.price        → shade.price        → product.price
 *   stock   size.stock        → shade.stock        → product.stock
 *   sku     size.sku          → shade.sku
 *   images  shade's own       → the product's
 *
 * Those four have to resolve at the same level as each other and identically
 * on the storefront, in the admin and on the server — all three now read this
 * one module. A divergence is invisible on the page (every number looks like a
 * number) and only shows up as a customer charged one price and shipped a
 * different jar, so it can only be caught by asserting the resolution.
 *
 * Also covers the rules that protect existing data: a shade with none of these
 * fields set must behave exactly as it did before they existed.
 */
process.env.NODE_ENV = 'test';

import {
  resolveVariantGallery,
  variantGalleryResetKey,
  getVariantPrice,
  getVariantStock,
  getActiveSizeOptions,
  findSizeOption,
  getCurrentPrice,
  getCurrentCompareAtPrice,
  getCurrentStock,
  getCurrentSku,
  getCurrentDiscountPercent,
  getDiscountPercent,
  getDefaultShade,
  selectableShades,
  isShadeSelectable,
  resolveSizeSelection,
  stockStatus,
  summarizeShade,
  duplicateShade,
  duplicateSize,
  enumerateStockUnits,
  hasSellableStock,
  isProductSellable,
  isVariantInStock,
  LOW_STOCK_THRESHOLD,
} from '@glamirk/shared/utils/productVariant';
import { validateProductVariants } from '@glamirk/shared/utils/productValidation';
import type { Product, Shade, SizeOption } from '@glamirk/shared/types';

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

const CDN = 'https://res.cloudinary.com/demo/image/upload/v1/glamirk-beauty';

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-test',
    name: 'Velvet Matte Lipstick',
    category: 'Makeup',
    subCategory: 'Lips',
    subtitle: 'sub',
    description: 'desc',
    ritual: 'ritual',
    price: 1299,
    originalPrice: 1599,
    currency: '₹',
    inStock: true,
    stock: 50,
    benefits: [],
    images: { primary: `${CDN}/product-primary.jpg`, secondary: `${CDN}/product-secondary.jpg` },
    details: { overview: '', howToUse: '', ingredientsList: '', shippingReturns: '' },
    relatedProductIds: [],
    completeTheLookProductIds: [],
    ...overrides,
  };
}

function shade(id: string, name: string, overrides: Partial<Shade> = {}): Shade {
  return {
    id,
    name,
    hex: '#C9972B',
    undertone: 'Warm',
    description: `${name} description`,
    isActive: true,
    images: [],
    ...overrides,
  };
}

function size(id: string, label: string, price: number, overrides: Partial<SizeOption> = {}): SizeOption {
  return { id, label, price, isActive: true, ...overrides };
}

/**
 * The product the brief asks for: four shades, different sizes, different
 * prices, different stock, different SKUs, different images. Every assertion
 * below that is about resolution runs against this one shape, so a change that
 * fixes one shade by breaking another cannot pass.
 *
 *   heritage      50g only            ₹1499/₹1799   8 units   own gallery
 *   ceremonial    30g and 50g         ₹999 / ₹1299  20 + 2    own gallery
 *   rose-quartz   no sizes            inherits 1299 0 units   no gallery
 *   midnight      no sizes, PAUSED    ₹1899         40 units  own gallery
 */
function catalogProduct(): Product {
  return baseProduct({
    shades: [
      shade('heritage', 'Heritage Maroon', {
        sku: 'GLM-HM',
        images: [
          { id: 'hm-1', url: `${CDN}/heritage-a.jpg`, sortOrder: 1, isPrimary: false },
          { id: 'hm-2', url: `${CDN}/heritage-primary.jpg`, sortOrder: 0, isPrimary: true },
        ],
        sizes: [size('hm-50', '50g', 1499, { compareAtPrice: 1799, stock: 8, sku: 'GLM-HM-50' })],
      }),
      shade('ceremonial', 'Ceremonial Scarlet', {
        hex: '#F05A7E',
        sizes: [
          size('cs-30', '30g', 999, { compareAtPrice: 1299, stock: 20, sku: 'GLM-CS-30' }),
          size('cs-50', '50g', 1299, { compareAtPrice: 1299, stock: 2, sku: 'GLM-CS-50' }),
        ],
        images: [{ id: 'cs-1', url: `${CDN}/ceremonial-primary.jpg`, sortOrder: 0, isPrimary: true }],
      }),
      shade('rose-quartz', 'Rose Quartz', { stock: 0, sku: 'GLM-RQ' }),
      shade('midnight', 'Midnight Plum', {
        isActive: false,
        price: 1899,
        stock: 40,
        images: [{ id: 'mp-1', url: `${CDN}/midnight-primary.jpg`, sortOrder: 0, isPrimary: true }],
      }),
    ],
  });
}

const findShade = (product: Product, id: string): Shade => product.shades!.find((s) => s.id === id)!;

// ==========================================
section('PRICING — size → shade → product');
// ==========================================
{
  const product = catalogProduct();
  const heritage = findShade(product, 'heritage');
  const ceremonial = findShade(product, 'ceremonial');
  const rose = findShade(product, 'rose-quartz');
  const midnight = findShade(product, 'midnight');

  check('a product with no shade selected charges its own price', getCurrentPrice(product, undefined, undefined) === 1299);
  check('a shade with no override inherits the product price', getCurrentPrice(product, rose, undefined) === 1299);
  check("a shade's own price overrides the product's", getCurrentPrice(product, midnight, undefined) === 1899);
  check('a size price overrides the shade price', getCurrentPrice(product, ceremonial, '30g') === 999);
  check('the other size of the same shade charges its own price', getCurrentPrice(product, ceremonial, '50g') === 1299);
  check('a different shade at the same label charges ITS price', getCurrentPrice(product, heritage, '50g') === 1499);

  check(
    'an unknown size label falls back to the shade/product price rather than guessing',
    getCurrentPrice(product, rose, 'nonexistent-size') === 1299
  );

  check('compare-at follows the same chain — size level', getCurrentCompareAtPrice(product, ceremonial, '30g') === 1299);
  check('compare-at follows the same chain — shade level', getCurrentCompareAtPrice(product, rose, undefined) === 1599);
  check(
    'compare-at falls back to the product original price',
    getCurrentCompareAtPrice(baseProduct(), undefined, undefined) === 1599
  );

  check('getVariantPrice ignores the size dimension by design', getVariantPrice(product, ceremonial) === 1299);
  check('findSizeOption addresses by label within the shade', findSizeOption(product, ceremonial, '30g')?.id === 'cs-30');
  check('findSizeOption does not reach into another shade', findSizeOption(product, heritage, '30g') === undefined);
}

// ==========================================
section('DISCOUNT — derived, never stored');
// ==========================================
{
  check('₹999 → ₹799 is 20% off', getDiscountPercent(799, 999) === 20);
  check('₹999 → ₹999 shows no discount', getDiscountPercent(999, 999) === null);
  check('a compare-at BELOW the price is refused, not rendered negative', getDiscountPercent(999, 799) === null);
  check('no compare-at means no discount', getDiscountPercent(799, undefined) === null);
  check('a zero compare-at cannot produce a division by zero', getDiscountPercent(799, 0) === null);
  check('NaN in either side yields null', getDiscountPercent(NaN, 999) === null && getDiscountPercent(799, NaN) === null);
  check('the brief example ₹1499 from ₹1799 rounds to 17%', getDiscountPercent(1499, 1799) === 17);
  check('the brief example ₹899 from ₹999 is 10%', getDiscountPercent(899, 999) === 10);
  check('the brief example ₹699 from ₹799 is 13%', getDiscountPercent(699, 799) === 13);

  const product = catalogProduct();
  const ceremonial = findShade(product, 'ceremonial');
  check('the selected size drives the displayed discount', getCurrentDiscountPercent(product, ceremonial, '30g') === 23);
  check(
    'a size whose compare-at equals its price shows no discount',
    getCurrentDiscountPercent(product, ceremonial, '50g') === null
  );
  check(
    'a shade inheriting both prices shows the product discount',
    getCurrentDiscountPercent(product, findShade(product, 'rose-quartz'), undefined) === 19
  );
}

// ==========================================
section('SIZES — independent per shade');
// ==========================================
{
  const product = catalogProduct();
  const heritage = findShade(product, 'heritage');
  const ceremonial = findShade(product, 'ceremonial');
  const rose = findShade(product, 'rose-quartz');

  check('one shade can offer a single size', getActiveSizeOptions(product, heritage).length === 1);
  check('another can offer two', getActiveSizeOptions(product, ceremonial).length === 2);
  check('a third can offer none', getActiveSizeOptions(product, rose).length === 0);
  check(
    'shades are not forced to share a size list',
    getActiveSizeOptions(product, heritage)[0].label === '50g' &&
      getActiveSizeOptions(product, ceremonial).map((s) => s.label).join(',') === '30g,50g'
  );

  const paused = catalogProduct();
  paused.shades![1].sizes![0].isActive = false;
  check(
    'a paused size is not offered',
    getActiveSizeOptions(paused, findShade(paused, 'ceremonial')).map((s) => s.label).join(',') === '50g'
  );
  check(
    'a paused size is not counted as sellable either — the two answers agree',
    !enumerateStockUnits(paused).some((u) => u.variantId === 'ceremonial' && u.sizeLabel === '30g')
  );

  const legacy = catalogProduct();
  delete legacy.shades![1].sizes![0].isActive;
  check(
    'a size saved before isActive existed stays selectable',
    getActiveSizeOptions(legacy, findShade(legacy, 'ceremonial')).length === 2
  );

  // Product-level sizes, for products with no shades at all.
  const jar = baseProduct({
    shades: undefined,
    sizes: ['30g', '50g'],
    sizePricing: { '30g': { price: 699, compareAtPrice: 799, stock: 20 }, '50g': { price: 899, stock: 8 } },
  });
  check('a shade-less product resolves its own sizes', getActiveSizeOptions(jar, undefined).length === 2);
  check('product-level size pricing applies', getCurrentPrice(jar, undefined, '30g') === 699);
  check('product-level size stock applies', getCurrentStock(jar, undefined, '50g') === 8);
  check('product-level size discount is derived', getCurrentDiscountPercent(jar, undefined, '30g') === 13);
}

// ==========================================
section('SKU — size → shade');
// ==========================================
{
  const product = catalogProduct();
  const heritage = findShade(product, 'heritage');
  const ceremonial = findShade(product, 'ceremonial');
  const rose = findShade(product, 'rose-quartz');

  check("a size's own SKU wins", getCurrentSku(product, ceremonial, '30g') === 'GLM-CS-30');
  check('the sibling size has its own', getCurrentSku(product, ceremonial, '50g') === 'GLM-CS-50');
  check('a shade SKU is used when the size has none', getCurrentSku(product, rose, undefined) === 'GLM-RQ');
  check('size SKU still wins when both exist', getCurrentSku(product, heritage, '50g') === 'GLM-HM-50');
  check('no SKU anywhere resolves to undefined', getCurrentSku(baseProduct(), undefined, undefined) === undefined);
  check(
    'a blank SKU is treated as absent rather than as an empty code',
    getCurrentSku(baseProduct({ shades: [shade('s', 'S', { sku: '   ' })] }), shade('s', 'S', { sku: '   ' }), undefined) ===
      undefined
  );
}

// ==========================================
section('STOCK — resolution and sellable units');
// ==========================================
{
  const product = catalogProduct();
  const heritage = findShade(product, 'heritage');
  const ceremonial = findShade(product, 'ceremonial');
  const rose = findShade(product, 'rose-quartz');
  const midnight = findShade(product, 'midnight');

  check('size stock applies when sizes exist', getCurrentStock(product, ceremonial, '30g') === 20);
  check('the sibling size has its own count', getCurrentStock(product, ceremonial, '50g') === 2);
  check('shade stock applies when it has no sizes', getCurrentStock(product, midnight, undefined) === 40);
  check('a shade with no stock of its own falls back to the product pool', getCurrentStock(baseProduct({ shades: [shade('a', 'A')] }), shade('a', 'A'), undefined) === 50);
  check('an explicit zero is honoured, not treated as absent', getCurrentStock(product, rose, undefined) === 0);
  check('isVariantInStock reads the shade, not the pool', !isVariantInStock(product, rose));

  const units = enumerateStockUnits(product);
  check('each active shade-size pair is one sellable unit', units.length === 4, `got ${units.length}`);
  check('the paused shade contributes no unit', !units.some((u) => u.variantId === 'midnight'));
  check(
    'a unit carries the stock that actually gates it',
    units.find((u) => u.variantId === 'ceremonial' && u.sizeLabel === '50g')?.stock === 2
  );
  check('a shade with no sizes is one unit at shade level', units.find((u) => u.variantId === 'rose-quartz')?.sizeLabel === undefined);

  check('a product with any stocked unit is sellable', hasSellableStock(product));
  const drained = catalogProduct();
  drained.stock = 0;
  check('a drained product pool does not sink shades that still have stock', hasSellableStock(drained));

  const empty = catalogProduct();
  empty.shades = empty.shades!.map((s) => ({
    ...s,
    stock: 0,
    sizes: (s.sizes || []).map((sz) => ({ ...sz, stock: 0 })),
  }));
  check('every unit at zero means nothing is sellable', !hasSellableStock(empty));
  check('a large product pool cannot rescue empty shades', !isProductSellable({ ...empty, stock: 999 }));

  const switchedOff = catalogProduct();
  switchedOff.inStock = false;
  check("the admin's off switch is respected even with stock on the shelf", !isProductSellable(switchedOff));

  check('stock status thresholds', stockStatus(0) === 'out-of-stock' && stockStatus(LOW_STOCK_THRESHOLD) === 'low-stock' && stockStatus(LOW_STOCK_THRESHOLD + 1) === 'in-stock');
}

// ==========================================
section('IMAGES — a shade never shows another shade\'s gallery');
// ==========================================
{
  const product = catalogProduct();
  const heritage = findShade(product, 'heritage');
  const ceremonial = findShade(product, 'ceremonial');
  const rose = findShade(product, 'rose-quartz');

  const heritageGallery = resolveVariantGallery(product, heritage);
  check('the primary image leads regardless of sortOrder', heritageGallery[0].url.includes('heritage-primary'));
  check('the rest follow in sortOrder', heritageGallery[1].url.includes('heritage-a'));
  check('only this shade\'s images are present', heritageGallery.every((img) => img.url.includes('heritage')));

  const ceremonialGallery = resolveVariantGallery(product, ceremonial);
  check('a different shade gets a different gallery', ceremonialGallery.every((img) => img.url.includes('ceremonial')));
  check(
    'no shade can ever show another shade\'s photograph',
    !ceremonialGallery.some((img) => img.url.includes('heritage') || img.url.includes('midnight'))
  );

  const roseGallery = resolveVariantGallery(product, rose);
  check('a shade with no gallery falls back to the PRODUCT images', roseGallery[0].url.includes('product-primary'));
  check(
    'the fallback is never another shade\'s gallery',
    !roseGallery.some((img) => img.url.includes('heritage') || img.url.includes('ceremonial'))
  );

  const blank = baseProduct({ shades: [shade('x', 'X', { images: [{ id: 'i', url: '', sortOrder: 0, isPrimary: true }] })] });
  check(
    'an image row with no URL does not create an empty gallery slot',
    resolveVariantGallery(blank, blank.shades![0])[0].url.includes('product-primary')
  );

  check(
    'the gallery reset key changes with the shade',
    variantGalleryResetKey(product, heritage) !== variantGalleryResetKey(product, ceremonial)
  );
  check(
    'and is stable for the same shade',
    variantGalleryResetKey(product, heritage) === variantGalleryResetKey(product, heritage)
  );
}

// ==========================================
section('SELECTION — what a shopper may pick');
// ==========================================
{
  const product = catalogProduct();

  check('paused shades are not offered', selectableShades(product).map((s) => s.id).join(',') === 'heritage,ceremonial,rose-quartz');
  check('a paused shade is not selectable', !isShadeSelectable(product, 'midnight'));
  check('an active shade is', isShadeSelectable(product, 'heritage'));
  check('an unknown id is not', !isShadeSelectable(product, 'does-not-exist'));

  // The fallback that keeps an all-paused product from rendering an empty
  // swatch row — and, because the cart admits exactly this set, keeps every
  // swatch shown addable.
  const allPaused = catalogProduct();
  allPaused.shades = allPaused.shades!.map((s) => ({ ...s, isActive: false }));
  check('an all-paused product still offers its shades rather than nothing', selectableShades(allPaused).length === 4);
  check('and every one of them is therefore addable', isShadeSelectable(allPaused, 'midnight'));

  const legacy = baseProduct({ shades: [shade('a', 'A', { isActive: undefined }), shade('b', 'B', { isActive: undefined })] });
  check('shades saved before isActive existed are all selectable', selectableShades(legacy).length === 2);

  check('the default shade is the first active one', getDefaultShade(product)?.id === 'heritage');
  check('with none active, the default is simply the first', getDefaultShade(allPaused)?.id === 'heritage');
  check('a product with no shades has no default', getDefaultShade(baseProduct()) === undefined);
}

// ==========================================
section('SIZE RESET — switching shades');
// ==========================================
{
  const product = catalogProduct();
  const heritage = findShade(product, 'heritage');
  const ceremonial = findShade(product, 'ceremonial');
  const rose = findShade(product, 'rose-quartz');

  check(
    'a size that exists on the new shade is kept',
    resolveSizeSelection(product, heritage, '50g') === '50g'
  );
  check(
    'a size that does NOT exist on the new shade is replaced, never carried over',
    resolveSizeSelection(product, heritage, '30g') === '50g'
  );
  check('switching to a shade with no sizes clears the selection', resolveSizeSelection(product, rose, '50g') === undefined);
  check('with no previous selection the first size is chosen', resolveSizeSelection(product, ceremonial, undefined) === '30g');
  check(
    'a paused size cannot be retained',
    (() => {
      const p = catalogProduct();
      p.shades![1].sizes![0].isActive = false;
      return resolveSizeSelection(p, findShade(p, 'ceremonial'), '30g') === '50g';
    })()
  );

  const jar = baseProduct({ shades: undefined, sizes: ['30g', '50g'], selectedSize: '50g' });
  check('a shade-less product keeps its own default size', resolveSizeSelection(jar, undefined, undefined) === '30g');
}

// ==========================================
section('ADMIN SUMMARY — derived card figures');
// ==========================================
{
  const product = catalogProduct();
  const heritage = summarizeShade(product, findShade(product, 'heritage'));
  const ceremonial = summarizeShade(product, findShade(product, 'ceremonial'));
  const rose = summarizeShade(product, findShade(product, 'rose-quartz'));

  check('starting price is the cheapest sellable size', ceremonial.startingPrice === 999);
  check('a single-size shade starts at that size', heritage.startingPrice === 1499);
  check('an inheriting shade starts at the product price', rose.startingPrice === 1299);
  check('inheritance is reported, not hidden', rose.inheritsPrice && !heritage.inheritsPrice);

  // The collapsed card's compare-at must belong to the SAME unit that set the
  // starting price, or it advertises a saving no single purchase can produce.
  check('compare-at comes from the unit that set the starting price', ceremonial.startingCompareAtPrice === 1299);
  check('and the discount is derived from that same pair', ceremonial.startingDiscountPercent === 23);
  check('a single-size shade reports its own pair', heritage.startingCompareAtPrice === 1799 && heritage.startingDiscountPercent === 17);
  check('an inheriting shade reports the product pair', rose.startingCompareAtPrice === 1599 && rose.startingDiscountPercent === 19);
  check(
    'a shade with no markdown reports no discount',
    (() => {
      const flat = catalogProduct();
      flat.shades![1].sizes = [size('only', '50g', 999, { compareAtPrice: 999, stock: 4 })];
      const s = summarizeShade(flat, findShade(flat, 'ceremonial'));
      return s.startingDiscountPercent === null;
    })()
  );

  check('total stock sums the shade\'s sellable units', ceremonial.totalStock === 22);
  check('a shade with no sizes reports its own stock', rose.totalStock === 0);
  check('image count is the shade\'s own', heritage.imageCount === 2 && rose.imageCount === 0);
  check('size count excludes paused sizes', ceremonial.sizeCount === 2);
  check('status is derived from the resolved stock', rose.status === 'out-of-stock');
  check('a comfortable stock reads as in-stock', heritage.status === 'in-stock');
  check(
    'a thin stock reads as low',
    (() => {
      const thin = catalogProduct();
      thin.shades![0].sizes![0].stock = 3;
      return summarizeShade(thin, findShade(thin, 'heritage')).status === 'low-stock';
    })()
  );

  check('a shade that has a SKU is not flagged for one', !rose.warnings.some((w) => w.includes('SKU')));
  check(
    'a shade whose SKU lives only on its sizes is not flagged either',
    !ceremonial.warnings.some((w) => w.includes('SKU'))
  );
  const bare = baseProduct({ shades: [shade('bare', 'Bare')] });
  const bareSummary = summarizeShade(bare, bare.shades![0]);
  check('a bare shade reports every gap', bareSummary.warnings.length === 4, bareSummary.warnings.join(' | '));
  check('and is not marked ready', !bareSummary.ready);
  check('a fully configured shade is ready', summarizeShade(product, findShade(product, 'heritage')).ready);
  check(
    'inheriting the product price is reported but never blocks a save',
    validateProductVariants(bare) === null && bareSummary.warnings.some((w) => w.includes('inherits product price'))
  );
}

// ==========================================
section('DUPLICATION — a copy is a new variant, not a second reference');
// ==========================================
{
  const product = catalogProduct();
  const source = findShade(product, 'heritage');
  const clone = duplicateShade(source);

  check('the clone gets its own id', clone.id !== source.id && !!clone.id);
  check('and is marked as a copy', clone.name === 'Heritage Maroon (Copy)');
  check('the SKU is cleared, never copied', clone.sku === undefined);
  check('every size gets a new id', clone.sizes!.every((s, i) => s.id !== source.sizes![i].id));
  check('and every size SKU is cleared', clone.sizes!.every((s) => s.sku === undefined));
  check('every image row gets a new id', clone.images!.every((img, i) => img.id !== source.images![i].id));
  check(
    'but the image URLs are kept — the asset is shared, not re-uploaded',
    clone.images!.map((i) => i.url).join(',') === source.images!.map((i) => i.url).join(',')
  );
  check('pricing is carried over', clone.sizes![0].price === 1499 && clone.sizes![0].compareAtPrice === 1799);
  check('the source is not mutated', source.name === 'Heritage Maroon' && source.sku === 'GLM-HM');
  check(
    'deep structures are copied, not shared by reference',
    (() => {
      clone.sizes![0].price = 1;
      return source.sizes![0].price === 1499;
    })()
  );

  // A product carrying the clone must still save — which is the whole point
  // of clearing the ids and SKUs.
  const withClone = catalogProduct();
  withClone.shades = [...withClone.shades!, duplicateShade(findShade(withClone, 'heritage'))];
  check('a product with a duplicated shade passes validation', validateProductVariants(withClone) === null, String(validateProductVariants(withClone)));

  // Two clones of the same source, taken back to back, must not collide.
  const twin = duplicateShade(source);
  const twin2 = duplicateShade(source);
  check('two clones of one shade get different ids', twin.id !== twin2.id);

  const sizes = findShade(product, 'ceremonial').sizes!;
  const duplicated = duplicateSize(sizes, 'cs-30');
  check('the copy is inserted next to its source', duplicated.length === 3 && duplicated[1].label === '30g Copy');
  check('with a new id', duplicated[1].id !== 'cs-30');
  check('and no SKU', duplicated[1].sku === undefined);
  check('pricing is carried over', duplicated[1].price === 999 && duplicated[1].compareAtPrice === 1299);
  check('the original is untouched', duplicated[0].label === '30g' && duplicated[0].sku === 'GLM-CS-30');
  check('an unknown size id changes nothing', duplicateSize(sizes, 'nope').length === 2);

  // Duplicating the duplicate must not produce a second "30g Copy".
  const twiceDuplicated = duplicateSize(duplicated, 'cs-30');
  const labels = twiceDuplicated.map((s) => s.label);
  check('a second copy gets a distinct label', new Set(labels).size === labels.length, labels.join(','));

  const withDupSize = catalogProduct();
  withDupSize.shades![1].sizes = duplicated;
  check('a shade with a duplicated size still validates', validateProductVariants(withDupSize) === null, String(validateProductVariants(withDupSize)));
}

// ==========================================
section('VALIDATION — rejects');
// ==========================================
{
  const rejects = (label: string, product: Partial<Product>, fragment: string) => {
    const error = validateProductVariants(product);
    check(label, !!error && error.toLowerCase().includes(fragment.toLowerCase()), `got: ${error ?? 'null'}`);
  };

  rejects('an empty shade name', baseProduct({ shades: [shade('a', '  ')] }), 'needs a name');
  rejects(
    'two shades sharing an internal id',
    baseProduct({ shades: [shade('dupe', 'A'), shade('dupe', 'B')] }),
    'share the internal id'
  );
  rejects('a missing shade id', baseProduct({ shades: [{ ...shade('', 'A') }] }), 'missing its internal id');
  rejects('a malformed hex', baseProduct({ shades: [shade('a', 'A', { hex: 'C9972B' })] }), 'invalid colour');
  rejects('a half-typed hex', baseProduct({ shades: [shade('a', 'A', { hex: '#C99' + '7' })] }), 'invalid colour');
  rejects('a negative shade price', baseProduct({ shades: [shade('a', 'A', { price: -1 })] }), 'invalid price');
  rejects('a negative shade stock', baseProduct({ shades: [shade('a', 'A', { stock: -5 })] }), 'invalid stock');
  rejects(
    'a compare-at below the shade price',
    baseProduct({ shades: [shade('a', 'A', { price: 999, compareAtPrice: 799 })] }),
    'below its selling price'
  );
  rejects(
    'a compare-at below the inherited product price',
    baseProduct({ price: 1299, shades: [shade('a', 'A', { compareAtPrice: 999 })] }),
    'below its selling price'
  );
  rejects(
    'a size with no label',
    baseProduct({ shades: [shade('a', 'A', { sizes: [size('s1', '  ', 100)] })] }),
    'needs a label'
  );
  rejects(
    'a negative size price',
    baseProduct({ shades: [shade('a', 'A', { sizes: [size('s1', '30g', -5)] })] }),
    'invalid price'
  );
  rejects(
    'a compare-at below the size price',
    baseProduct({ shades: [shade('a', 'A', { sizes: [size('s1', '30g', 999, { compareAtPrice: 799 })] })] }),
    'below its selling price'
  );
  rejects(
    'duplicate size labels within one shade',
    baseProduct({ shades: [shade('a', 'A', { sizes: [size('s1', '30g', 100), size('s2', '30g', 200)] })] }),
    'two sizes labelled'
  );
  rejects(
    'an unusable variant image URL',
    baseProduct({
      shades: [shade('a', 'A', { images: [{ id: 'i', url: 'javascript:alert(1)', sortOrder: 0, isPrimary: true }] })],
    }),
    'unusable url'
  );
  rejects(
    'a product compare-at below the product price',
    baseProduct({ price: 1299, originalPrice: 999 }),
    'below its selling price'
  );

  // SKU collisions — and, specifically, that the message says WHERE.
  const skuAcrossShades = validateProductVariants(
    baseProduct({ shades: [shade('a', 'Heritage Maroon', { sku: 'GLM-1' }), shade('b', 'Rose Quartz', { sku: 'glm-1' })] })
  );
  check('a duplicate SKU across shades is rejected case-insensitively', !!skuAcrossShades);
  check(
    'and the message names both shades',
    !!skuAcrossShades && skuAcrossShades.includes('Heritage Maroon') && skuAcrossShades.includes('Rose Quartz'),
    skuAcrossShades ?? 'null'
  );

  const skuShadeVsSize = validateProductVariants(
    baseProduct({
      shades: [
        shade('a', 'Heritage Maroon', { sku: 'GLM-WB-30' }),
        shade('b', 'Ceremonial Scarlet', { sizes: [size('s1', '30g', 699, { sku: 'GLM-WB-30' })] }),
      ],
    })
  );
  check('a shade SKU colliding with a size SKU is rejected', !!skuShadeVsSize);
  check(
    'and the message names the exact size',
    !!skuShadeVsSize && skuShadeVsSize.includes('"30g"') && skuShadeVsSize.includes('Ceremonial Scarlet'),
    skuShadeVsSize ?? 'null'
  );

  const skuWithinShade = validateProductVariants(
    baseProduct({
      shades: [
        shade('a', 'A', { sizes: [size('s1', '30g', 699, { sku: 'DUP' }), size('s2', '50g', 899, { sku: 'DUP' })] }),
      ],
    })
  );
  check('two sizes of one shade cannot share a SKU', !!skuWithinShade);
}

// ==========================================
section('VALIDATION — an omitted field is not an error');
// ==========================================
{
  const accepts = (label: string, product: Partial<Product>) => {
    const error = validateProductVariants(product);
    check(label, error === null, `rejected with: ${error}`);
  };

  accepts('the full four-shade catalogue product', catalogProduct());
  accepts('a product with no shades at all', baseProduct());
  accepts('a shade with no price — it inherits the product price', baseProduct({ shades: [shade('a', 'A')] }));
  accepts('a shade with no stock — it follows the stock chain', baseProduct({ shades: [shade('a', 'A', { stock: undefined })] }));
  accepts('a shade with no SKU', baseProduct({ shades: [shade('a', 'A', { sku: undefined })] }));
  accepts('a shade with no images', baseProduct({ shades: [shade('a', 'A', { images: [] })] }));
  accepts('a shade with no sizes', baseProduct({ shades: [shade('a', 'A', { sizes: [] })] }));
  accepts('a zero price — free is a price, not a missing value', baseProduct({ shades: [shade('a', 'A', { price: 0 })] }));
  accepts('a zero stock — sold out is a quantity, not a missing value', baseProduct({ shades: [shade('a', 'A', { stock: 0 })] }));
  accepts(
    'a compare-at EQUAL to the price — no discount, not an error',
    baseProduct({ shades: [shade('a', 'A', { price: 999, compareAtPrice: 999 })] })
  );
  accepts('3-digit shorthand hex', baseProduct({ shades: [shade('a', 'A', { hex: '#FFF' })] }));
  accepts(
    'an image slot that is set but empty — not configured yet',
    baseProduct({ shades: [shade('a', 'A', { images: [{ id: 'i', url: '', sortOrder: 0, isPrimary: false }] })] })
  );
  accepts(
    'a relative image path from before Cloudinary',
    baseProduct({ shades: [shade('a', 'A', { images: [{ id: 'i', url: '/assets/legacy.jpg', sortOrder: 0, isPrimary: true }] })] })
  );
  accepts(
    'two shades with the same SIZE labels — labels are unique per shade, not per product',
    baseProduct({
      shades: [
        shade('a', 'A', { sizes: [size('s1', '50g', 100)] }),
        shade('b', 'B', { sizes: [size('s2', '50g', 200)] }),
      ],
    })
  );
}

// ==========================================
section('BACKWARD COMPATIBILITY — records saved before any of this existed');
// ==========================================
{
  // Exactly the shape the original seed data has: no isActive, no price, no
  // stock, no images, no sizes, no SKU.
  const legacyShade = {
    id: 'legacy-1',
    name: 'Royal Terracotta',
    hex: '#C9972B',
    undertone: 'Warm',
    description: 'Warm burnt saffron.',
  } as Shade;
  const legacy = baseProduct({ shades: [legacyShade] });

  check('it saves unchanged', validateProductVariants(legacy) === null);
  check('it is selectable', isShadeSelectable(legacy, 'legacy-1'));
  check('it is the default shade', getDefaultShade(legacy)?.id === 'legacy-1');
  check('it charges the product price', getCurrentPrice(legacy, legacyShade, undefined) === 1299);
  check('it carries the product compare-at', getCurrentCompareAtPrice(legacy, legacyShade, undefined) === 1599);
  check('it reports the product stock', getCurrentStock(legacy, legacyShade, undefined) === 50);
  check('it shows the product images', resolveVariantGallery(legacy, legacyShade)[0].url.includes('product-primary'));
  check('it has no size dimension', getActiveSizeOptions(legacy, legacyShade).length === 0);
  check('it has no SKU', getCurrentSku(legacy, legacyShade, undefined) === undefined);
  check('it is one sellable unit at shade level', enumerateStockUnits(legacy).length === 1);
  check('it is sellable', isProductSellable(legacy));
  check('getVariantStock still reads the pool', getVariantStock(legacy, legacyShade) === 50);

  // A legacy size with no isActive and no SKU.
  const legacySize = { id: 'ls', label: '50g', price: 899 } as SizeOption;
  const withLegacySize = baseProduct({ shades: [{ ...legacyShade, sizes: [legacySize] }] });
  check('a legacy size is offered', getActiveSizeOptions(withLegacySize, withLegacySize.shades![0]).length === 1);
  check('and priced', getCurrentPrice(withLegacySize, withLegacySize.shades![0], '50g') === 899);
  check(
    'and falls back to the product pool for stock',
    getCurrentStock(withLegacySize, withLegacySize.shades![0], '50g') === 50
  );
  check('and saves unchanged', validateProductVariants(withLegacySize) === null);
}

// ==========================================
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
