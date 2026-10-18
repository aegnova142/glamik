/**
 * ShadeFinderModal against catalogues that cannot satisfy it.
 *
 * The bug: getMatchedShade() fell back to catalogProducts[0], [1] and [3] and
 * then dereferenced `.shades` on whatever came back. A catalogue with fewer
 * than four products produced `undefined.shades` — and `undefined.price` on
 * the cleanser card — which threw during render. With no error boundary above
 * it, that single throw blanked the whole storefront. It was reached in
 * practice when the catalogue was reduced to two products.
 *
 * The project compiles without strictNullChecks, so none of this was a type
 * error. These tests are the only thing standing between a renamed product id
 * and a white page.
 *
 * WHY THESE TESTS WALK THE QUIZ
 *
 * The modal opens on step 1, but the crash is on step 4: that is where
 * `matched.cleanserProduct.price` and the shade hexes are read. A test that
 * only renders the modal and asserts "did not throw" passes against the
 * BROKEN component — it never reaches the code that breaks. So every case
 * below drives all three quiz steps and asserts what step 4 actually shows.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

/** Swapped per test to stand in for whatever the CMS currently holds. */
let catalogue: any[] = [];
vi.mock('@glamirk/shared/context/CMSContext', () => ({
  useCMS: () => ({ products: catalogue }),
}));

import { ShadeFinderModal } from '../components/discovery/ShadeFinderModal';

const shade = (id: string, name: string) => ({ id, name, hex: '#B4446C', description: name });

const LIP = {
  id: 'matte-liquid-lipstick-collection',
  name: 'Matte Liquid Lipstick',
  price: 1290,
  shades: [shade('shade-royal-rose', 'Royal Rose'), shade('shade-spice-velvet', 'Spice Velvet')],
};
const SINDOOR = {
  id: 'luxury-sindoor-collection',
  name: 'Luxury Sindoor',
  price: 890,
  shades: [shade('sindoor-scarlet-glam', 'Ceremonial Scarlet')],
};
const CLEANSER = { id: 'balm-to-water-cleanser-50g', name: 'Balm to Water Cleanser', price: 1490 };

function renderModal() {
  return render(
    <ShadeFinderModal isOpen onClose={vi.fn()} onSelectProduct={vi.fn()} onAddToBag={vi.fn()} />
  );
}

/**
 * Walks steps 1 → 2 → 3 → 4.
 *
 * Each quiz step renders the same shape: a close button, the options, then
 * (from step 2) Back, and the advance button last. So picking the first real
 * option and then the last button carries the quiz forward without depending
 * on the option wording, which is copy and will change.
 *
 * Returns the error if the walk throws, so a test can assert on the crash
 * itself rather than letting it surface as an unhandled render failure.
 */
function driveToResults(): Error | null {
  try {
    for (let step = 0; step < 3; step++) {
      const options = screen.getAllByRole('button');
      fireEvent.click(options[1]);
      const advance = screen.getAllByRole('button');
      fireEvent.click(advance[advance.length - 1]);
    }
    return null;
  } catch (err) {
    return err as Error;
  }
}

const unavailablePanel = () => screen.queryByText(/shade matching is unavailable/i);
const matchCards = () => screen.queryByText(/add complete match set/i);

afterEach(() => {
  cleanup();
  catalogue = [];
});

