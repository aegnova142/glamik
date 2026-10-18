import React from 'react';

/**
 * Gold-leaf and pink-petal ornament pieces, drawn as inline SVG so they stay
 * crisp at any density and need no image download. Shared by the sign-in
 * modal corners and the Shop the Look hero. Purely decorative — every
 * consumer wraps them in an aria-hidden container.
 *
 * Gradient ids are document-global, so each <svg> renders its own
 * <OrnamentDefs id="..."> and passes the same id to its leaves and petals.
 */
export const Leaf: React.FC<{ transform: string; id: string }> = ({ transform, id }) => (
  <g transform={transform}>
    <path d="M0 0C24-17 68-17 100 0C68 17 24 17 0 0Z" fill={`url(#${id}-leaf)`} stroke="#E3B84B" strokeWidth="1" />
    <path
      d="M2 0H96M24 0l13-8M24 0l13 8M46 0l13-8.5M46 0l13 8.5M68 0l11-6M68 0l11 6"
      stroke="#E8D5A8"
      strokeOpacity="0.55"
      strokeWidth="0.5"
      fill="none"
    />
  </g>
);

export const Petal: React.FC<{ transform: string; id: string }> = ({ transform, id }) => (
  <g transform={transform}>
    <path d="M0 0C12-17 44-19 64 0C44 15 12 15 0 0Z" fill={`url(#${id}-petal)`} />
    <path d="M4 0C22-4 42-4 60 0" stroke="#FCE8ED" strokeOpacity="0.55" strokeWidth="0.7" fill="none" />
  </g>
);

export const OrnamentDefs: React.FC<{ id: string }> = ({ id }) => (
  <defs>
    <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#E3B84B" stopOpacity="0.75" />
      <stop offset="0.55" stopColor="#8A6420" stopOpacity="0.5" />
      <stop offset="1" stopColor="#2A1E08" stopOpacity="0.35" />
    </linearGradient>
    <linearGradient id={`${id}-petal`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#FCE8ED" />
      <stop offset="0.35" stopColor="#F05A7E" />
      <stop offset="1" stopColor="#8E1D45" />
    </linearGradient>
  </defs>
);
