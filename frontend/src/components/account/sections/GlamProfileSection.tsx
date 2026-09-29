/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  BEAUTY_INTEREST_OPTIONS,
  GlamProfile,
  MAKEUP_PREFERENCE_OPTIONS,
  SKIN_TYPE_OPTIONS,
} from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import {
  AccountButton,
  AccountCard,
  AccountError,
  AccountField,
  AccountFormMessage,
  AccountLoading,
  AccountSectionHeader,
  formatDate,
  inputClass,
} from '../AccountUI';

interface GlamProfileSectionProps {
  onOpenShadeFinder: () => void;
  showToast: (message: string) => void;
}

const SKIN_TONES = ['Fair', 'Light', 'Medium', 'Tan', 'Deep', 'Rich'];
const UNDERTONES = ['Warm', 'Cool', 'Neutral', 'Olive'];
const FINISHES = ['Matte', 'Satin', 'Glossy', 'Dewy'];
const STYLES = ['Minimal', 'Everyday', 'Bold', 'Editorial'];
const OCCASIONS = ['Everyday', 'Work', 'Evening', 'Bridal', 'Festive'];

const emptyProfile: GlamProfile = {
  makeupPreferences: [],
  beautyInterests: [],
  preferredLooks: [],
  preferredShadeIds: [],
};

/** Reusable multi-select chip row. */
const ChipGroup: React.FC<{
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  ariaLabel: string;
}> = ({ options, selected, onToggle, ariaLabel }) => (
  <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
    {options.map((option) => {
      const active = selected.includes(option);
      return (
        <button
          key={option}
          type="button"
          aria-pressed={active}
          onClick={() => onToggle(option)}
          className={`px-3.5 py-2 rounded-full border text-[11.5px] transition-colors cursor-pointer ${
            active
              ? 'bg-[#0B0B0B] text-white border-[#0B0B0B]'
              : 'bg-white text-[#6B6B6B] border-[#E8D5A8] hover:border-[#C9972B] hover:text-[#121212]'
          }`}
        >
          {option}
        </button>
      );
    })}
  </div>
);

/** Single-select pill row (tone, undertone, finish, …). */
const OptionRow: React.FC<{
  options: readonly string[];
  value?: string;
  onChange: (value: string | undefined) => void;
  ariaLabel: string;
}> = ({ options, value, onChange, ariaLabel }) => (
  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
    {options.map((option) => {
      const active = value === option;
      return (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={active}
          // Tapping the selected pill clears it — these are all optional, and
          // there would otherwise be no way to undo an accidental choice.
          onClick={() => onChange(active ? undefined : option)}
          className={`px-3.5 py-2 rounded-full border text-[11.5px] transition-colors cursor-pointer ${
            active
              ? 'bg-[#C9972B] text-[#0B0B0B] border-[#C9972B] font-semibold'
              : 'bg-white text-[#6B6B6B] border-[#E8D5A8] hover:border-[#C9972B] hover:text-[#121212]'
          }`}
        >
          {option}
        </button>
      );
    })}
  </div>
);

