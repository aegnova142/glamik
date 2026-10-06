import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { responsiveImage, type ImagePreset } from '@glamirk/shared/utils/cloudinaryImage';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
  /**
   * How large this image is actually displayed. Decides the ceiling of the
   * generated srcset — see shared/utils/cloudinaryImage.
   *
   * Defaults to 'card', which covers the overwhelming majority of uses (grid
   * tiles, carousels, recommendation rails). Set it explicitly for the two
   * ends: 'thumb' for cart lines and search rows, 'detail' or 'gallery' for a
   * full-width product view.
   */
  preset?: ImagePreset;
  /**
   * The `sizes` attribute, if the default derived from `preset` is wrong for
   * this layout. Worth setting for anything inside a responsive grid, where
   * the displayed width is a fraction of the viewport rather than all of it.
   */
  sizes?: string;
  /**
   * Marks this as the Largest Contentful Paint candidate: loads eagerly, at
   * high priority, and is never lazy-loaded. Use on the one hero/above-the-fold
   * image of a page and nowhere else — the value of a priority hint comes from
   * being scarce.
   */
  priority?: boolean;
}

/**
 * A product <img> that degrades to a branded placeholder instead of the
 * browser's broken-image icon, and that asks the CDN for a size appropriate
 * to where it is being rendered.
 *
 * This exists because image URLs in the CMS can outlive the files behind them:
 * a media-library entry deleted in the admin leaves every product field still
 * pointing at a URL that now 404s. Blocking that deletion (server/routes.ts)
 * prevents new breakage but cannot resurrect assets already destroyed, so the
 * storefront has to render the gap gracefully rather than pretend it can't
 * happen.
 *
 * Failure is tracked per *URL*, not per component instance. A card swaps
 * between its primary and secondary image on hover, and those fail
 * independently — one being dead says nothing about the other.
 *
 * The responsive delivery added on top is deliberately invisible to callers:
 * `src` is still whatever the CMS stored, and a URL the transform does not
 * recognise (a legacy record, an external host, a relative path) is rendered
 * exactly as it always was, with no srcset at all.
 */
export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  className = '',
  loading = 'lazy',
  draggable,
  preset = 'card',
  sizes,
  priority = false,
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Clear the failure when the URL changes, so a re-uploaded image recovers on
  // the next CMS sync without needing a page reload. Without this, a card that
  // failed once would stay a placeholder for the life of the session even
  // after an admin fixed the underlying asset.
  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  const isBroken = !src || failedSrc === src;

  if (isBroken) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 bg-[#FCE8ED] text-[#C8899B] ${className}`}
        role="img"
        aria-label={`${alt} — image unavailable`}
      >
        <ImageOff className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="px-2 text-center text-[9px] font-semibold uppercase tracking-wider leading-tight">
          Image unavailable
        </span>
      </div>
    );
  }

  const optimised = responsiveImage(src, preset, sizes);

  return (
    <img
      src={optimised.src}
      // Both absent for a URL the transform left alone, which is the correct
      // markup for "there is only one size of this image".
      srcSet={optimised.srcSet}
      sizes={optimised.sizes}
      alt={alt}
      // A priority image must never be lazy: deferring the LCP element is the
      // single most common way a page loses its Core Web Vitals score.
      loading={priority ? 'eager' : loading}
      fetchPriority={priority ? 'high' : undefined}
      // Off the main thread, so decoding a large product photo doesn't stall
      // scrolling on the rest of the grid.
      decoding={priority ? 'sync' : 'async'}
      draggable={draggable}
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
};
