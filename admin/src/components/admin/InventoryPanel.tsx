import React, { useCallback, useEffect, useState } from 'react';
import { Boxes, History, Loader2, Lock, RefreshCw, Save } from 'lucide-react';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';

// ==========================================
// INVENTORY PANEL
//
// Shown in the product editor when SQL inventory is authoritative.
//
// It exists because the product form's own stock inputs cannot safely write in
// that mode: an inventory row carries reserved and sold counts tied to live
// orders, and saving a product form would overwrite the available figure
// without a lock, without an audit entry, and without any regard for what is
// currently reserved. So those inputs go read-only and corrections happen
// here, through the inventory API — which locks the row, validates the
// quantity, and records who changed it and why.
// ==========================================

interface InventoryUnit {
  id: string;
  productId: string;
  variantId: string | null;
  sizeLabel: string | null;
  availableStock: number;
  reservedStock: number;
  soldStock: number;
  lowStockThreshold: number;
}

interface InventoryTransaction {
  id: string;
  operation: string;
  quantity: number;
  previousAvailable: number;
  newAvailable: number;
  orderId?: string;
  actor?: string;
  reason?: string;
  createdAt: string;
}

/** Human label for a unit, mirroring how the stock hierarchy is addressed. */
function unitLabel(unit: InventoryUnit): string {
  if (unit.variantId && unit.sizeLabel) return `Shade ${unit.variantId} · ${unit.sizeLabel}`;
  if (unit.variantId) return `Shade ${unit.variantId}`;
  if (unit.sizeLabel) return `Size ${unit.sizeLabel}`;
  return 'Product level';
}

