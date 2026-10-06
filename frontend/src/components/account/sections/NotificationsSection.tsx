/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Lock, Check } from 'lucide-react';
import {
  NOTIFICATION_TOPIC_META,
  NotificationChannel,
  NotificationPreferences,
  NotificationTopic,
} from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import {
  AccountButton,
  AccountCard,
  AccountError,
  AccountFormMessage,
  AccountLoading,
  AccountSectionHeader,
  AccountToggle,
} from '../AccountUI';

interface NotificationsSectionProps {
  showToast: (message: string) => void;
}

/** Channels the store can actually deliver on today. SMS and WhatsApp are
 * listed but disabled — no gateway is connected, and offering a toggle that
 * silently does nothing would be worse than saying so. */
const CHANNELS: { id: NotificationChannel; label: string; available: boolean; unavailableNote?: string }[] = [
  { id: 'inApp', label: 'In-App', available: true },
  { id: 'email', label: 'Email', available: true },
  { id: 'push', label: 'Push', available: false, unavailableNote: 'Push notifications are not set up on this store yet.' },
  { id: 'sms', label: 'SMS', available: false, unavailableNote: 'An SMS provider has not been connected to this store yet.' },
  { id: 'whatsapp', label: 'WhatsApp', available: false, unavailableNote: 'The WhatsApp Business API is not connected to this store yet.' },
];

export const NotificationsSection: React.FC<NotificationsSectionProps> = ({ showToast }) => {
  const { notificationPreferences, loadNotificationPreferences, saveNotificationPreferences } = useAccount();
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadNotificationPreferences();
  }, [loadNotificationPreferences]);

  useEffect(() => {
    if (notificationPreferences.data && !draft) setDraft(notificationPreferences.data);
  }, [notificationPreferences.data, draft]);

  const dirty = useMemo(
    () => !!draft && !!notificationPreferences.data && JSON.stringify(draft) !== JSON.stringify(notificationPreferences.data),
    [draft, notificationPreferences.data]
  );

  const toggleTopic = (topic: NotificationTopic, enabled: boolean) => {
    setDraft((prev) => (prev ? { ...prev, [topic]: { ...prev[topic], enabled } } : prev));
    setSuccess(null);
  };

  const toggleChannel = (topic: NotificationTopic, channel: NotificationChannel) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const current = prev[topic].channels;
      const next = current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel];
      return { ...prev, [topic]: { ...prev[topic], channels: next } };
    });
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const res = await saveNotificationPreferences(draft);
    setSaving(false);
    if (!res.success) {
      setError(res.error || 'Could not save your preferences.');
      return;
    }
    // The server returns its normalised copy; adopt it so the form shows
    // exactly what was stored (including any topic it forced back on).
    setDraft(null);
    setSuccess('Your notification preferences have been saved.');
    showToast('Preferences saved');
  };

  if (notificationPreferences.loading && !notificationPreferences.loaded) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Communication" title="Notification Preferences" />
        <AccountLoading label="Loading your preferences" />
      </div>
    );
  }

  if (notificationPreferences.error && !notificationPreferences.data) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Communication" title="Notification Preferences" />
        <AccountError message={notificationPreferences.error} onRetry={() => loadNotificationPreferences(true)} />
      </div>
    );
  }

  const prefs = draft || notificationPreferences.data;
  if (!prefs) return null;

  return (
    <div className="space-y-6">
      <AccountSectionHeader
        kicker="Communication"
        title="Notification Preferences"
        description="Marketing messages are off until you switch them on. Updates about orders you place can't be switched off entirely — you always need to be reachable about a purchase."
      />

      <AccountCard className="divide-y divide-[#F1EBDD]">
        {NOTIFICATION_TOPIC_META.map((topic) => {
          const entry = prefs[topic.id];
          return (
            <div key={topic.id} className="p-5 space-y-3.5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[13.5px] font-semibold text-[#121212]">{topic.label}</h3>
                    {topic.required && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-[0.12em] uppercase text-[#524C4C] bg-[#FAF9F6] border border-[#E8D5A8] rounded-full px-2 py-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        Always on
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-[#524C4C] mt-0.5 leading-relaxed">{topic.description}</p>
                </div>
                <AccountToggle
                  checked={entry.enabled}
                  disabled={topic.required}
                  onChange={(next) => toggleTopic(topic.id, next)}
                  label={`${topic.label} notifications`}
                />
              </div>

              {entry.enabled && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {CHANNELS.map((channel) => {
                    const selected = entry.channels.includes(channel.id);
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        disabled={!channel.available}
                        title={channel.unavailableNote}
                        onClick={() => toggleChannel(topic.id, channel.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10.5px] font-semibold tracking-[0.08em] uppercase transition-colors ${
                          !channel.available
                            ? 'bg-[#FAF9F6] text-[#C4BCA9] border-[#EFE8D8] cursor-not-allowed'
                            : selected
                            ? 'bg-[#0B0B0B] text-white border-[#0B0B0B] cursor-pointer'
                            : 'bg-white text-[#524C4C] border-[#E8D5A8] hover:border-[#C9972B] cursor-pointer'
                        }`}
                      >
                        {selected && channel.available && <Check className="w-3 h-3" />}
                        {channel.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </AccountCard>

      <div className="flex gap-2.5 bg-[#FAF9F6] border border-[#E8D5A8] rounded-xl p-4">
        <Bell className="w-4 h-4 text-[#C9972B] shrink-0 mt-0.5" />
        <p className="text-[11.5px] text-[#524C4C] leading-relaxed">
          SMS, WhatsApp and push channels are shown for completeness but can&apos;t be selected — those providers have not
          been connected to this store yet. In-app and email notifications are delivered today.
        </p>
      </div>

      <AccountFormMessage tone="error" message={error} />
      <AccountFormMessage tone="success" message={success} />

      <div className="flex flex-wrap gap-3">
        <AccountButton loading={saving} disabled={!dirty} onClick={handleSave}>
          Save Preferences
        </AccountButton>
        {dirty && (
          <AccountButton variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
            Discard Changes
          </AccountButton>
        )}
      </div>
    </div>
  );
};
