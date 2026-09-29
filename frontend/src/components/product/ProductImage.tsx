import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
}

/**
 * A product <img> that degrades to a branded placeholder instead of the
 * browser's broken-image icon.
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
 */
export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  className = '',
  loading = 'lazy',
  draggable,
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

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      draggable={draggable}
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
};
