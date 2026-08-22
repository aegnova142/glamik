/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <aside
      id="glamirk-offline-banner"
      role="alert"
      aria-live="assertive"
      aria-label="Internet connection status"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-[#0B0B0B] text-[#FAF9F6] p-4 shadow-2xl border border-[#C9972B]/40 flex items-start gap-3.5 transition-all"
    >
      <WifiOff className="w-5 h-5 text-[#C9972B] shrink-0 mt-0.5 animate-pulse" />
      <div className="flex-1">
        <h2 className="text-xs uppercase tracking-[0.16em] font-semibold text-[#FAF9F6]">
          CONNECTION LOST
        </h2>
        <p className="text-xs text-[#C9972B] font-light mt-0.5 leading-relaxed">
          Please check your internet connection. Your bag and beauty profile are safely preserved.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1.5 bg-[#FAF9F6] text-[#121212] text-[11px] uppercase tracking-widest font-semibold hover:bg-[#E8D5A8] transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
      >
        <RefreshCw className="w-3 h-3" />
        RETRY
      </button>
    </aside>
  );
};