export const GlamProfileSection: React.FC<GlamProfileSectionProps> = ({ onOpenShadeFinder, showToast }) => {
  const { glamProfile, loadGlamProfile, saveGlamProfile } = useAccount();
  const [form, setForm] = useState<GlamProfile>(emptyProfile);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadGlamProfile();
  }, [loadGlamProfile]);

  useEffect(() => {
    if (!glamProfile.loaded || seeded) return;
    setForm(glamProfile.data ? { ...emptyProfile, ...glamProfile.data } : emptyProfile);
    setSeeded(true);
  }, [glamProfile.loaded, glamProfile.data, seeded]);

  const set = <K extends keyof GlamProfile>(key: K, value: GlamProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
  };

  const toggleIn = (key: 'makeupPreferences' | 'beautyInterests', value: string) => {
    setForm((prev) => {
      const list = prev[key] || [];
      return { ...prev, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const res = await saveGlamProfile(form);
    setSaving(false);
    if (!res.success) {
      setError(res.error || 'Could not save your Glam profile.');
      return;
    }
    setSuccess('Your Glam profile has been saved.');
    showToast('Glam profile saved');
  };

  if (glamProfile.loading && !glamProfile.loaded) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Personalisation" title="My Glam Profile" />
        <AccountLoading label="Loading your Glam profile" rows={2} />
      </div>
    );
  }

  if (glamProfile.error && !glamProfile.data) {
    return (
      <div className="space-y-6">
        <AccountSectionHeader kicker="Personalisation" title="My Glam Profile" />
        <AccountError message={glamProfile.error} onRetry={() => loadGlamProfile(true)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AccountSectionHeader
        kicker="Personalisation"
        title="My Glam Profile"
        description="Tell us what you like and we'll tailor shade matches and recommendations to it. These are preferences only — we make no claims about your skin health."
        action={
          <AccountButton variant="secondary" onClick={onOpenShadeFinder}>
            <Sparkles className="w-3.5 h-3.5" />
            Take the Shade Quiz
          </AccountButton>
        }
      />

      {glamProfile.data?.updatedAt && (
        <p className="text-[11px] text-[#6B6B6B]">Last updated {formatDate(glamProfile.data.updatedAt)}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AccountCard className="p-5 space-y-5">
          <h2 className="font-serif text-lg text-[#121212]">Complexion</h2>
          <AccountField label="Skin Tone">
            <OptionRow options={SKIN_TONES} value={form.skinTone} onChange={(v) => set('skinTone', v)} ariaLabel="Skin tone" />
          </AccountField>
          <AccountField label="Undertone">
            <OptionRow options={UNDERTONES} value={form.undertone} onChange={(v) => set('undertone', v)} ariaLabel="Undertone" />
          </AccountField>
          <AccountField label="Skin Type">
            <OptionRow options={SKIN_TYPE_OPTIONS} value={form.skinType} onChange={(v) => set('skinType', v)} ariaLabel="Skin type" />
          </AccountField>
        </AccountCard>

        <AccountCard className="p-5 space-y-5">
          <h2 className="font-serif text-lg text-[#121212]">Style</h2>
          <AccountField label="Preferred Finish">
            <OptionRow options={FINISHES} value={form.finishPreference} onChange={(v) => set('finishPreference', v)} ariaLabel="Finish" />
          </AccountField>
          <AccountField label="Signature Style">
            <OptionRow options={STYLES} value={form.stylePreference} onChange={(v) => set('stylePreference', v)} ariaLabel="Style" />
          </AccountField>
          <AccountField label="Primary Occasion">
            <OptionRow options={OCCASIONS} value={form.occasion} onChange={(v) => set('occasion', v)} ariaLabel="Occasion" />
          </AccountField>
          <AccountField label="Makeup Preferences" hint="Choose as many as you like">
            <ChipGroup
              options={MAKEUP_PREFERENCE_OPTIONS}
              selected={form.makeupPreferences || []}
              onToggle={(v) => toggleIn('makeupPreferences', v)}
              ariaLabel="Makeup preferences"
            />
          </AccountField>
          <AccountField label="Beauty Interests">
            <ChipGroup
              options={BEAUTY_INTEREST_OPTIONS}
              selected={form.beautyInterests || []}
              onToggle={(v) => toggleIn('beautyInterests', v)}
              ariaLabel="Beauty interests"
            />
          </AccountField>
        </AccountCard>

        <AccountCard className="p-5 space-y-4">
          <h2 className="font-serif text-lg text-[#121212]">Anything else?</h2>
          <AccountField label="Notes for our consultants" htmlFor="glam-notes" hint="Allergies, textures you avoid, shades you love">
            <textarea
              id="glam-notes"
              value={form.notes || ''}
              onChange={(e) => set('notes', e.target.value)}
              rows={4}
              maxLength={500}
              className={inputClass}
              placeholder="Optional"
            />
          </AccountField>
        </AccountCard>

        <AccountFormMessage tone="error" message={error} />
        <AccountFormMessage tone="success" message={success} />

        <AccountButton type="submit" loading={saving}>
          Save Glam Profile
        </AccountButton>
      </form>
    </div>
  );
};
