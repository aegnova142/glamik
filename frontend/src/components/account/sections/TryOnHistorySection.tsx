/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Camera, ShoppingBag, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { Product, Shade, TryOnHistoryEntry } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { ProductImage } from '../../product/ProductImage';
import {
  AccountButton,
  AccountEmpty,
  AccountError,
  AccountLoading,
  AccountSectionHeader,
  formatDate,
} from '../AccountUI';

interface TryOnHistorySectionProps {
  allProducts: Product[];
  onOpenTryOn: (product: Product, shade?: Shade) => void;
  onSelectProduct: (product: Product) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  showToast: (message: string) => void;
}

export const TryOnHistorySection: React.FC<TryOnHistorySectionProps> = ({
  allProducts,
  onOpenTryOn,
  onSelectProduct,
  onAddToBag,
  showToast,
}) => {
  const { tryOnHistory, loadTryOnHistory, deleteTryOnEntry, clearTryOnHistory } = useAccount();
  const [clearing, setClearing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    loadTryOnHistory();
  }, [loadTryOnHistory]);

  const header = (action?: React.ReactNode) => (
    <AccountSectionHeader
      kicker="Beauty Profile"
      title="Virtual Try-On History"
      description="Every shade you've tried on, so you can go straight back to the one you liked."
      action={action}
    />
  );

  if (tryOnHistory.loading && !tryOnHistory.loaded) {
    return (
      <div className="space-y-6">
        {header()}
        <AccountLoading label="Loading your try-ons" />
      </div>
    );
  }

  if (tryOnHistory.error && !tryOnHistory.data) {
    return (
      <div className="space-y-6">
        {header()}
        <AccountError message={tryOnHistory.error} onRetry={() => loadTryOnHistory(true)} />
      </div>
    );
  }

  const entries: TryOnHistoryEntry[] = tryOnHistory.data || [];

  const handleClear = async () => {
    setClearing(true);
    const res = await clearTryOnHistory();
    setClearing(false);
    showToast(res.success ? 'Try-on history cleared' : res.error || 'Could not clear your history.');
  };

  const handleRemove = async (entry: TryOnHistoryEntry) => {
    setRemovingId(entry.id);
    const res = await deleteTryOnEntry(entry.id);
    setRemovingId(null);
    if (!res.success) showToast(res.error || 'Could not remove this entry.');
  };

  /** The live product behind an entry. Absent once a product is delisted —
   * the entry still renders, but its actions are disabled rather than
   * throwing the customer at a dead product page. */
  const productFor = (entry: TryOnHistoryEntry): Product | undefined =>
    allProducts.find((p) => p.id === entry.productId);

  return (
    <div className="space-y-6">
      {header(
        entries.length > 0 && (
          <AccountButton variant="ghost" loading={clearing} onClick={handleClear}>
            <Trash2 className="w-3.5 h-3.5" />
            Clear History
          </AccountButton>
        )
      )}

      {entries.length === 0 ? (
        <AccountEmpty
          icon={Sparkles}
          title="No try-ons yet."
          description="Try a shade on with the Virtual Try-On and it will be saved here for next time."
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {entries.map((entry) => {
            const product = productFor(entry);
            const shade = entry.shadeId ? product?.shades?.find((s) => s.id === entry.shadeId) : undefined;
            const outOfStock = !product || product.inStock === false || product.stock === 0;
            const ModeIcon = entry.mode === 'live' ? Camera : UserRound;

            return (
              <article
                key={entry.id}
                className="bg-white border border-[#E8D5A8] rounded-xl overflow-hidden flex flex-col group relative"
              >
                <button
                  onClick={() => handleRemove(entry)}
                  disabled={removingId === entry.id}
                  aria-label={`Remove ${entry.productName} from try-on history`}
                  className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/90 border border-[#E8D5A8] text-[#6B6B6B] hover:text-[#C0392B] hover:border-[#C0392B] transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => product && onSelectProduct(product)}
                  disabled={!entry.isAvailable || !product}
                  className="aspect-square bg-[#FAF9F6] overflow-hidden relative block w-full cursor-pointer disabled:cursor-default"
                  aria-label={product ? `View ${entry.productName}` : `${entry.productName} is no longer available`}
                >
                  <ProductImage
                    src={entry.productImage}
                    alt={entry.productName}
                    className={`w-full h-full object-cover transition-transform duration-500 ${
                      entry.isAvailable ? 'group-hover:scale-105' : 'opacity-50 grayscale'
                    }`}
                  />
                  {!entry.isAvailable && (
                    <span className="absolute inset-x-0 bottom-0 bg-[#0B0B0B]/80 text-[#E3B84B] text-[9.5px] font-semibold tracking-[0.14em] uppercase py-1.5">
                      No longer sold
                    </span>
                  )}
                </button>

                <div className="p-3.5 flex-1 flex flex-col">
                  <p className="font-serif text-[13.5px] text-[#121212] leading-snug line-clamp-2">
                    {entry.productName}
                  </p>

                  {entry.shadeName && (
                    <span className="inline-flex items-center gap-1.5 mt-1.5">
                      {entry.shadeHex && (
                        <span
                          className="w-3 h-3 rounded-full border border-[#E8D5A8] shrink-0"
                          style={{ backgroundColor: entry.shadeHex }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="text-[11px] text-[#6B6B6B] truncate">{entry.shadeName}</span>
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1.5 text-[10.5px] text-[#9C9689] mt-1">
                    <ModeIcon className="w-3 h-3 shrink-0" />
                    {entry.mode === 'live' ? 'Live camera' : 'Standard model'} · {formatDate(entry.triedAt)}
                  </span>

                  <div className="grid grid-cols-[1fr_auto] gap-1.5 mt-3 pt-3 border-t border-[#F1EBDD]">
                    <button
                      onClick={() => product && onOpenTryOn(product, shade)}
                      disabled={!entry.isAvailable || !product}
                      className="py-2 border border-[#0B0B0B] text-[#121212] text-[9.5px] font-semibold tracking-[0.12em] uppercase rounded-full hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3" />
                      Try Again
                    </button>
                    <button
                      onClick={() => product && onAddToBag(product, shade, product.sizes?.[0], 1)}
                      disabled={outOfStock}
                      aria-label={`Add ${entry.productName} to bag`}
                      className="px-2.5 py-2 bg-[#0B0B0B] text-white rounded-full hover:bg-[#171717] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
