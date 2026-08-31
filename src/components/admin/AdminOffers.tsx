/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSOffer, PromotionNotificationSettings, DEFAULT_PROMO_NOTIFICATION_MESSAGES, applyPromoMessageTemplate } from '../../types';
import {
  Tag,
  Plus,
  Clock,
  Trash2,
  Edit2,
  Calendar,
  Check,
  Save,
  ArrowLeft,
  Percent,
  Sparkles,
  Bell,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { LiveOfferCountdown } from '../marketing/LiveOfferCountdown';

export const AdminOffers: React.FC = () => {
  const { offers, products, saveOffer, deleteOffer, serverTime } = useCMS();
  const [editingOffer, setEditingOffer] = useState<CMSOffer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showMessagePreview, setShowMessagePreview] = useState(false);

  const notificationSettings: PromotionNotificationSettings = editingOffer?.notificationSettings || {
    enabled: false,
  };

  const updateNotificationSettings = (patch: Partial<PromotionNotificationSettings>) => {
    if (!editingOffer) return;
    setEditingOffer({
      ...editingOffer,
      notificationSettings: { ...notificationSettings, ...patch },
    });
  };

  const handleResetNotificationMessages = () => {
    if (!window.confirm('Reset all four notification messages back to the Glamirk default copy? The enable/disable toggle is left as-is.')) return;
    updateNotificationSettings({ ...DEFAULT_PROMO_NOTIFICATION_MESSAGES });
  };

  const previewVars = editingOffer
    ? {
        code: editingOffer.couponCode || 'WELCOME10',
        minOrder: editingOffer.minOrderValue || 0,
        subtotal: Math.max(0, (editingOffer.minOrderValue || 0) - 200),
      }
    : { code: 'WELCOME10', minOrder: 0, subtotal: 0 };

  const previewMessage = (slot: keyof typeof DEFAULT_PROMO_NOTIFICATION_MESSAGES) =>
    applyPromoMessageTemplate(notificationSettings[slot] || DEFAULT_PROMO_NOTIFICATION_MESSAGES[slot], previewVars);

  const handleCreateOffer = () => {
    const now = new Date();
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const newOffer: CMSOffer = {
      id: 'offer-' + Date.now(),
      name: 'Festival Flash Sale',
      publicTitle: 'COMPLIMENTARY VELVET LIP OIL WITH ₹1,999+ ORDERS',
      description: 'Handcrafted luxury botanical elixir gifted with every celebratory purchase.',
      discountType: 'gift_with_purchase',
      discountValue: 0,
      couponCode: 'ROYALGLAM',
      startDate: now.toISOString().slice(0, 16),
      endDate: future.toISOString().slice(0, 16),
      timezone: 'Asia/Kolkata',
      status: 'active',
      tag: 'CELEBRATION GIFT',
      showCountdown: true,
      bannerBgColor: '#0B0B0B',
      bannerTextColor: '#FAF9F6',
      applicableCategory: 'ALL',
      minOrderValue: 1999,
      isStackable: false,
    };
    setEditingOffer(newOffer);
  };

  const handleSave = async () => {
    if (!editingOffer) return;
    setIsSaving(true);
    const ok = await saveOffer(editingOffer);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingOffer(null);
      }, 700);
    }
  };

  if (editingOffer) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingOffer(null)}
              className="p-2 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="font-serif text-xl text-[#FAF9F6]">{editingOffer.name}</h2>
              <span className="text-xs text-[#6B6B6B]">Store Timezone: {editingOffer.timezone}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Campaign'}</span>
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-5">
            <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
              <h3 className="font-serif text-base text-[#FAF9F6]">Campaign Details</h3>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Internal Campaign Name
                </label>
                <input
                  type="text"
                  value={editingOffer.name}
                  onChange={(e) => setEditingOffer({ ...editingOffer, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Public Customer Banner Heading
                </label>
                <input
                  type="text"
                  value={editingOffer.publicTitle}
                  onChange={(e) => setEditingOffer({ ...editingOffer, publicTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Offer Description / Terms
                </label>
                <textarea
                  rows={3}
                  value={editingOffer.description}
                  onChange={(e) => setEditingOffer({ ...editingOffer, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    Discount Type
                  </label>
                  <select
                    value={editingOffer.discountType}
                    onChange={(e) => setEditingOffer({ ...editingOffer, discountType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  >
                    <option value="percentage">Percentage (%) Off</option>
                    <option value="flat">Fixed (₹) Off</option>
                    <option value="gift_with_purchase">Gift With Purchase</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    Discount Value
                  </label>
                  <input
                    type="number"
                    value={editingOffer.discountValue}
                    onChange={(e) =>
                      setEditingOffer({ ...editingOffer, discountValue: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    Coupon Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={editingOffer.couponCode || ''}
                    placeholder="e.g. FESTIVE20"
                    onChange={(e) =>
                      setEditingOffer({ ...editingOffer, couponCode: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] font-mono uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Timing & Timezone */}
            <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
              <h3 className="font-serif text-base text-[#FAF9F6]">Schedule & Live Countdown</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    Start Date & Time ({editingOffer.timezone})
                  </label>
                  <input
                    type="datetime-local"
                    value={editingOffer.startDate.slice(0, 16)}
                    onChange={(e) => setEditingOffer({ ...editingOffer, startDate: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    End Date & Time ({editingOffer.timezone})
                  </label>
                  <input
                    type="datetime-local"
                    value={editingOffer.endDate ? editingOffer.endDate.slice(0, 16) : ''}
                    onChange={(e) => setEditingOffer({ ...editingOffer, endDate: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="showCountdown"
                  checked={editingOffer.showCountdown}
                  onChange={(e) => setEditingOffer({ ...editingOffer, showCountdown: e.target.checked })}
                  className="rounded border-[#E8D5A8]/30 accent-[#F05A7E] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="showCountdown" className="text-xs text-[#FAF9F6] cursor-pointer">
                  Display real-time countdown timer to shoppers on website
                </label>
              </div>

              {editingOffer.showCountdown && editingOffer.endDate && (
                <div className="p-4 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-[#6B6B6B] uppercase tracking-wider mb-2">
                    Live Real-Time Countdown Preview
                  </span>
                  <LiveOfferCountdown targetDate={editingOffer.endDate} />
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-5">
            <div className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
              <h3 className="font-serif text-base text-[#FAF9F6]">Status & Rules</h3>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={editingOffer.status}
                  onChange={(e) => setEditingOffer({ ...editingOffer, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                >
                  <option value="active">Active (Live Now)</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="expired">Expired / Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Badge Tag
                </label>
                <input
                  type="text"
                  value={editingOffer.tag || ''}
                  placeholder="e.g. FLASH SALE"
                  onChange={(e) => setEditingOffer({ ...editingOffer, tag: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Minimum Order Value (₹)
                </label>
                <input
                  type="number"
                  value={editingOffer.minOrderValue || 0}
                  onChange={(e) =>
                    setEditingOffer({
                      ...editingOffer,
                      minOrderValue: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Shopper-Facing Notification Messages */}
        <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#C9972B]" />
              <h3 className="font-serif text-base text-[#FAF9F6]">Notifications</h3>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notificationsEnabled"
                checked={notificationSettings.enabled}
                onChange={(e) => updateNotificationSettings({ enabled: e.target.checked })}
                className="rounded border-[#E8D5A8]/30 accent-[#F05A7E] w-4 h-4 cursor-pointer"
              />
              <label htmlFor="notificationsEnabled" className="text-xs text-[#FAF9F6] cursor-pointer font-semibold">
                Enable Promotion Notifications
              </label>
            </div>
          </div>
          <p className="text-[11px] text-[#6B6B6B]">
            Customize the copy shoppers see for this specific promotion. Leave a field blank, or leave the toggle
            off, and Glamirk's default message is used instead. Placeholders: <code className="text-[#C9972B]">{'{code}'}</code>,{' '}
            <code className="text-[#C9972B]">{'{minOrder}'}</code>, <code className="text-[#C9972B]">{'{amountNeeded}'}</code>.
          </p>

          <fieldset disabled={!notificationSettings.enabled} className="space-y-4 disabled:opacity-40">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Success Message
                </label>
                <textarea
                  rows={2}
                  value={notificationSettings.successMessage || ''}
                  placeholder={DEFAULT_PROMO_NOTIFICATION_MESSAGES.successMessage}
                  onChange={(e) => updateNotificationSettings({ successMessage: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Eligibility Warning Message
                </label>
                <textarea
                  rows={2}
                  value={notificationSettings.eligibilityWarningMessage || ''}
                  placeholder={DEFAULT_PROMO_NOTIFICATION_MESSAGES.eligibilityWarningMessage}
                  onChange={(e) => updateNotificationSettings({ eligibilityWarningMessage: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Auto-Removal Message
                </label>
                <textarea
                  rows={2}
                  value={notificationSettings.autoRemovalMessage || ''}
                  placeholder={DEFAULT_PROMO_NOTIFICATION_MESSAGES.autoRemovalMessage}
                  onChange={(e) => updateNotificationSettings({ autoRemovalMessage: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Error Message
                </label>
                <textarea
                  rows={2}
                  value={notificationSettings.errorMessage || ''}
                  placeholder={DEFAULT_PROMO_NOTIFICATION_MESSAGES.errorMessage}
                  onChange={(e) => updateNotificationSettings({ errorMessage: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>
            </div>
          </fieldset>

          <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowMessagePreview((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-[#C9972B] hover:underline font-semibold uppercase tracking-wider cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{showMessagePreview ? 'Hide' : 'Show'} Message Preview</span>
            </button>
            <button
              type="button"
              onClick={handleResetNotificationMessages}
              className="flex items-center gap-1.5 text-[11px] text-[#6B6B6B] hover:text-[#F05A7E] font-semibold uppercase tracking-wider cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Default</span>
            </button>
          </div>

          {showMessagePreview && (
            <div className="p-4 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/20 space-y-2.5">
              <span className="text-[10px] text-[#6B6B6B] uppercase tracking-wider">
                Preview — example: code {previewVars.code}, ₹{previewVars.minOrder} minimum, shopper currently at ₹
                {previewVars.subtotal}
              </span>
              <div className="text-xs text-[#FAF9F6] space-y-1.5">
                <p><span className="text-[#C9972B] font-semibold">Success:</span> {previewMessage('successMessage')}</p>
                <p><span className="text-[#C9972B] font-semibold">Eligibility Warning:</span> {previewMessage('eligibilityWarningMessage')}</p>
                <p><span className="text-[#C9972B] font-semibold">Auto-Removal:</span> {previewMessage('autoRemovalMessage')}</p>
                <p><span className="text-[#C9972B] font-semibold">Error:</span> {previewMessage('errorMessage')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Offers & Campaign Scheduler</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Create scheduled flash sales, gifts with purchase, and real-time countdown banners.
          </p>
        </div>

        <button
          onClick={handleCreateOffer}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Offer</span>
        </button>
      </div>

      {/* Offers Table */}
      <div className="rounded-xl bg-[#171717] border border-[#E8D5A8]/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0B0B] border-b border-[#E8D5A8]/20 text-[#E8D5A8] uppercase tracking-wider font-mono">
              <tr>
                <th className="p-4">Campaign</th>
                <th className="p-4">Type</th>
                <th className="p-4">Coupon</th>
                <th className="p-4">Timeframe</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8D5A8]/10 text-[#FAF9F6]">
              {(offers || []).map((offer) => (
                <tr key={offer.id} className="hover:bg-[#0B0B0B]/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-[#F05A7E]" />
                      <div>
                        <p className="font-semibold text-xs text-[#FAF9F6]">{offer.name}</p>
                        <span className="text-[10px] text-[#6B6B6B] line-clamp-1">{offer.publicTitle}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-[#C9972B] uppercase text-[11px]">
                    {offer.discountType.replace(/_/g, ' ')}
                  </td>
                  <td className="p-4 font-mono text-[#FAF9F6]">
                    {offer.couponCode || '—'}
                  </td>
                  <td className="p-4 text-[11px] text-[#6B6B6B]">
                    {new Date(offer.startDate).toLocaleDateString()} –{' '}
                    {offer.endDate ? new Date(offer.endDate).toLocaleDateString() : 'Ongoing'}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        offer.status === 'active'
                          ? 'bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30'
                          : offer.status === 'scheduled'
                          ? 'bg-[#C9972B]/20 text-[#C9972B] border border-[#C9972B]/30'
                          : 'bg-[#6B6B6B]/20 text-[#6B6B6B]'
                      }`}
                    >
                      {offer.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => setEditingOffer(offer)}
                      className="px-2.5 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteOffer(offer.id)}
                      className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
