import React, { useEffect, useState } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { CMSVideoReels, CMSVideoReelItem } from '@glamirk/shared/types';
import { Save, Check, RotateCcw, AlertCircle, Plus, Trash2, ArrowUp, ArrowDown, Film } from 'lucide-react';
import { MediaUploadField } from './MediaUploadField';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

const EMPTY: CMSVideoReels = { enabled: false, title: 'Watch It. Love It.', subtitle: '', items: [] };

const inputCls = 'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]';
const labelCls = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

/**
 * "Watch It. Love It." — the shoppable video row on the home page. Stored in
 * global settings (like the wishlist banner) and saved through the same
 * settings endpoint, which validates every URL server-side.
 */
export const AdminVideoReels: React.FC = () => {
  const { globalSettings, saveGlobalSettings, products } = useCMS();
  const saved: CMSVideoReels = { ...EMPTY, ...globalSettings?.videoReels };
  const [reels, setReels] = useState<CMSVideoReels>(saved);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Settings load async; keyed on the JSON so a re-fetch doesn't wipe edits.
  const savedKey = JSON.stringify(saved);
  useEffect(() => setReels(JSON.parse(savedKey)), [savedKey]);
  const dirty = JSON.stringify(reels) !== savedKey;

  // A reel can only be saved with both a video and a product — the server
  // refuses anything else, so say so here instead of failing on Save.
  const isSafeLink = (u?: string) => !!u && /^(https:\/\/|\/(?!\/))/i.test(u.trim());
  const incomplete = reels.items.filter(
    (r) => !r.videoUrl || (r.kind === 'link' ? !r.customTitle?.trim() || !isSafeLink(r.linkUrl) : !r.productId)
  ).length;

  const setItem = (idx: number, patch: Partial<CMSVideoReelItem>) =>
    setReels({ ...reels, items: reels.items.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
  const move = (idx: number, dir: -1 | 1) => {
    const items = [...reels.items];
    const to = idx + dir;
    if (to < 0 || to >= items.length) return;
    [items[idx], items[to]] = [items[to], items[idx]];
    setReels({ ...reels, items });
  };
  const addReel = () =>
    setReels({ ...reels, items: [...reels.items, { id: `reel-${Date.now()}`, videoUrl: '', posterUrl: '', productId: '' }] });
  const removeReel = (idx: number) => setReels({ ...reels, items: reels.items.filter((_, i) => i !== idx) });

  const persist = async () => {
    setStatus('saving');
    const ok = await saveGlobalSettings({ videoReels: reels });
    setStatus(ok ? 'saved' : 'error');
    if (ok) setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Watch It. Love It. — Video Reels</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Shoppable product videos on the home page, right below Best Sellers. Each reel shows its product's price and an Add to Cart button.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setReels(saved)}
            disabled={!dirty || status === 'saving'}
            className="flex items-center gap-2 px-4 py-2.5 border border-[#E8D5A8]/30 text-[#FAF9F6] text-xs uppercase tracking-wider rounded-lg hover:bg-[#171717] disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={persist}
            disabled={!dirty || status === 'saving' || incomplete > 0}
            title={incomplete > 0 ? 'Every reel needs a video and a product (or a custom title and link)' : undefined}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-all shadow-md disabled:opacity-40 cursor-pointer"
          >
            {status === 'saved' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {status === 'saved' ? 'Saved!' : status === 'saving' ? 'Saving...' : 'Save & Publish'}
          </button>
        </div>
      </div>

      {status === 'error' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#F05A7E]/10 border border-[#F05A7E]/40 text-xs text-[#F05A7E]">
          <AlertCircle className="w-4 h-4" /> Could not save. Every reel needs an uploaded video (https://) and a product (or a custom title and link), and you must still be signed in.
        </div>
      )}
      {incomplete > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#E3B84B]/10 border border-[#E3B84B]/40 text-xs text-[#E3B84B]">
          <AlertCircle className="w-4 h-4" /> {incomplete} reel{incomplete > 1 ? 's' : ''} still need{incomplete > 1 ? '' : 's'} a video and a product (or a custom title and link) before you can save.
        </div>
      )}

      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
        <label className="flex items-center gap-2 text-xs text-[#FAF9F6] cursor-pointer">
          <input type="checkbox" checked={reels.enabled} onChange={(e) => setReels({ ...reels, enabled: e.target.checked })} />
          Show this section on the home page
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Heading</label>
            <input className={inputCls} value={reels.title} maxLength={120} onChange={(e) => setReels({ ...reels, title: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Sub-heading (optional)</label>
            <input
              className={inputCls}
              value={reels.subtitle || ''}
              maxLength={200}
              placeholder="e.g. Real routines, real results"
              onChange={(e) => setReels({ ...reels, subtitle: e.target.value })}
            />
          </div>
        </div>
        <ul className="text-[11px] text-[#6B6B6B] space-y-0.5 list-disc pl-4">
          <li>Vertical 9:16 videos work best (e.g. 1080 × 1920). MP4 is the safest format; keep each under 60 MB and around 10–30 seconds.</li>
          <li>Videos play muted in the row and open full-size with sound when tapped.</li>
          <li>The section stays hidden until it is switched on and has at least one complete reel.</li>
        </ul>
      </div>

      <div className="space-y-4">
        {reels.items.map((reel, idx) => {
          const product = products.find((p) => p.id === reel.productId);
          return (
            <div key={reel.id} className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/25 grid grid-cols-1 md:grid-cols-[140px_1fr] gap-5">
              {/* Preview, in the same 9:16 frame the storefront uses */}
              <div className="space-y-2">
                <div className="aspect-[9/16] w-full overflow-hidden rounded-xl bg-[#0B0B0B] border border-[#E8D5A8]/20 flex items-center justify-center">
                  {reel.videoUrl ? (
                    <video
                      src={reel.videoUrl}
                      poster={reel.posterUrl ? cloudinaryImageUrl(reel.posterUrl, 'card') : undefined}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      loop
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-[10px] text-[#6B6B6B]">
                      <Film className="w-5 h-5" /> No video yet
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-center text-[#6B6B6B]">Reel {idx + 1}</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-end gap-1">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} title="Move up" className="p-1.5 text-[#E8D5A8] hover:text-[#F05A7E] disabled:opacity-30 cursor-pointer">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === reels.items.length - 1} title="Move down" className="p-1.5 text-[#E8D5A8] hover:text-[#F05A7E] disabled:opacity-30 cursor-pointer">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => removeReel(idx)} title="Remove reel" className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <MediaUploadField kind="video" label="Video" value={reel.videoUrl} onChange={(url) => setItem(idx, { videoUrl: url })} />
                <MediaUploadField
                  kind="image"
                  label="Thumbnail (optional — first frame of the video otherwise)"
                  value={reel.posterUrl || ''}
                  onChange={(url) => setItem(idx, { posterUrl: url })}
                />
                <div>
                  <label className={labelCls}>Product shown with this video</label>
                  <select
                    className={inputCls}
                    value={reel.kind === 'link' ? '__custom__' : reel.productId}
                    onChange={(e) =>
                      e.target.value === '__custom__'
                        ? setItem(idx, { kind: 'link', productId: '' })
                        : setItem(idx, { kind: 'product', productId: e.target.value })
                    }
                  >
                    <option value="">— Select a product —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value="__custom__">Custom — my own title &amp; link</option>
                  </select>
                  {reel.kind !== 'link' && reel.productId && !product && (
                    <p className="text-[10px] text-[#F05A7E] mt-1">This product no longer exists — pick another, or the reel is hidden on the site.</p>
                  )}
                </div>
                {reel.kind === 'link' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border border-[#E8D5A8]/20 bg-[#0B0B0B]">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Link (where the card goes)</label>
                      <input
                        className={inputCls}
                        value={reel.linkUrl || ''}
                        placeholder="https://… or /shop?category=lips"
                        onChange={(e) => setItem(idx, { linkUrl: e.target.value })}
                      />
                      {reel.linkUrl && !isSafeLink(reel.linkUrl) && (
                        <p className="text-[10px] text-[#F05A7E] mt-1">Use a full https:// link or a site path starting with /</p>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>Title on the card</label>
                      <input className={inputCls} maxLength={120} value={reel.customTitle || ''} placeholder="e.g. Festive Glow Edit" onChange={(e) => setItem(idx, { customTitle: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Price text (optional)</label>
                      <input className={inputCls} maxLength={40} value={reel.priceLabel || ''} placeholder="e.g. From ₹499" onChange={(e) => setItem(idx, { priceLabel: e.target.value })} />
                    </div>
                    <p className="md:col-span-2 text-[10px] text-[#6B6B6B]">Custom cards show a “Shop” button that opens this link instead of Add to Cart.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addReel}
          disabled={reels.items.length >= 30}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-[#E8D5A8]/40 rounded-xl text-xs font-semibold text-[#FAF9F6] hover:bg-[#171717] disabled:opacity-40 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#F05A7E]" /> Add Video Reel
        </button>
      </div>
    </div>
  );
};
