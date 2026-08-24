/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSGlobalSettings, CMSAnnouncementMessage } from '../../types';
import { Settings, Save, Check, Plus, Trash2, ShieldCheck, Palette, Copy, Upload, Loader2, ImageOff } from 'lucide-react';
import { useFileUpload } from '../../hooks/useFileUpload';

export const AdminSettings: React.FC = () => {
  const { globalSettings, saveGlobalSettings } = useCMS();
  const [settings, setSettings] = useState<CMSGlobalSettings>(
    globalSettings || {
      brandName: 'Glamirk Beauty',
      tagline: 'Luxury Atelier for Melanin-Rich Beauty',
      logoText: 'GLAMIRK',
      logoUrl: '',
      contactEmail: 'care@glamirk.com',
      contactPhone: '+91 800 452 6475',
      whatsappOrderNumber: '',
      address: 'Atelier 08, Lodha World Towers, Lower Parel, Mumbai, Maharashtra 400013',
      currency: 'INR',
      currencySymbol: '₹',
      storeTimezone: 'Asia/Kolkata',
      freeShippingThreshold: 999,
      shippingNotice: 'Complimentary shipping across India on all orders above ₹999.',
      announcementBarMessages: [
        { id: 'ann-1', text: 'Complimentary luxury courier on all orders above ₹999', isVisible: true },
        { id: 'ann-2', text: 'New: Balm-to-Water Cleanser with Sea Buckthorn is now live', isVisible: true },
      ],
      defaultSeoTitle: 'Glamirk Beauty | Luxury Makeup & Skincare Atelier',
      defaultSeoDescription: 'Discover high-pigment, weightless lip colors calibrated for South Asian skin tones.',
      approvedPalette: {
        primaryLuxuryBlack: '#0B0B0B',
        primarySoftBlack: '#171717',
        primaryGold: '#C9972B',
        primaryBrightGold: '#E3B84B',
        secondaryPink: '#F05A7E',
        secondarySoftPink: '#FCE8ED',
        secondaryWhite: '#FFFFFF',
        backgroundWarmWhite: '#FAF9F6',
        textRichBlack: '#121212',
        mutedTextGrey: '#6B6B6B',
        borderSoftGold: '#E8D5A8',
      },
    }
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const { upload: uploadLogo, isUploading: isLogoUploading, error: logoError } = useFileUpload({
    acceptedTypes: ['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg'],
    maxSizeBytes: 5 * 1024 * 1024,
    typeErrorMessage: 'Please choose a PNG, SVG, WebP, or JPG file.',
  });

  const handleLogoFileSelect = async (file: File | undefined) => {
    const mediaItem = await uploadLogo(file);
    if (mediaItem) setSettings((prev) => ({ ...prev, logoUrl: mediaItem.url }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await saveGlobalSettings(settings);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleAddAnnouncement = () => {
    const newMsg: CMSAnnouncementMessage = {
      id: 'ann-' + Date.now(),
      text: 'Special announcement message here...',
      isVisible: true,
    };
    setSettings({
      ...settings,
      announcementBarMessages: [...settings.announcementBarMessages, newMsg],
    });
  };

  const handleCopyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1500);
  };

  const OFFICIAL_PALETTE_GUIDE = [
    { role: 'Primary — Luxury Black', name: 'Deep Black', hex: '#0B0B0B', usage: 'Main dark backgrounds, footer' },
    { role: 'Primary — Soft Black', name: 'Charcoal', hex: '#171717', usage: 'Dark cards, modal headers' },
    { role: 'Primary — Gold', name: 'Luxury Gold', hex: '#C9972B', usage: 'Brand luxury accents, ratings' },
    { role: 'Primary — Bright Gold', name: 'Champagne Gold', hex: '#E3B84B', usage: 'Gold hover states, glow' },
    { role: 'Secondary — Pink', name: 'Glam Pink', hex: '#F05A7E', usage: 'CTAs, badges, highlights' },
    { role: 'Secondary — Soft Pink', name: 'Blush Pink', hex: '#FCE8ED', usage: 'Gentle blush backdrops' },
    { role: 'Secondary — White', name: 'Pure White', hex: '#FFFFFF', usage: 'Crisp cards, inverted text' },
    { role: 'Background', name: 'Warm White', hex: '#FAF9F6', usage: 'Main storefront body canvas' },
    { role: 'Text', name: 'Rich Black', hex: '#121212', usage: 'Primary readable headlines & copy' },
    { role: 'Muted Text', name: 'Grey', hex: '#6B6B6B', usage: 'Subtitles, captions, metadata' },
    { role: 'Border', name: 'Soft Gold', hex: '#E8D5A8', usage: 'Refined borders & dividing rules' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Global Store Settings</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Configure brand identity, announcement marquee, courier rules, and inspect client color palette tokens.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Brand & Storefront Info */}
        <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
          <h3 className="font-serif text-base text-[#FAF9F6]">Store Identity</h3>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Brand Name
            </label>
            <input
              type="text"
              value={settings.brandName}
              onChange={(e) => setSettings({ ...settings, brandName: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Tagline
            </label>
            <input
              type="text"
              value={settings.tagline}
              onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Logo Text <span className="normal-case text-[#6B6B6B]">(shown when no logo image is set)</span>
            </label>
            <input
              type="text"
              value={settings.logoText}
              onChange={(e) => setSettings({ ...settings, logoText: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Logo Image <span className="normal-case text-[#6B6B6B]">(replaces the text logo in the navbar &amp; footer)</span>
            </label>

            {logoError && <p className="mb-2 text-[11px] text-[#F05A7E]">{logoError}</p>}

            <div className="flex items-center gap-3">
              <div className="w-20 h-20 shrink-0 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/30 flex items-center justify-center overflow-hidden">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo preview" className="w-full h-full object-contain" />
                ) : (
                  <ImageOff className="w-5 h-5 text-[#6B6B6B]" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-dashed border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer">
                  {isLogoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{isLogoUploading ? 'Uploading...' : settings.logoUrl ? 'Replace Logo' : 'Upload Logo'}</span>
                  <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="hidden" disabled={isLogoUploading} onChange={(e) => handleLogoFileSelect(e.target.files?.[0])} />
                </label>
                {settings.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, logoUrl: '' })}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[11px] font-semibold text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove Logo</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Store Timezone
              </label>
              <select
                value={settings.storeTimezone}
                onChange={(e) => setSettings({ ...settings, storeTimezone: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+5:30)</option>
                <option value="UTC">UTC (Universal Coordinated Time)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Free Shipping Threshold (₹)
              </label>
              <input
                type="number"
                value={settings.freeShippingThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, freeShippingThreshold: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Contact Email
            </label>
            <input
              type="email"
              value={settings.contactEmail}
              onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Contact Phone
            </label>
            <input
              type="text"
              value={settings.contactPhone}
              onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              WhatsApp Order Notifications
            </label>
            <input
              type="text"
              value={settings.whatsappOrderNumber || ''}
              onChange={(e) => setSettings({ ...settings, whatsappOrderNumber: e.target.value })}
              placeholder="+91 98765 43210"
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
            <p className="text-[10.5px] text-[#6B6B6B] mt-1">
              When a customer confirms an order, this number receives a pre-filled WhatsApp message with the full order details. Leave blank to disable.
            </p>
          </div>
        </div>

        {/* Announcement Messages */}
        <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base text-[#FAF9F6]">Top Announcement Marquee</h3>
            <button
              type="button"
              onClick={handleAddAnnouncement}
              className="text-xs text-[#C9972B] hover:text-[#E3B84B] font-semibold cursor-pointer"
            >
              + Add Message
            </button>
          </div>

          <div className="space-y-3">
            {settings.announcementBarMessages.map((msg, idx) => (
              <div key={msg.id || idx} className="p-3 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={msg.text}
                    onChange={(e) => {
                      const updated = [...settings.announcementBarMessages];
                      updated[idx].text = e.target.value;
                      setSettings({ ...settings, announcementBarMessages: updated });
                    }}
                    className="w-full px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = settings.announcementBarMessages.filter((_, i) => i !== idx);
                      setSettings({ ...settings, announcementBarMessages: updated });
                    }}
                    className="p-1 text-[#F05A7E] hover:bg-[#F05A7E]/20 rounded cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Link URL (optional)"
                    value={msg.link || ''}
                    onChange={(e) => {
                      const updated = [...settings.announcementBarMessages];
                      updated[idx].link = e.target.value;
                      setSettings({ ...settings, announcementBarMessages: updated });
                    }}
                    className="w-full px-2 py-1 bg-[#171717] border border-[#E8D5A8]/20 rounded text-[11px] text-[#FAF9F6] font-mono"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Official Approved 11-Color Palette Inspector */}
      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-[#C9972B]" />
          <h3 className="font-serif text-lg text-[#FAF9F6]">Official Brand Color System (11 Tokens)</h3>
        </div>
        <p className="text-xs text-[#6B6B6B]">
          The official 11-color luxury palette calibrated for Glamirk Beauty. All UI components strictly adhere to these exact hexadecimal values.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
          {OFFICIAL_PALETTE_GUIDE.map((token) => (
            <div
              key={token.hex}
              onClick={() => handleCopyHex(token.hex)}
              className="p-3 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 hover:border-[#C9972B] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div
                  className="w-full h-10 rounded mb-2 border border-white/10 shadow-xs flex items-end justify-end p-1"
                  style={{ backgroundColor: token.hex }}
                >
                  {copiedHex === token.hex && (
                    <span className="text-[9px] font-bold bg-[#0B0B0B]/80 text-[#FAF9F6] px-1 rounded">
                      Copied
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-semibold text-[#FAF9F6] truncate">{token.name}</p>
                <p className="text-[9px] text-[#6B6B6B] truncate">{token.role}</p>
              </div>

              <div className="mt-2 pt-2 border-t border-[#E8D5A8]/10 flex items-center justify-between font-mono text-[10px] text-[#C9972B]">
                <span>{token.hex}</span>
                <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