export const InventoryPanel: React.FC<{ productId: string }> = ({ productId }) => {
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Keyed by inventory row id so two units can be edited without their drafts
  // colliding.
  const [drafts, setDrafts] = useState<Record<string, { available: string; reason: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<{ units: InventoryUnit[] }>(`/api/admin/inventory/${encodeURIComponent(productId)}`);
    setLoading(false);
    if (res.data) {
      setUnits(res.data.units || []);
      setDrafts({});
    } else {
      setError(res.error || 'Could not load inventory.');
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadHistory = async () => {
    const res = await apiFetch<{ transactions: InventoryTransaction[] }>(
      `/api/admin/inventory/${encodeURIComponent(productId)}/transactions?limit=50`
    );
    if (res.data) setTransactions(res.data.transactions || []);
    setShowHistory(true);
  };

  const save = async (unit: InventoryUnit) => {
    const draft = drafts[unit.id];
    if (!draft) return;

    const available = Number(draft.available);
    // Validated here as well as on the server — the server is what counts, but
    // a bad value should not need a round trip to be rejected.
    if (!Number.isInteger(available) || available < 0) {
      setError('Available stock must be a whole number of zero or more.');
      return;
    }
    if (!draft.reason.trim()) {
      setError('A reason is required — it is written to the audit trail.');
      return;
    }

    setSavingId(unit.id);
    setError(null);
    const res = await apiFetch<{ units: InventoryUnit[] }>(`/api/admin/inventory/${encodeURIComponent(productId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        variantId: unit.variantId,
        sizeLabel: unit.sizeLabel,
        availableStock: available,
        reason: draft.reason.trim(),
      }),
    });
    setSavingId(null);

    if (res.data) {
      setUnits(res.data.units || []);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[unit.id];
        return next;
      });
      if (showHistory) loadHistory();
    } else {
      setError(res.error || 'Could not save the adjustment.');
    }
  };

  return (
    <div className="rounded-lg border border-[#C9972B]/40 bg-[#0B0B0B] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-[#C9972B]" />
          <div className="min-w-0">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#E8D5A8]">SQL Inventory</h4>
            <p className="mt-1 text-[10.5px] leading-relaxed text-[#9C9689]">
              Stock is held in the inventory tables, not on the product record. Adjustments here lock the row and are
              written to the audit trail.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="shrink-0 rounded-md border border-[#E8D5A8]/30 p-1.5 text-[#9C9689] transition-colors hover:text-[#E8D5A8]"
          aria-label="Reload inventory"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded border border-[#C0392B]/40 bg-[#C0392B]/10 px-3 py-2 text-[11px] text-[#E88]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-[11px] text-[#9C9689]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading inventory…
        </div>
      ) : units.length === 0 ? (
        <p className="py-3 text-[11px] text-[#9C9689]">
          No inventory rows yet. They are created automatically when the product is saved.
        </p>
      ) : (
        <div className="space-y-2.5">
          {units.map((unit) => {
            const draft = drafts[unit.id];
            const low = unit.availableStock <= unit.lowStockThreshold;
            return (
              <div key={unit.id} className="rounded-md border border-[#E8D5A8]/20 bg-[#121212] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#FAF9F6]">{unitLabel(unit)}</span>
                  {low && (
                    <span className="rounded-full bg-[#C0392B]/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#E88]">
                      Low stock
                    </span>
                  )}
                </div>

                {/* All three counters, because "available" alone is misleading
                    when units are held by live orders. */}
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Available', value: unit.availableStock },
                    { label: 'Reserved', value: unit.reservedStock },
                    { label: 'Sold', value: unit.soldStock },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded border border-[#E8D5A8]/15 py-1.5">
                      <span className="block font-serif text-base text-[#FAF9F6]">{stat.value}</span>
                      <span className="block text-[9px] uppercase tracking-wider text-[#6B6B6B]">{stat.label}</span>
                    </div>
                  ))}
                </div>

                {draft ? (
                  <div className="mt-2.5 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        value={draft.available}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [unit.id]: { ...prev[unit.id], available: e.target.value } }))
                        }
                        className="w-24 rounded border border-[#E8D5A8]/30 bg-[#0B0B0B] px-2 py-1.5 text-xs text-[#FAF9F6]"
                        aria-label="New available stock"
                      />
                      <input
                        type="text"
                        placeholder="Reason (recorded in the audit trail)"
                        value={draft.reason}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [unit.id]: { ...prev[unit.id], reason: e.target.value } }))
                        }
                        className="flex-1 rounded border border-[#E8D5A8]/30 bg-[#0B0B0B] px-2 py-1.5 text-xs text-[#FAF9F6]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => save(unit)}
                        disabled={savingId === unit.id}
                        className="inline-flex items-center gap-1.5 rounded bg-[#C9972B] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#0B0B0B] disabled:opacity-50"
                      >
                        {savingId === unit.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDrafts((prev) => {
                            const next = { ...prev };
                            delete next[unit.id];
                            return next;
                          })
                        }
                        className="rounded border border-[#E8D5A8]/30 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#9C9689]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((prev) => ({
                        ...prev,
                        [unit.id]: { available: String(unit.availableStock), reason: '' },
                      }))
                    }
                    className="mt-2.5 rounded border border-[#E8D5A8]/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#E8D5A8] transition-colors hover:border-[#C9972B]"
                  >
                    Adjust stock
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-[#E8D5A8]/15 pt-3">
        {showHistory ? (
          <div className="space-y-1.5">
            <h5 className="text-[10px] font-semibold uppercase tracking-wider text-[#9C9689]">Recent movements</h5>
            {transactions.length === 0 ? (
              <p className="text-[10.5px] text-[#6B6B6B]">No movements recorded yet.</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {transactions.map((tx) => (
                  <li key={tx.id} className="flex items-baseline justify-between gap-2 text-[10.5px]">
                    <span className="text-[#9C9689]">
                      <span className="font-semibold text-[#E8D5A8]">{tx.operation}</span>{' '}
                      {tx.previousAvailable} → {tx.newAvailable}
                      {tx.reason ? ` · ${tx.reason}` : ''}
                    </span>
                    <span className="shrink-0 text-[#6B6B6B]">
                      {new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={loadHistory}
            className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#C9972B] hover:underline"
          >
            <History className="h-3 w-3" />
            View movement history
          </button>
        )}
      </div>
    </div>
  );
};

/** Shown in place of a stock input when SQL inventory owns the number. */
export const ReadOnlyStockField: React.FC<{ value: number | undefined; label?: string }> = ({ value, label }) => (
  <div className="flex items-center gap-2 rounded-lg border border-[#E8D5A8]/20 bg-[#0B0B0B]/60 px-3 py-2">
    <Lock className="h-3 w-3 shrink-0 text-[#6B6B6B]" />
    <span className="text-xs text-[#9C9689]">
      {value ?? 0}
      <span className="ml-1.5 text-[10px] text-[#6B6B6B]">
        {label || 'managed in SQL inventory — adjust below'}
      </span>
    </span>
  </div>
);