describe('ShadeFinderModal — reaching the results step with a catalogue that cannot satisfy it', () => {
  it('a PARTIAL two-product catalogue shows the unavailable panel instead of crashing', () => {
    // The exact shape the test database had been reduced to when this was
    // found. On the old code this threw "Cannot read properties of undefined
    // (reading 'price')" — catalogProducts[3] was the missing cleanser.
    catalogue = [LIP, SINDOOR];
    renderModal();

    const crash = driveToResults();

    expect(crash).toBeNull();
    expect(unavailablePanel()).toBeInTheDocument();
    expect(matchCards()).not.toBeInTheDocument();
  });

  it('a single-product catalogue shows the unavailable panel', () => {
    catalogue = [LIP];
    renderModal();

    expect(driveToResults()).toBeNull();
    expect(unavailablePanel()).toBeInTheDocument();
  });

  it('renamed product ids show the unavailable panel rather than matching the wrong products', () => {
    // Positional fallbacks used to paper over this and recommend whatever
    // happened to be first in the catalogue. Declining to match is the
    // correct answer: a retired product is a merchandising decision.
    catalogue = [
      { ...LIP, id: 'some-other-lipstick' },
      { ...SINDOOR, id: 'some-other-sindoor' },
      { ...CLEANSER, id: 'some-other-cleanser' },
    ];
    renderModal();

    expect(driveToResults()).toBeNull();
    expect(unavailablePanel()).toBeInTheDocument();
    expect(matchCards()).not.toBeInTheDocument();
  });

  it('a product present but carrying an EMPTY shade list shows the unavailable panel', () => {
    // Present but unusable: every results card reads a shade's hex and name.
    catalogue = [{ ...LIP, shades: [] }, SINDOOR, CLEANSER];
    renderModal();

    expect(driveToResults()).toBeNull();
    expect(unavailablePanel()).toBeInTheDocument();
  });

  it('a product with no shades key at all shows the unavailable panel', () => {
    const { shades, ...lipWithoutShades } = LIP;
    void shades;
    catalogue = [lipWithoutShades, SINDOOR, CLEANSER];
    renderModal();

    expect(driveToResults()).toBeNull();
    expect(unavailablePanel()).toBeInTheDocument();
  });

  it('a missing sindoor shows the unavailable panel', () => {
    catalogue = [LIP, CLEANSER];
    renderModal();

    expect(driveToResults()).toBeNull();
    expect(unavailablePanel()).toBeInTheDocument();
  });

  it('a missing cleanser shows the unavailable panel', () => {
    // The cleanser carries no shades, so it is only ever read for its price —
    // which is precisely the dereference that used to throw.
    catalogue = [LIP, SINDOOR];
    renderModal();

    expect(driveToResults()).toBeNull();
    expect(unavailablePanel()).toBeInTheDocument();
  });

  it('the unavailable panel offers a way out', () => {
    catalogue = [LIP];
    renderModal();
    driveToResults();

    // By text, not by role+name: the modal has its own close control, so
    // matching /close/i on the role finds two.
    expect(screen.getByText('CLOSE')).toBeInTheDocument();
  });
});

describe('ShadeFinderModal — a complete catalogue still matches', () => {
  it('renders the match cards and never claims matching is unavailable', () => {
    catalogue = [LIP, SINDOOR, CLEANSER];
    renderModal();

    expect(driveToResults()).toBeNull();
    expect(matchCards()).toBeInTheDocument();
    expect(unavailablePanel()).not.toBeInTheDocument();
  });

  it('names the matched products on the results cards', () => {
    catalogue = [LIP, SINDOOR, CLEANSER];
    renderModal();
    driveToResults();

    expect(screen.getByText(/matte liquid —/i)).toBeInTheDocument();
    expect(screen.getByText(/luxury sindoor —/i)).toBeInTheDocument();
  });

  it('an EMPTY cms catalogue falls back to the bundled products and still matches', () => {
    // Documented deliberately: ShadeFinderModal uses GLAMIRK_PRODUCTS when the
    // CMS returns nothing, so "empty" is the one case that is NOT at risk. The
    // dangerous input is a PARTIAL catalogue, which is what the cases above
    // cover.
    catalogue = [];
    renderModal();

    expect(driveToResults()).toBeNull();
    expect(matchCards()).toBeInTheDocument();
    expect(unavailablePanel()).not.toBeInTheDocument();
  });
});

describe('ShadeFinderModal — the initial render', () => {
  // These two caught the bug even without walking the quiz, because
  // getMatchedShade() runs unconditionally on every render. Kept as the
  // cheapest possible canary.
  it('opens without throwing when the catalogue holds a single product', () => {
    catalogue = [LIP];
    expect(() => renderModal()).not.toThrow();
  });

  it('opens without throwing when a product has no shades key', () => {
    const { shades, ...lipWithoutShades } = LIP;
    void shades;
    catalogue = [lipWithoutShades, SINDOOR, CLEANSER];
    expect(() => renderModal()).not.toThrow();
  });
});
