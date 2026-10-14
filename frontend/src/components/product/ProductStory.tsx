import React from 'react';
import { Droplet, Feather, ShieldCheck, Sparkles } from 'lucide-react';
import { Product, Shade } from '@glamirk/shared/types';
import { ProductImage } from './ProductImage';

/** Decorative only — the claim is always the benefit text beside it. */
const BENEFIT_ICONS = [Droplet, Feather, ShieldCheck, Sparkles];

interface ProductStoryProps {
  product: Product;
  selectedShade?: Shade;
}

/**
 * Editorial continuation of the gallery: the product's benefits, the
 * selected shade's story, and its key finish attributes. Everything comes
 * from the product record; any piece that is missing is simply left out.
 *
 * Deliberately not a copy of the Product Overview accordion — that shows
 * `details.overview`; this tells the shorter `description`.
 */
export const ProductStory: React.FC<ProductStoryProps> = ({ product, selectedShade }) => {
  // Rendered twice (desktop column / mobile panel, one hidden), so ids must be unique.
  const titleId = React.useId();
  const benefits = product.benefits.slice(0, 4);
  const highlights = [
    product.finish ? { label: 'Finish', value: product.finish } : null,
    product.coverage ? { label: 'Coverage', value: product.coverage } : null,
    product.texture ? { label: 'Texture', value: product.texture } : null,
  ].filter((h): h is { label: string; value: string } => !!h);
  const storyImages = [
    { src: product.images.swatch, label: 'swatch' },
    { src: product.images.texture, label: 'texture' },
    { src: product.images.detail, label: 'detail' },
    // Products often reuse one file for several slots; show each picture once.
  ].filter((img, i, all) => !!img.src && all.findIndex((o) => o.src === img.src) === i);

  // The selected shade's own description already sits under the swatches in
  // the purchase panel, so the story uses the product description only.
  const hasStory = !!product.description;
  if (benefits.length === 0 && !hasStory && highlights.length === 0) return null;

  return (
    <div className="space-y-4">
      {benefits.length > 0 && (
        <ul
          aria-label="Why you'll love it"
          className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 bg-[#FAF9F6] border border-[#E8D5A8] rounded-2xl p-4 sm:px-6 sm:py-5"
        >
          {benefits.map((benefit, i) => {
            const Icon = BENEFIT_ICONS[i % BENEFIT_ICONS.length];
            return (
              <li key={benefit} className="flex items-start gap-2.5">
                <Icon className="w-5 h-5 shrink-0 text-[#F05A7E] mt-0.5" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-[13px] leading-snug text-[#4A4642]">{benefit}</span>
              </li>
            );
          })}
        </ul>
      )}

      {hasStory && (
        <section
          aria-labelledby={titleId}
          className="bg-[#FAF9F6] border border-[#E8D5A8] rounded-2xl p-5 sm:p-7"
        >
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#F05A7E]">
            {selectedShade ? 'Product story · Featured shade' : 'Product story'}
          </p>
          <h2 id={titleId} className="font-serif !font-semibold text-[26px] sm:text-[30px] leading-tight text-[#121212] mt-1.5">
            {selectedShade ? selectedShade.name : product.name}
          </h2>
          <div className="mt-2.5 space-y-2 max-w-[62ch] text-[13px] sm:text-[14px] leading-relaxed text-[#4A4642]">
            {product.description && <p>{product.description}</p>}
          </div>

          {highlights.length > 0 && (
            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {highlights.map((h) => (
                <div key={h.label} className="px-3.5 py-2.5 bg-white border border-[#E8D5A8] rounded-xl">
                  <dt className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#6B6B6B]">{h.label}</dt>
                  <dd className="text-[13px] font-semibold text-[#121212] mt-0.5">{h.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {storyImages.length > 0 && (
            <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-3 max-w-[420px]">
              {storyImages.map((img) => (
                <ProductImage
                  key={img.label}
                  preset="thumb"
                  src={img.src}
                  alt={`${product.name} ${img.label}`}
                  className="w-full aspect-[4/3] object-cover rounded-xl border border-[#E8D5A8] bg-white"
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
