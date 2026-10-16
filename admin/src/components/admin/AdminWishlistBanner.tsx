import React, { useEffect, useState } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { CMSWishlistBanner } from '@glamirk/shared/types';
import { Save, Check, RotateCcw, Heart, AlertCircle } from 'lucide-react';
import { MediaUploadField } from './MediaUploadField';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

const EMPTY: CMSWishlistBanner = { enabled: true, imageUrl: '', mobileImageUrl: '' };

/** The /reviews hero, scaled down: blush band, image fading in on the right. */
const ReviewsHeroPreview: React.FC<{ url: string; mobile?: boolean }> = ({ url, mobile }) => (
  <div
    className={`relative overflow-hidden bg-[#FCE8ED] border border-[#E8D5A8]/20 rounded-lg ${
      mobile ? 'w-[200px] h-[120px]' : 'w-full aspect-[16/3] min-h-[110px]'
    }`}
  >
    {url && (
      <img
        src={cloudinaryImageUrl(url, 'gallery')}
        alt=""
        className={`absolute right-0 top-0 h-full object-cover [mask-image:linear-gradient(to_right,transparent,black_55%)] ${
          mobile ? 'w-[55%] opacity-50' : 'w-[36%]'
        }`}
      />
    )}
    <div className={`relative h-full flex flex-col justify-center ${mobile ? 'px-4' : 'px-6'}`}>
      <span className="text-[7px] text-[#6B6B6B]">Home › Customer Reviews</span>
      <span className={`font-bold text-[#121212] leading-tight ${mobile ? 'text-lg' : 'text-2xl'}`}>
        Customer <span className="text-[#F05A7E]">Reviews</span>
      </span>
      <span className="text-[8px] text-[#6B6B6B] mt-1">Real people. Real results.</span>
    </div>
  </div>
);

const BANNERS = {
  wishlistBanner: {
    title: 'Wishlist Hero Banner',
    description: 'Manage the promotional image displayed behind the Your Beauty Edit heading on the customer wishlist page.',
    toggle: 'Show banner image (unticked = plain black hero)',
    tips: [
      'Desktop: about 5:1 to 6:1, e.g. 1920 × 360px or larger. WebP, AVIF or optimised JPEG.',
      'Keep the left side dark and empty; the heading sits there. Put the products on the right.',
      'The image is cropped to fill (never stretched), so keep key details away from the edges.',
    ],
  },
  reviewsBanner: {
    title: 'Customer Reviews Hero',
    description: 'The product image on the right of the Customer Reviews page (/reviews). Its left edge fades into the blush background.',
    toggle: 'Show hero image (unticked = plain blush hero)',
    tips: [
      'Desktop: roughly square to 4:3, at least 900px wide. It fills the right third of the hero, cropped to fill.',
      'Put the product in the centre-right; the left 40% of the image fades out.',
      'Mobile shows the mobile image (or the desktop one) faded behind the heading, so keep it soft and light.',
    ],
  },
} as const;

/** Same composition as the storefront hero, scaled down for the preview. */
const HeroPreview: React.FC<{ url: string; mobile?: boolean }> = ({ url, mobile }) => (
  <div
    className={`relative overflow-hidden bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-lg ${
      mobile ? 'w-[200px] h-[220px]' : 'w-full aspect-[16/3] min-h-[110px]'
    }`}
  >
    {url && (
      <img
        src={cloudinaryImageUrl(url, 'hero')}
        alt=""
        className={`absolute inset-0 w-full h-full object-cover ${mobile ? 'object-[70%_center] opacity-60' : 'object-right'}`}
      />
    )}
    <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0B] via-[#0B0B0B]/70 to-transparent" />
    <div className={`relative h-full flex flex-col justify-center ${mobile ? 'px-4' : 'px-6'}`}>
      <span className="text-[7px] tracking-[0.25em] text-[#F05A7E] uppercase">♥ Your private selection</span>
      <span className={`font-serif text-[#FAF9F6] leading-tight ${mobile ? 'text-lg' : 'text-2xl'}`}>
        YOUR BEAUTY <span className="text-[#C9972B]">EDIT</span>
      </span>
      <span className="text-[8px] text-[#F05A7E] mt-1">0 saved creations waiting for your vanity</span>
    </div>
  </div>
);

