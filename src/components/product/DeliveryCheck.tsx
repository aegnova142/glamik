/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MapPin, CheckCircle2, XCircle, Truck, Banknote, Loader2 } from 'lucide-react';

interface CheckResult {
  pincode: string;
  available: boolean;
  estimateStart?: string;
  estimateEnd?: string;
}

export const DeliveryCheck: React.FC = () => {
  const [pincode, setPincode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = pincode.trim();
    if (!/^\d{6}$/.test(clean)) {
      setError('Please enter a valid 6-digit PIN code.');
      setResult(null);
      return;
    }

    setIsChecking(true);
    try {
      // Checks the same serviceablePinCodes/blockedPinCodes rules checkout
      // actually enforces (server/commerce.ts) — this used to be a purely
      // client-side simulation that could tell a shopper COD was available
      // somewhere the admin had blocked it, only for checkout to then
      // reject the order.
      const res = await fetch(`/api/customer/cod-eligibility?pincode=${clean}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not check this PIN code. Please try again.');
        setResult(null);
        return;
      }

      if (!data.serviceable) {
        setResult({ pincode: clean, available: false });
        return;
      }

      // Delivery date estimate stays a display-only simulation — no real
      // logistics/courier integration exists to source an actual date from.
      const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const end = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      setResult({
        pincode: clean,
        available: true,
        estimateStart: fmt(start),
        estimateEnd: fmt(end),
      });
    } catch {
      setError('Could not check this PIN code. Please check your connection and try again.');
      setResult(null);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="pt-2 space-y-2.5">
      <label className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#121212] flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-[#F05A7E]" />
        Check Delivery Availability
      </label>
      <form onSubmit={handleCheck} className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={pincode}
          onChange={(e) => {
            setPincode(e.target.value.replace(/\D/g, ''));
            setError(null);
          }}
          placeholder="Enter PIN code"
          className="flex-1 px-3.5 py-2.5 text-xs bg-white border border-[#E8D5A8] rounded-full focus:border-[#F05A7E] focus:outline-hidden font-mono"
        />
        <button
          type="submit"
          disabled={isChecking}
          className="px-5 py-2.5 bg-[#0B0B0B] text-white text-[11px] font-bold tracking-wider uppercase rounded-full hover:bg-[#0B0B0B] transition-colors cursor-pointer flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {isChecking && <Loader2 className="w-3 h-3 animate-spin" />}
          {isChecking ? 'Checking...' : 'Check'}
        </button>
      </form>

      {error && (
        <p className="text-[11px] text-[#F05A7E] flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}

      {result && (
        <div
          className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
            result.available ? 'bg-[#FCE8ED] border-[#E8D5A8]' : 'bg-[#FAF9F6] border-[#E8D5A8]'
          }`}
        >
          {result.available ? (
            <>
              <p className="flex items-center gap-1.5 text-[#121212] font-semibold">
                <CheckCircle2 className="w-4 h-4 text-[#F05A7E]" />
                Delivery available to {result.pincode}
              </p>
              <p className="text-[#6B6B6B]">
                Estimated delivery: <strong className="text-[#121212]">{result.estimateStart} – {result.estimateEnd}</strong>
              </p>
              <div className="flex items-center gap-4 pt-1 text-[#6B6B6B]">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-[#F05A7E]" />
                  Free delivery
                </span>
                <span className="flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-[#F05A7E]" />
                  Cash on Delivery available
                </span>
              </div>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-[#F05A7E] font-semibold">
              <XCircle className="w-4 h-4" />
              Delivery is currently unavailable for {result.pincode}.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
