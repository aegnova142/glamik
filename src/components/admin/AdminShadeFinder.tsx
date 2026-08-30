import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSShadeJourney, CMSJourneyStep, CMSFindMyShadeResultsCopy, CMSFindMyShadeHero } from '../../types';
import { useSyncOnce } from '../../hooks/useSyncOnce';
import { ImageCropUploadModal } from './ImageCropUploadModal';
import {
  Plus,
  Trash2,
  Save,
  Check,
  Sparkles,
  Palette,
  Camera,
  Wand2,
  ShoppingBag,
  Settings2,
  Heart,
  Star,
  Gift,
  Truck,
  Smile,
  GripVertical,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Palette,
  Camera,
  Wand2,
  ShoppingBag,
  Settings2,
  Heart,
  Star,
  Gift,
  Truck,
  Smile,
};
const AVAILABLE_ICONS = Object.keys(ICON_MAP);

const DEFAULT_JOURNEY: CMSShadeJourney = {
  eyebrow: 'YOUR BEAUTY JOURNEY',
  title: 'Find Your Match in ',
  titleHighlight: '7 Simple Steps',
  steps: [],
};

const DEFAULT_RESULTS_COPY: CMSFindMyShadeResultsCopy = {
  resultsBadge: 'YOUR GLAMIRK MATCH',
  resultsHeading: 'YOUR PERSONAL BEAUTY EDIT',
  resultsSubtitle: 'Calibrated for your verified undertone, signature aesthetic, and occasion.',
  alternativesEyebrow: 'CURATED VARIATIONS',
  alternativesHeading: 'MORE SHADES YOU MAY LOVE',
};

const DEFAULT_HERO: CMSFindMyShadeHero = {
  badgeText: 'INTELLIGENT SHADE DISCOVERY',
  headingLine1: 'FIND YOUR',
  headingHighlight: 'PERFECT SHADE',
  description: 'Beauty is personal. Your shade should be too. Let Glamirk curate your ideal lip & cosmetic matches based on your unique undertone, aesthetic style, and everyday rituals.',
  image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85',
  primaryCtaText: 'START FINDING MY SHADE',
  secondaryCtaText: 'I ALREADY KNOW MY SHADE',
  captionLabel: 'Undertone Precision',
  captionText: 'Warm, Cool & Neutral pigments crafted for lasting wear.',
};

