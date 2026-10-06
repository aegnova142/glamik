// [Glamik] 2026-10-06 — premium branded fallback (soft blush + scalable Glamirk
// monogram) in place of the old "IMAGE UNAVAILABLE" block.
import React, { useEffect, useState } from 'react';

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
    // Tasteful luxury placeholder: soft blush wash + champagne framing + a
    // scalable serif Glamirk monogram. No harsh text; reads as intentional
    // brand decoration at any card size (full cards down to tiny thumbnails).
    return (
      <div
        className={`relative overflow-hidden bg-gradient-to-br from-[#FFF7F8] via-[#FCE7EC] to-[#F9DCE4] ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="pointer-events-none absolute -right-5 -top-5 h-20 w-20 rounded-full border border-[#E7C98D]/40" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-7 bottom-0 h-24 w-24 rounded-full bg-[#F34F78]/5 blur-2xl" aria-hidden="true" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-[36%] min-w-[16px] max-w-[60px]" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="none" stroke="#E7C98D" strokeWidth="2.5" opacity="0.45" />
            <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, 'Times New Roman', serif" fontSize="48" fill="#C9365D" opacity="0.5">G</text>
          </svg>
        </div>
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