/** Edits one image banner held in global settings: the wishlist hero by
 * default, or the /reviews hero with settingsKey="reviewsBanner". */
export const AdminWishlistBanner: React.FC<{ settingsKey?: keyof typeof BANNERS }> = ({ settingsKey = 'wishlistBanner' }) => {
  const copy = BANNERS[settingsKey];
  const Preview = settingsKey === 'reviewsBanner' ? ReviewsHeroPreview : HeroPreview;
  const { globalSettings, saveGlobalSettings } = useCMS();
  const saved = { ...EMPTY, ...globalSettings?.[settingsKey] };
  const [banner, setBanner] = useState<CMSWishlistBanner>(saved);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Pick up the stored value once settings arrive (they load async). Keyed on
  // the JSON, not the object: content re-fetches hand back a new object each
  // time and would otherwise wipe unsaved edits.
  const savedKey = JSON.stringify(saved);
  useEffect(() => setBanner(JSON.parse(savedKey)), [savedKey]);

  const dirty = JSON.stringify(banner) !== savedKey;

  const persist = async (next: CMSWishlistBanner) => {
    setStatus('saving');
    const ok = await saveGlobalSettings({ [settingsKey]: next });
    setStatus(ok ? 'saved' : 'error');
    if (ok) setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">{copy.title}</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">{copy.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setBanner(saved)}
            disabled={!dirty || status === 'saving'}
            className="flex items-center gap-2 px-4 py-2.5 border border-[#E8D5A8]/30 text-[#FAF9F6] text-xs uppercase tracking-wider rounded-lg hover:bg-[#171717] disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={() => persist(banner)}
            disabled={!dirty || status === 'saving'}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-all shadow-md disabled:opacity-40 cursor-pointer"
          >
            {status === 'saved' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {status === 'saved' ? 'Saved!' : status === 'saving' ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {status === 'error' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#F05A7E]/10 border border-[#F05A7E]/40 text-xs text-[#F05A7E]">
          <AlertCircle className="w-4 h-4" /> Could not save. Check the image URL (https:// only) and that you are still signed in.
        </div>
      )}

      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-5">
        <label className="flex items-center gap-2 text-xs text-[#FAF9F6] cursor-pointer">
          <input
            type="checkbox"
            checked={banner.enabled}
            onChange={(e) => setBanner({ ...banner, enabled: e.target.checked })}
          />
          {copy.toggle}
        </label>

        <MediaUploadField
          kind="image"
          label="Desktop banner image"
          value={banner.imageUrl}
          onChange={(url) => setBanner({ ...banner, imageUrl: url })}
        />
        <MediaUploadField
          kind="image"
          label="Mobile banner image (optional, falls back to desktop)"
          value={banner.mobileImageUrl || ''}
          onChange={(url) => setBanner({ ...banner, mobileImageUrl: url })}
        />

        <ul className="text-[11px] text-[#6B6B6B] space-y-0.5 list-disc pl-4">
          {copy.tips.map((tip) => <li key={tip}>{tip}</li>)}
        </ul>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider flex items-center gap-1.5">
            <Heart className="w-3 h-3" /> Preview
          </p>
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div className="flex-1 w-full">
              <p className="text-[10px] text-[#6B6B6B] mb-1">Desktop</p>
              <Preview url={banner.enabled ? banner.imageUrl : ''} />
            </div>
            <div>
              <p className="text-[10px] text-[#6B6B6B] mb-1">Mobile</p>
              <Preview url={banner.enabled ? banner.mobileImageUrl || banner.imageUrl : ''} mobile />
            </div>
          </div>
        </div>

        {(saved.imageUrl || saved.mobileImageUrl) && (
          <button
            onClick={() => persist(EMPTY)}
            disabled={status === 'saving'}
            className="text-[11px] text-[#F05A7E] underline underline-offset-2 cursor-pointer disabled:opacity-40"
          >
            Reset to default (remove banner images)
          </button>
        )}
      </div>
    </div>
  );
};