export const AdminShadeFinder: React.FC = () => {
  const {
    shadeJourney,
    saveShadeJourney,
    findMyShadeResultsCopy,
    saveFindMyShadeResultsCopy,
    findMyShadeHero,
    saveFindMyShadeHero,
  } = useCMS();
  const [journeyState, setJourneyState] = useState<CMSShadeJourney>(shadeJourney || DEFAULT_JOURNEY);
  const [resultsCopyState, setResultsCopyState] = useState<CMSFindMyShadeResultsCopy>(findMyShadeResultsCopy || DEFAULT_RESULTS_COPY);
  const [heroState, setHeroState] = useState<CMSFindMyShadeHero>(findMyShadeHero || DEFAULT_HERO);
  const [isHeroImageUploadOpen, setIsHeroImageUploadOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSyncOnce(shadeJourney, setJourneyState);
  useSyncOnce(findMyShadeResultsCopy, setResultsCopyState);
  useSyncOnce(findMyShadeHero, setHeroState);

  const handleSave = async () => {
    setError(null);
    if (!journeyState.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!heroState.headingLine1.trim() || !heroState.description.trim()) {
      setError('Hero heading and description are required.');
      return;
    }
    setIsSaving(true);
    const [journeyOk, resultsOk, heroOk] = await Promise.all([
      saveShadeJourney(journeyState),
      saveFindMyShadeResultsCopy(resultsCopyState),
      saveFindMyShadeHero(heroState),
    ]);
    setIsSaving(false);
    if (journeyOk && resultsOk && heroOk) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } else {
      setError('Save failed. Please try again.');
    }
  };

  const handleAddStep = () => {
    const newStep: CMSJourneyStep = {
      id: `step-${Date.now()}`,
      icon: 'Sparkles',
      title: 'New Step',
      description: 'Describe this step',
    };
    setJourneyState({ ...journeyState, steps: [...journeyState.steps, newStep] });
  };

  const handleUpdateStep = (id: string, patch: Partial<CMSJourneyStep>) => {
    setJourneyState({
      ...journeyState,
      steps: journeyState.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const handleDeleteStep = (id: string) => {
    if (!window.confirm('Delete this step?')) return;
    setJourneyState({ ...journeyState, steps: journeyState.steps.filter((s) => s.id !== id) });
  };

  const handleMoveStep = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= journeyState.steps.length) return;
    const steps = [...journeyState.steps];
    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
    setJourneyState({ ...journeyState, steps });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Find My Shade</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Manage the landing hero, "Beauty Journey in Simple Steps" section, and quiz results headings on the Find My Shade page.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#F05A7E]/10 border border-[#F05A7E]/30 rounded-lg text-xs text-[#F05A7E]">
          {error}
        </div>
      )}

      {/* Landing Hero — badge, heading, description, photo shown at the very top of the page */}
      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4 max-w-2xl">
        <div>
          <h3 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">Landing Hero</h3>
          <p className="text-[11px] text-[#6B6B6B] mt-0.5">
            The "Find Your Perfect Shade" section shoppers see first, before starting the quiz.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Badge Text</label>
          <input
            type="text"
            value={heroState.badgeText}
            onChange={(e) => setHeroState({ ...heroState, badgeText: e.target.value })}
            className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Heading Line *
            </label>
            <input
              type="text"
              value={heroState.headingLine1}
              onChange={(e) => setHeroState({ ...heroState, headingLine1: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Heading Highlight (italic)
            </label>
            <input
              type="text"
              value={heroState.headingHighlight}
              onChange={(e) => setHeroState({ ...heroState, headingHighlight: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
            Description *
          </label>
          <textarea
            value={heroState.description}
            onChange={(e) => setHeroState({ ...heroState, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Primary Button Text</label>
            <input
              type="text"
              value={heroState.primaryCtaText}
              onChange={(e) => setHeroState({ ...heroState, primaryCtaText: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Secondary Button Text</label>
            <input
              type="text"
              value={heroState.secondaryCtaText}
              onChange={(e) => setHeroState({ ...heroState, secondaryCtaText: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-[#E8D5A8]/15 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Photo</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={heroState.image}
                onChange={(e) => setHeroState({ ...heroState, image: e.target.value })}
                placeholder="https://..."
                className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
              <button
                type="button"
                onClick={() => setIsHeroImageUploadOpen(true)}
                className="px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap"
              >
                Upload
              </button>
            </div>
            {heroState.image && (
              <div className="mt-2 w-24 aspect-[4/5] rounded-lg overflow-hidden border border-[#E8D5A8]/30 bg-[#0B0B0B]">
                <img src={heroState.image} alt="Hero preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {isHeroImageUploadOpen && (
            <ImageCropUploadModal
              isOpen
              onClose={() => setIsHeroImageUploadOpen(false)}
              title="Upload Find My Shade Hero Photo"
              aspectRatio={0.8}
              minWidth={800}
              minHeight={1000}
              recommendedWidth={1000}
              recommendedHeight={1250}
              outputWidth={1000}
              outputHeight={1250}
              onUploaded={({ url }) => setHeroState({ ...heroState, image: url })}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Photo Caption Label</label>
              <input
                type="text"
                value={heroState.captionLabel}
                onChange={(e) => setHeroState({ ...heroState, captionLabel: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Photo Caption Text</label>
              <input
                type="text"
                value={heroState.captionText}
                onChange={(e) => setHeroState({ ...heroState, captionText: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section heading fields */}
      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4 max-w-2xl">
        <h3 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">Section Heading</h3>
        <div>
          <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Eyebrow</label>
          <input
            type="text"
            value={journeyState.eyebrow}
            onChange={(e) => setJourneyState({ ...journeyState, eyebrow: e.target.value })}
            className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Title *
            </label>
            <input
              type="text"
              value={journeyState.title}
              onChange={(e) => setJourneyState({ ...journeyState, title: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Title Highlight
            </label>
            <input
              type="text"
              value={journeyState.titleHighlight}
              onChange={(e) => setJourneyState({ ...journeyState, titleHighlight: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
        </div>
        <p className="text-[10px] text-[#6B6B6B]">
          Live preview: {journeyState.eyebrow} — {journeyState.title}
          <span className="text-[#F05A7E] font-semibold">{journeyState.titleHighlight}</span>
        </p>
      </div>

      {/* Quiz Results Page Headings */}
      <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4 max-w-2xl">
        <div>
          <h3 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">Quiz Results Page Headings</h3>
          <p className="text-[11px] text-[#6B6B6B] mt-0.5">
            Shown after a customer completes the shade quiz — "Your Personal Beauty Edit" and "More Shades You May Love".
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Results Badge</label>
            <input
              type="text"
              value={resultsCopyState.resultsBadge}
              onChange={(e) => setResultsCopyState({ ...resultsCopyState, resultsBadge: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Results Heading</label>
            <input
              type="text"
              value={resultsCopyState.resultsHeading}
              onChange={(e) => setResultsCopyState({ ...resultsCopyState, resultsHeading: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Results Subtitle</label>
          <input
            type="text"
            value={resultsCopyState.resultsSubtitle}
            onChange={(e) => setResultsCopyState({ ...resultsCopyState, resultsSubtitle: e.target.value })}
            className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#E8D5A8]/15">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Alternatives Eyebrow</label>
            <input
              type="text"
              value={resultsCopyState.alternativesEyebrow}
              onChange={(e) => setResultsCopyState({ ...resultsCopyState, alternativesEyebrow: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">Alternatives Heading</label>
            <input
              type="text"
              value={resultsCopyState.alternativesHeading}
              onChange={(e) => setResultsCopyState({ ...resultsCopyState, alternativesHeading: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
        </div>
      </div>

      {/* Steps list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">
            Steps ({journeyState.steps.length})
          </h3>
          <button
            onClick={handleAddStep}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Step</span>
          </button>
        </div>

        {journeyState.steps.length === 0 && (
          <div className="p-8 text-center text-xs text-[#6B6B6B] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl">
            No steps yet. Click "Add Step" to create one.
          </div>
        )}

        {journeyState.steps.map((step, index) => {
          const Icon = ICON_MAP[step.icon] || Sparkles;
          return (
            <div key={step.id} className="p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 flex items-start gap-3">
              <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                <GripVertical className="w-3.5 h-3.5 text-[#6B6B6B]" />
                <span className="text-[10px] text-[#6B6B6B] font-mono">{index + 1}</span>
              </div>

              <div className="flex-1 space-y-3 min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_ICONS.map((iconName) => {
                    const OptIcon = ICON_MAP[iconName];
                    const isSelected = step.icon === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => handleUpdateStep(step.id, { icon: iconName })}
                        className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#C9972B] border-[#C9972B] text-[#0B0B0B]' : 'bg-[#0B0B0B] border-[#E8D5A8]/30 text-[#6B6B6B] hover:border-[#C9972B]'
                        }`}
                        title={iconName}
                      >
                        <OptIcon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
                  <input
                    type="text"
                    value={step.title}
                    onChange={(e) => handleUpdateStep(step.id, { title: e.target.value })}
                    placeholder="Step title"
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  />
                  <input
                    type="text"
                    value={step.description}
                    onChange={(e) => handleUpdateStep(step.id, { description: e.target.value })}
                    placeholder="Step description"
                    className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  />
                </div>
              </div>

              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="w-9 h-9 rounded-lg bg-[#FCE8ED]/10 border border-[#E8D5A8]/20 flex items-center justify-center text-[#C9972B]">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleMoveStep(index, -1)}
                    disabled={index === 0}
                    className="px-1.5 py-1 text-[10px] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleMoveStep(index, 1)}
                    disabled={index === journeyState.steps.length - 1}
                    className="px-1.5 py-1 text-[10px] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded text-[#6B6B6B] hover:text-[#FAF9F6] disabled:opacity-30 cursor-pointer"
                  >
                    ↓
                  </button>
                </div>
                <button
                  onClick={() => handleDeleteStep(step.id)}
                  className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
