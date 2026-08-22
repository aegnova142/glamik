import React, { useState, useRef } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
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
} from 'lucide-react';
import { CMSShadeJourney } from '../../types';

const JOURNEY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
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

const SWIPE_THRESHOLD_PX = 45;

interface BeautyJourneySectionProps {
  journey: CMSShadeJourney;
  onStepAction: () => void;
}

export const BeautyJourneySection: React.FC<BeautyJourneySectionProps> = ({ journey, onStepAction }) => {
  const steps = journey.steps;
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (!steps || steps.length === 0) return null;

  const activeStep = steps[activeIndex];
  const progressPct = steps.length > 1 ? (activeIndex / (steps.length - 1)) * 100 : 100;

  const goTo = (idx: number) => {
    setActiveIndex(Math.max(0, Math.min(steps.length - 1, idx)));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (deltaX < -SWIPE_THRESHOLD_PX) {
      goTo(activeIndex + 1);
    } else if (deltaX > SWIPE_THRESHOLD_PX) {
      goTo(activeIndex - 1);
    }
    touchStartX.current = null;
  };

  return (
    <section className="py-16 lg:py-24 bg-[#FCE8ED]/30 border-b border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
            {journey.eyebrow}
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl text-[#121212] mt-2">
            {journey.title}
            <span className="italic font-light text-[#F05A7E]">{journey.titleHighlight}</span>
          </h2>
        </div>

        {/* DESKTOP: horizontal step row with connecting progress line */}
        <div className="hidden sm:block">
          <div className="relative">
            <div className="absolute left-0 right-0 top-8 h-[2px] bg-[#E8D5A8]" aria-hidden="true">
              <div
                className="h-full bg-[#C9972B] transition-all duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="relative grid grid-cols-4 lg:grid-cols-7 gap-y-8 gap-x-4">
              {steps.map((step, index) => {
                const Icon = JOURNEY_ICON_MAP[step.icon] || Sparkles;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-pressed={isActive}
                    aria-label={`Step ${index + 1}: ${step.title}`}
                    className="flex flex-col items-center text-center gap-3 cursor-pointer bg-transparent border-0 p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05A7E] group"
                  >
                    <div className="relative">
                      <div
                        className={`w-16 h-16 rounded-full border shadow-sm flex items-center justify-center transition-all duration-300 ${
                          isActive
                            ? 'bg-[#0B0B0B] border-[#0B0B0B] text-[#E3B84B] scale-110'
                            : 'bg-white border-[#E8D5A8] text-[#F05A7E] group-hover:scale-105 group-hover:border-[#C9972B]'
                        }`}
                      >
                        <Icon className="w-6 h-6 stroke-[1.5]" />
                      </div>
                      <span
                        className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center transition-colors duration-300 ${
                          isActive ? 'bg-[#E3B84B] text-[#0B0B0B]' : 'bg-[#0B0B0B] text-[#FAF9F6]'
                        }`}
                      >
                        {index + 1}
                      </span>
                    </div>
                    <div>
                      <h3
                        className={`text-[11px] uppercase tracking-wide leading-tight transition-all duration-300 ${
                          isActive ? 'font-extrabold text-[#121212]' : 'font-bold text-[#121212]/80'
                        }`}
                      >
                        {step.title}
                      </h3>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          <div
            key={activeStep.id}
            className="mt-10 max-w-xl mx-auto text-center bg-white border border-[#E8D5A8] rounded-2xl p-8 shadow-[0_10px_35px_rgba(11,11,11,0.06)] animate-[journeyFadeIn_400ms_ease-out]"
          >
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#C9972B]">
              STEP {activeIndex + 1}
            </span>
            <h3 className="font-serif text-2xl text-[#121212] mt-2">{activeStep.title}</h3>
            <p className="text-sm text-[#6B6B6B] mt-3 leading-relaxed">{activeStep.description}</p>
            <button
              type="button"
              onClick={onStepAction}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-[#0B0B0B] text-white text-xs font-semibold tracking-[0.18em] uppercase hover:bg-[#C9972B] hover:text-[#0B0B0B] transition-colors cursor-pointer rounded-full"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MOBILE: single active step with swipe + prev/next */}
        <div
          className="sm:hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <p className="text-center text-[11px] font-semibold text-[#C9972B] uppercase tracking-wider mb-4">
            Step {activeIndex + 1} of {steps.length}
          </p>

          <div key={activeStep.id} className="bg-white border border-[#E8D5A8] rounded-2xl p-6 text-center animate-[journeyFadeIn_300ms_ease-out]">
            {(() => {
              const Icon = JOURNEY_ICON_MAP[activeStep.icon] || Sparkles;
              return (
                <div className="w-16 h-16 mx-auto rounded-full bg-[#0B0B0B] text-[#E3B84B] flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 stroke-[1.5]" />
                </div>
              );
            })()}
            <h3 className="text-sm font-extrabold text-[#121212] uppercase tracking-wide">{activeStep.title}</h3>
            <p className="text-xs text-[#6B6B6B] mt-2 leading-relaxed">{activeStep.description}</p>
            <button
              type="button"
              onClick={onStepAction}
              className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-[#0B0B0B] text-white text-xs font-semibold tracking-[0.18em] uppercase hover:bg-[#C9972B] hover:text-[#0B0B0B] transition-colors cursor-pointer rounded-full"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-5 h-1 bg-[#E8D5A8] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#C9972B] transition-all duration-300 ease-out"
              style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }}
            />
          </div>

          {/* Prev / Next */}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => goTo(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label="Previous step"
              className="flex items-center gap-1 text-xs font-semibold text-[#121212] disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={() => goTo(activeIndex + 1)}
              disabled={activeIndex === steps.length - 1}
              aria-label="Next step"
              className="flex items-center gap-1 text-xs font-semibold text-[#121212] disabled:opacity-30 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes journeyFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
};
