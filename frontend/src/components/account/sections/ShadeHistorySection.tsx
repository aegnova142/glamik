/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Bot, Sparkles, Trash2, Camera, ShoppingBag } from 'lucide-react';
import { Product, Shade } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { ProductImage } from '../../product/ProductImage';
import {
  AccountButton,
  AccountCard,
  AccountEmpty,
  AccountError,
  AccountLoading,
  AccountSectionHeader,
  formatDateTime,
  formatMoney,
} from '../AccountUI';

interface ShadeHistorySectionProps {
  allProducts: Product[];
  onOpenShadeFinder: () => void;
  onSelectProduct: (product: Product) => void;
  onOpenTryOn: (product: Product, shade?: Shade) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  showToast: (message: string) => void;
}

export const ShadeHistorySection: React.FC<ShadeHistorySectionProps> = ({
  allProducts,
  onOpenShadeFinder,
  onSelectProduct,
  onOpenTryOn,
  onAddToBag,
  showToast,
}) => {
  const { shadeHistory, loadShadeHistory, deleteShadeResult } = useAccount();
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    loadShadeHistory();
  }, [loadShadeHistory]);

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    const res = await deleteShadeResult(id);
    setRemovingId(null);
    showToast(res.success ? 'Result removed' : res.error || 'Could not remove this result.');
  };

  if (shadeHistory.loading && !shadeHistory.loaded) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Shade AI" title="Shade AI History" />
        <AccountLoading label="Loading your shade results" />
      </div>
    );
  }

  if (shadeHistory.error && !shadeHistory.data) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Shade AI" title="Shade AI History" />
        <AccountError message={shadeHistory.error} onRetry={() => loadShadeHistory(true)} />
      </div>
    );
  }

  const history = shadeHistory.data || [];

  return (
    <div className="space-y-6">
      <AccountSectionHeader
        kicker="Shade AI"
        title="Shade AI History"
        description="Every shade match you've run, saved to your account so you can revisit a result instead of redoing the quiz."
        action={
          <AccountButton variant="secondary" onClick={onOpenShadeFinder}>
            <Sparkles className="w-3.5 h-3.5" />
            New Shade Match
          </AccountButton>
        }
      />

      {history.length === 0 ? (
        <AccountEmpty
          icon={Bot}
          title="No shade results yet."
          description="Run the Shade AI quiz and your matches will be saved here automatically."
          actionLabel="Find My Shade"
          onAction={onOpenShadeFinder}
        />
      ) : (
        <div className="space-y-4">
          {history.map((entry) => {
            const product = entry.recommendedProductId
              ? allProducts.find((p) => p.id === entry.recommendedProductId)
              : undefined;
            const shade = product && entry.recommendedShadeId
              ? product.shades?.find((s) => s.id === entry.recommendedShadeId)
              : undefined;
            const answers = Object.entries(entry.answers || {});

            return (
              <AccountCard key={entry.id} className="overflow-hidden">
                <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#E8D5A8] flex items-center justify-between gap-3">
                  <span className="text-[11.5px] text-[#524C4C]">{formatDateTime(entry.createdAt)}</span>
                  <button
                    onClick={() => handleRemove(entry.id)}
                    disabled={removingId === entry.id}
                    aria-label="Remove this result"
                    className="p-1.5 text-[#524C4C] hover:text-[#C0392B] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
                  {/* Answers + match */}
                  <div className="space-y-4 min-w-0">
                    <div className="flex flex-wrap gap-2">
                      {[
                        entry.skinTone && { label: 'Tone', value: entry.skinTone },
                        entry.undertone && { label: 'Undertone', value: entry.undertone },
                        entry.finishPreference && { label: 'Finish', value: entry.finishPreference },
                        entry.stylePreference && { label: 'Style', value: entry.stylePreference },
                        entry.occasion && { label: 'Occasion', value: entry.occasion },
                      ]
                        .filter(Boolean)
                        .map((chip: any) => (
                          <span
                            key={chip.label}
                            className="px-2.5 py-1 bg-[#FAF9F6] border border-[#E8D5A8] rounded-full text-[10.5px] text-[#121212]"
                          >
                            <span className="text-[#524C4C]">{chip.label}:</span> {chip.value}
                          </span>
                        ))}
                    </div>

                    {answers.length > 0 && (
                      <dl className="space-y-1.5 text-[11.5px]">
                        {answers.map(([question, answer]) => (
                          <div key={question} className="flex gap-2">
                            <dt className="text-[#524C4C] shrink-0">{question}:</dt>
                            <dd className="text-[#121212]">{answer}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {entry.matchReason && (
                      <p className="text-[12px] text-[#524C4C] leading-relaxed bg-[#FAF9F6] border border-[#E8D5A8] rounded-lg p-3.5">
                        {entry.matchReason}
                      </p>
                    )}
                  </div>

                  {/* Recommended product. If the admin has since removed it
                      from the catalogue, the match is still shown but the
                      shop/try-on actions are not offered. */}
                  <div className="lg:border-l lg:border-[#F1EBDD] lg:pl-6">
                    <span className="text-[9.5px] font-semibold tracking-[0.18em] uppercase text-[#C9972B] block mb-3">
                      Your Match
                    </span>

                    {entry.recommendedShadeName && (
                      <div className="flex items-center gap-2.5 mb-3">
                        {entry.recommendedShadeHex && (
                          <span
                            className="w-7 h-7 rounded-full border border-[#0B0B0B]/10 shrink-0"
                            style={{ backgroundColor: entry.recommendedShadeHex }}
                          />
                        )}
                        <span className="font-serif text-base text-[#121212]">{entry.recommendedShadeName}</span>
                      </div>
                    )}

                    {product ? (
                      <div className="space-y-3">
                        <button
                          onClick={() => onSelectProduct(product)}
                          className="flex gap-3 text-left w-full group cursor-pointer"
                        >
                          <ProductImage
                            src={product.images?.primary}
                            alt=""
                            className="w-14 h-16 object-cover border border-[#E8D5A8] rounded shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="font-serif text-[13.5px] text-[#121212] group-hover:text-[#C9972B] transition-colors block leading-snug">
                              {product.name}
                            </span>
                            <span className="text-[12px] text-[#524C4C]">{formatMoney(product.price)}</span>
                          </div>
                        </button>

                        <div className="flex flex-wrap gap-2">
                          <AccountButton variant="secondary" onClick={() => onSelectProduct(product)}>
                            View Product
                          </AccountButton>
                          {/* Try-On is admin-controlled per product; only
                              offered where it's actually been enabled. */}
                          {product.enableTryOn !== false && (
                            <AccountButton variant="ghost" onClick={() => onOpenTryOn(product, shade)}>
                              <Camera className="w-3.5 h-3.5" />
                              Try On
                            </AccountButton>
                          )}
                          <AccountButton variant="ghost" onClick={() => onAddToBag(product, shade || product.shades?.[0])}>
                            <ShoppingBag className="w-3.5 h-3.5" />
                            Add
                          </AccountButton>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11.5px] text-[#524C4C]">
                        {entry.recommendedProductId
                          ? 'The matched product is no longer available in our catalogue.'
                          : 'No product was matched for this result.'}
                      </p>
                    )}
                  </div>
                </div>
              </AccountCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
