/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useCMS } from '../context/CMSContext';

export const AnnouncementBar: React.FC = () => {
  const { globalSettings, activeOffers } = useCMS();
  const messages = globalSettings?.announcementBarMessages?.filter((m) => m.isVisible) || [];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [messages.length]);

  const currentMsg =
    messages.length > 0
      ? messages[currentIndex]?.text
      : 'COMPLIMENTARY SHIPPING ON ORDERS OVER ₹999';

  return (
    <div
      id="glamirk-announcement-bar"
      className="bg-[#FCE8ED] text-[#121212] text-[11px] tracking-[0.16em] uppercase py-2 px-4 text-center border-b border-[#E8D5A8] font-medium z-50 relative transition-all"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <span className="hidden md:inline text-[#F05A7E] text-[10.5px] font-semibold tracking-[0.18em]">
          {globalSettings?.brandName?.toUpperCase() || 'GLAMIRK BEAUTY'}
        </span>
        <div className="mx-auto flex items-center gap-2.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F05A7E] animate-pulse" />
          <span className="font-semibold text-[#121212] transition-opacity duration-300">
            {currentMsg}
          </span>
          <span className="text-[#F05A7E] hidden sm:inline">•</span>
          <span className="text-[#F05A7E] hidden sm:inline font-medium">
            {activeOffers.length > 0 ? `CODE: ${activeOffers[0].couponCode || 'GLAMIRK'}` : 'USE CODE: GLAMFIRST'}
          </span>
        </div>
        <span className="hidden md:inline text-[#6B6B6B] text-[10.5px] tracking-[0.14em]">
          PERSONALIZED SHADE MATCH
        </span>
      </div>
    </div>
  );
};
