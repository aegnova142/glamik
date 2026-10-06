/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// [Glamik CMS] Added 2026-10-03 — reusable image/video renderer for the
// CMS-driven Personalized Beauty cards. Verified & hardened 2026-10-05.
import React from 'react';
import { ImageOff } from 'lucide-react';
import { responsiveImage } from '@glamirk/shared/utils/cloudinaryImage';

interface BeautyMediaProps {
  mediaType?: 'image' | 'video';
  mediaUrl?: string;
  posterUrl?: string;
  alt: string;
  className?: string;
}

/**
 * Renders a CMS media slot as an image or a muted autoplay video, keeping a
 * consistent aspect box so switching undertones never shifts the layout.
 * Missing/invalid media falls back to a graceful placeholder — never a broken
 * image icon, undefined, or an empty card.
 */
export const BeautyMedia: React.FC<BeautyMediaProps> = ({ mediaType, mediaUrl, posterUrl, alt, className = '' }) => {
  const [failed, setFailed] = React.useState(false);

  // Reset the error state when the source changes (undertone switch).
  React.useEffect(() => setFailed(false), [mediaUrl]);

  const box = `relative w-full aspect-[16/10] overflow-hidden rounded-xl bg-[#FCE8ED] ${className}`;

  if (!mediaUrl || failed) {
    return (
      <div className={box} role="img" aria-label={alt}>
        <div className="absolute inset-0 flex items-center justify-center text-[#C9972B]/50">
          <ImageOff className="w-7 h-7" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (mediaType === 'video') {
    return (
      <div className={box}>
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src={mediaUrl}
          poster={posterUrl || undefined}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          aria-label={alt}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={box}>
      <img
        className="absolute inset-0 w-full h-full object-cover"
        {...responsiveImage(mediaUrl, 'tile')}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
};
