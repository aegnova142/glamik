import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Eye,
  Users,
  Leaf,
  FlaskConical,
  Heart,
  ArrowRight,
  Sparkles,
  XCircle,
  CheckCircle2,
  Quote,
} from 'lucide-react';
import { updatePageSeo } from '../../utils/seo';
import { trackEvent } from '../../utils/analytics';
import { useCMS } from '../../context/CMSContext';
import { CMSAboutContent } from '../../types';

interface AboutPageProps {
  onExploreShop: () => void;
  onNavigateSupport: () => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ShieldCheck,
  Eye,
  Users,
  Leaf,
  FlaskConical,
  Heart,
};

const GRID_VISIBLE_LIMIT = 3;

const DEFAULT_ABOUT: CMSAboutContent = {
  statementParagraphs: [
    "At Glamirk, we believe that true beauty shouldn't demand a compromise between instant impact and long-term skin health. We are a team of Beauty Advisors, creators, strategists, and beauty enthusiasts united by a single conviction: everyday routines should feel effortless, ethical, and deeply transformative.",
    'Bare skin should look better after you take your makeup off than before you put it on. By combining active botanical extracts, bio-fermented ingredients, and zero-irritation pigments, Glamirk delivers instant aesthetic impact paired with active skin therapy as a makeup brand.',
  ],
  brandSnapshot: [
    { id: 'bs-1', title: 'Brand Name', description: 'Glamirk' },
    { id: 'bs-2', title: 'One-Line Description', description: 'Radiance without compromise. Amplify your beauty.' },
    { id: 'bs-3', title: 'What We Sell', description: 'Premium, affordable, multi-use color cosmetics and tailored personal care formulations.' },
    { id: 'bs-4', title: 'Overall Philosophy', description: 'Beauty should be effortless, ethical, and effective&mdash;bridging clinical-grade ingredients with luxurious self-care.' },
  ],
  founders: [
    { id: 'f-1', name: 'Digangana Suryavanshi', title: 'Chief Customer Officer', focus: "Champions every client's journey — from first shade match to lifelong loyalty.", image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=400&q=80' },
    { id: 'f-2', name: 'Aqueel Ahmed', title: 'Chief Financial Officer', focus: 'Stewards sustainable growth, from ethical sourcing to accessible pricing.', image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80' },
    { id: 'f-3', name: 'Vijay Laxmi Sharma', title: 'Chief Growth Officer', focus: "Drives Glamirk's expansion into new markets and beauty rituals.", image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80' },
    { id: 'f-4', name: 'Poonam Dadhich', title: 'Chief Marketing Officer', focus: 'Shapes the Glamirk voice — editorial storytelling rooted in inclusivity.', image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80' },
  ],
  founderStoryAccordion: [
    { id: 'founder-story', label: 'The Founder Story', content: "After years of navigating sensitive skin reactions while working in fast-paced creative environments, we partnered with leading cosmetic chemists to create high-performing, skin-first makeup. As someone who lived in high-stress, fast-paced creative spaces, my skin was constantly paying the price. Heavy studio makeup and long hours kept triggering reactions, but 'gentle' alternatives just couldn't last through the day. That frustration became Glamirk. We partnered with leading cosmetic chemists to create a new standard: makeup that delivers vibrant, high-impact results while actively respecting and supporting sensitive skin." },
    { id: 'founder-why', label: 'Why Glamirk Was Created', content: 'Glamirk was founded to eliminate the compromise between instant cosmetic impact and long-term skin health. It answers the need for high-performance makeup infused with clinical-grade skincare.' },
    { id: 'founder-problem', label: 'The Problem Solved', content: 'Traditional cosmetics often act as a mask that clogs pores and degrades skin quality over time, forcing consumers into a cycle of using more makeup to cover skin damage caused by their makeup.' },
    { id: 'founder-exist', label: 'Why Glamirk Needs to Exist', content: 'Most beauty brands fall into one of two extremes: "clean" natural products that lack vibrancy and longevity, or high-pigment cosmetics packed with harsh synthetic fillers. Glamirk exists as the bio-compatible bridge where high pigment meets active dermal repair.' },
    { id: 'founder-name', label: 'What "Glamirk" Means', content: 'A blend of Glamour (expressive, high-impact aesthetics) and Smirk (a smile which you have when you are pleased with yourself).' },
    { id: 'founder-pitch', label: 'The Elevator Pitch', content: 'Glamirk is the hybrid beauty brand that gives you immediate editorial-level color while actively repairing your skin barrier.' },
  ],
  ourStoryAccordion: [
    { id: 'story-start', label: 'How It Started', content: 'Born in a small laboratory setting out of a passion for functional aesthetics, Glamirk began as an answer to overly complicated, multi-step routines that yielded minimal results.' },
    { id: 'story-why', label: 'Why It Was Created', content: 'To strip away unnecessary fillers and toxic additives, replacing them with concentrated, bio-compatible ingredients.' },
    { id: 'story-problem', label: 'The Problem Solved', content: 'The market was divided between high-performing chemicals that irritated the skin barrier and "clean" natural products that lacked visible results. Glamirk offers the sweet spot: active performance with gentle ingredients.' },
    { id: 'story-milestones', label: 'Milestones', content: 'Formulated the flagship barrier-repair serum; sold more than 100,000 products; transitioned to 100% post-consumer recycled glass packaging.' },
  ],
  mission: 'To empower individuals through simple, highly effective beauty rituals that nurture skin health, enhance confidence, and celebrate individuality.',
  vision: 'To become a global icon in sustainable luxury, setting new standards for clean science and skin inclusivity worldwide.',
  values: [
    { id: 'v-1', icon: 'ShieldCheck', title: 'Quality', description: 'Medical-grade purity in every batch, rigorously batch-tested for potency.' },
    { id: 'v-2', icon: 'Eye', title: 'Transparency', description: 'Full ingredient lists with explicit percentages for key actives.' },
    { id: 'v-3', icon: 'Users', title: 'Inclusivity', description: 'Formulations designed to perform across diverse skin tones, textures, and age groups.' },
    { id: 'v-4', icon: 'Leaf', title: 'Sustainability', description: 'Sourcing ethically, minimizing plastic, and prioritizing refillable designs.' },
    { id: 'v-5', icon: 'FlaskConical', title: 'Innovation', description: 'Utilizing bio-fermented actives and micro-encapsulation for deep delivery.' },
    { id: 'v-6', icon: 'Heart', title: 'Customer-First', description: 'Responsive formulation updates directly driven by community feedback.' },
  ],
  premiumStandardIntro: 'Glamirk achieves its premium status through uncompromising ingredient integrity and tactile design. Rapid-absorbing silk textures of our formulas, every touchpoint delivers a sensory, high-performance experience.',
  premiumStandardCards: [
    { id: 'ps-1', title: 'Ingredients & Formulation', description: 'Key Actives: Niacinamide, bio-fermented hyaluronic acid, squalane, and botanical peptides. Free-From: 0% parabens, phthalates, synthetic fragrance, sulfates, or mineral oil.' },
    { id: 'ps-2', title: 'Quality, Safety & Sustainability', description: 'Testing: Clinical third-party testing, dermatologist-approved, non-irritating certification. Eco-Footprint: 100% recyclable glass containers, soy-based inks, FSC-certified paper cartons, and an active refill scheme.' },
    { id: 'ps-3', title: 'Inclusivity', description: 'Skin Tones: Non-ashy mineral pigments for rich color payoff on deep skin tones. Skin Types: Adaptive formulas for oil-control, dry barrier repair, and balanced hydration.' },
  ],
  differentiators: [
    { id: 'd-1', title: 'Active-Infused Pigments', description: 'Every color product contains therapeutic percentages of skincare actives (e.g., niacinamide, ceramide complexes, peptides) rather than token trace amounts.' },
    { id: 'd-2', title: 'Skin Barrier First', description: 'Formulated without common sensitizers, synthetic heavy fragrances, or silicones that trap impurities.' },
    { id: 'd-3', title: 'Zero-G Texture Technology', description: 'Formulations engineered to feel weightless on the skin while providing buildable, full-spectrum coverage.' },
  ],
  neverBecome: [
    { id: 'nb-1', text: 'A trend-chasing brand dropping low-quality products every month that end up in landfills.' },
    { id: 'nb-2', text: 'A brand using buzzword ingredients at non-functional levels just for marketing claims.' },
    { id: 'nb-3', text: 'An exclusive club that over-complicates routines or prices out consumers seeking genuine quality and skin inclusivity.' },
  ],
  futureVisionAccordion: [
    { id: 'future-vision', label: 'Product Innovation, Digital Dominance & Retention', content: 'Executing this vision requires focusing on three fundamental pillars: product innovation, digital dominance, and customer retention. Digitally, growth relies on optimizing direct-to-consumer channels with AI-driven recommendations and immersive try-on experiences, while tapping into social commerce and creator partnerships on platforms like Facebook and Instagram. Customer retention then ties the ecosystem together through VIP loyalty structures, exclusive perks, and tailored lifecycle marketing that converts casual buyers into brand advocates.' },
  ],
  elevatorPitchQuote: 'Glamirk is the hybrid beauty brand that gives you immediate editorial-level color while actively repairing your skin barrier.',
  primaryCtaText: 'Shop Glamirk',
  secondaryCtaText: 'Contact Us',
};

const CardShell: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = 'bg-white border-[#E8D5A8]',
}) => (
  <div className={`h-full p-6 rounded-3xl border shadow-[0_4px_16px_rgba(240,90,126,0.04)] ${className}`}>
    {children}
  </div>
);

interface AccordionItem {
  id: string;
  label: string;
  content: string;
}

const Accordion: React.FC<{ items: AccordionItem[]; defaultOpenId?: string; visibleLimit?: number }> = ({
  items,
  defaultOpenId,
  visibleLimit,
}) => {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId || items[0]?.id || null);
  const [showAll, setShowAll] = useState(false);
  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  const hasMore = !!visibleLimit && items.length > visibleLimit;
  const visibleItems = hasMore && !showAll ? items.slice(0, visibleLimit) : items;

  return (
    <div className="space-y-3">
      {visibleItems.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className="bg-white border border-[#E8D5A8] rounded-2xl transition-all overflow-hidden">
            <button
              onClick={() => toggle(item.id)}
              className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer"
            >
              <h4 className="font-serif text-base sm:text-lg text-[#121212]">{item.label}</h4>
              {isOpen ? (
                <ChevronUp className="w-5 h-5 text-[#F05A7E] flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[#6B6B6B] flex-shrink-0" />
              )}
            </button>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="px-5 sm:px-6 pb-6 pt-1 text-xs sm:text-sm text-[#6B6B6B] font-light leading-relaxed border-t border-[#FAF9F6]"
              >
                <p>{item.content}</p>
              </motion.div>
            )}
          </div>
        );
      })}
      {hasMore && (
        <div className="flex justify-end pt-1">
          <button
            onClick={() => setShowAll((prev) => !prev)}
            type="button"
            className="flex items-center gap-1.5 text-xs font-semibold text-[#C9972B] hover:text-[#F05A7E] transition-colors cursor-pointer"
          >
            <span>{showAll ? 'View Less' : `View More (${items.length - visibleLimit!})`}</span>
            {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      )}
    </div>
  );
};

// A card for a title + long-form text item; the text clamps to a few lines with its own
// View More / View Less toggle (right-aligned) whenever it actually overflows.
const StoryCard: React.FC<{ label: string; content: string; html?: boolean; icon?: React.ReactNode }> = ({
  label,
  content,
  html,
  icon,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsTruncated(el.scrollHeight > el.clientHeight + 1);
    }
  }, [content]);

  return (
    <div className="h-full bg-white rounded-3xl border border-[#E8D5A8] shadow-[0_4px_16px_rgba(240,90,126,0.04)] p-6 flex flex-col">
      {icon ? (
        <div className="flex items-start gap-4 mb-2">
          <div className="p-3 bg-[#FCE8ED] text-[#F05A7E] rounded-2xl flex-shrink-0 border border-[#E8D5A8]">
            {icon}
          </div>
          <h4 className="font-serif text-base text-[#121212] pt-2">{label}</h4>
        </div>
      ) : (
        <h4 className="font-serif text-base text-[#121212] mb-2">{label}</h4>
      )}
      {html ? (
        <p
          ref={textRef}
          className={`text-xs text-[#6B6B6B] leading-relaxed flex-1 ${expanded ? '' : 'line-clamp-5'}`}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ) : (
        <p
          ref={textRef}
          className={`text-xs text-[#6B6B6B] leading-relaxed flex-1 ${expanded ? '' : 'line-clamp-5'}`}
        >
          {content}
        </p>
      )}
      {isTruncated && (
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-[10px] font-bold uppercase tracking-wider text-[#C9972B] hover:text-[#F05A7E] transition-colors cursor-pointer"
          >
            {expanded ? 'View Less' : 'View More'}
          </button>
        </div>
      )}
    </div>
  );
};

// Renders a max-3-per-row grid; if there are more items than the limit,
// a View More / View Less toggle appears on its own row below the grid.
function ExpandableGrid<T extends { id: string }>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, GRID_VISIBLE_LIMIT);
  const hasMore = items.length > GRID_VISIBLE_LIMIT;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {visible.map((item) => renderItem(item))}
      </div>
      {hasMore && (
        <div className="flex justify-end mt-6">
          <button
            onClick={() => setShowAll((prev) => !prev)}
            type="button"
            className="flex items-center gap-1.5 text-xs font-semibold text-[#C9972B] hover:text-[#F05A7E] transition-colors cursor-pointer"
          >
            <span>{showAll ? 'View Less' : `View More (${items.length - GRID_VISIBLE_LIMIT})`}</span>
            {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      )}
    </>
  );
}

export const AboutPage: React.FC<AboutPageProps> = ({ onExploreShop, onNavigateSupport }) => {
  const { aboutContent } = useCMS();
  const about = aboutContent || DEFAULT_ABOUT;

  useEffect(() => {
    updatePageSeo({
      title: 'About Us | Glamirk Beauty Private Limited',
      description:
        'Radiance without compromise. Discover the story, mission, values, and founders behind Glamirk — high-performance, clean beauty crafted to elevate your natural glow.',
    });
    trackEvent('page_view', { route: 'about' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#121212] pb-24 pt-8">
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 text-center border-b border-[#E8D5A8]">
        <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B] block mb-2">
          THE GLAMIRK ATELIER
        </span>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#121212] tracking-tight mb-3">
          ABOUT US
        </h1>
        <p className="font-serif italic text-lg sm:text-xl text-[#6B6B6B] max-w-2xl mx-auto">
          Radiance without compromise&mdash;high-performance, clean beauty crafted to elevate your natural glow.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-20">
        {/* About Us Statement */}
        <section className="max-w-3xl mx-auto text-center space-y-4">
          {about.statementParagraphs.map((para, idx) => (
            <p key={idx} className="text-sm sm:text-base text-[#6B6B6B] leading-relaxed">
              {para}
            </p>
          ))}
        </section>

        {/* Meet the Founders */}
        <section className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B]">
              MEET THE FOUNDERS
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">The Team Behind Glamirk</h2>
          </div>
          <ExpandableGrid
            items={about.founders}
            renderItem={(founder) => (
              <div
                key={founder.id}
                className="h-full bg-white rounded-3xl border border-[#E8D5A8] shadow-[0_4px_16px_rgba(240,90,126,0.04)] overflow-hidden text-center"
              >
                <div className="aspect-[3/4] w-full overflow-hidden bg-[#FCE8ED]">
                  <img src={founder.image} alt={founder.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="p-7 space-y-2">
                  <h3 className="text-lg font-bold text-[#121212] leading-snug">{founder.name}</h3>
                  <p className="text-xs text-[#F05A7E] font-semibold uppercase tracking-wider">{founder.title}</p>
                  <p className="text-sm text-[#6B6B6B] leading-relaxed pt-1">{founder.focus}</p>
                </div>
              </div>
            )}
          />
          <div className="space-y-6 pt-4">
            <div className="text-center space-y-2">
              <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B]">
                FOUNDER STORY
              </span>
              <h3 className="font-serif text-xl sm:text-2xl text-[#121212]">In Their Own Words</h3>
            </div>
            <ExpandableGrid
              items={about.founderStoryAccordion}
              renderItem={(item) => <StoryCard key={item.id} label={item.label} content={item.content} />}
            />
          </div>
        </section>

        {/* Brand Snapshot */}
        <section className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B]">
              AT A GLANCE
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">Brand Snapshot</h2>
          </div>
          <ExpandableGrid
            items={about.brandSnapshot}
            renderItem={(fact) => <StoryCard key={fact.id} label={fact.title} content={fact.description} html />}
          />
        </section>

        {/* Our Story */}
        <section className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B]">OUR STORY</span>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">From Lab Bench to Ritual</h2>
          </div>
          <ExpandableGrid
            items={about.ourStoryAccordion}
            renderItem={(item) => <StoryCard key={item.id} label={item.label} content={item.content} />}
          />
        </section>

        {/* Mission & Vision */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          <CardShell>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#F05A7E] block mb-2">
              Mission
            </span>
            <p className="text-sm leading-relaxed text-[#121212]">{about.mission}</p>
          </CardShell>
          <CardShell>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#F05A7E] block mb-2">
              Vision
            </span>
            <p className="text-sm leading-relaxed text-[#121212]">{about.vision}</p>
          </CardShell>
        </section>

        {/* Our Values */}
        <section className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B]">OUR VALUES</span>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">What We Stand For</h2>
          </div>
          <ExpandableGrid
            items={about.values}
            renderItem={(value) => {
              const Icon = ICON_MAP[value.icon] || ShieldCheck;
              return (
                <StoryCard
                  key={value.id}
                  label={value.title}
                  content={value.description}
                  icon={<Icon className="w-5 h-5 stroke-[2]" />}
                />
              );
            }}
          />
        </section>

        {/* What Makes Us Different */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B]">
              THE PREMIUM STANDARD
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">Product Integrity, Safety &amp; Sustainability</h2>
            <p className="text-sm text-[#6B6B6B] leading-relaxed">{about.premiumStandardIntro}</p>
          </div>
          <ExpandableGrid
            items={about.premiumStandardCards}
            renderItem={(card) => <StoryCard key={card.id} label={card.title} content={card.description} />}
          />
        </section>

        {/* Strategic Differentiation & Brand Boundaries */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          <CardShell>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-[#F05A7E]" />
              <h3 className="font-serif text-lg text-[#121212]">What Makes Glamirk Different</h3>
            </div>
            <ul className="space-y-4">
              {about.differentiators.map((item) => (
                <li key={item.id}>
                  <span className="text-xs font-bold text-[#121212] block">{item.title}</span>
                  <span className="text-xs text-[#6B6B6B] leading-relaxed">{item.description}</span>
                </li>
              ))}
            </ul>
          </CardShell>
          <CardShell>
            <div className="flex items-center gap-2 mb-4">
              <XCircle className="w-5 h-5 text-[#6B6B6B]" />
              <h3 className="font-serif text-lg text-[#121212]">What Glamirk Should Never Become</h3>
            </div>
            <ul className="space-y-3">
              {about.neverBecome.map((point) => (
                <li key={point.id} className="text-xs text-[#6B6B6B] leading-relaxed flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#F05A7E] mt-1.5 flex-shrink-0" />
                  {point.text}
                </li>
              ))}
            </ul>
          </CardShell>
        </section>

        {/* Future Vision & Market Strategy (expandable) */}
        <section className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B]">
              LOOKING AHEAD
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">Future Vision &amp; Market Strategy</h2>
          </div>
          <Accordion items={about.futureVisionAccordion} />
        </section>

        {/* Elevator Pitch Quote Strip */}
        <section className="bg-[#FCE8ED] border border-[#E8D5A8] text-[#121212] rounded-3xl p-8 sm:p-12 text-center max-w-3xl mx-auto space-y-4 shadow-[0_4px_16px_rgba(240,90,126,0.04)]">
          <Quote className="w-8 h-8 text-[#F05A7E] mx-auto" />
          <p className="font-serif italic text-lg sm:text-2xl leading-relaxed text-[#121212]">{about.elevatorPitchQuote}</p>
        </section>

        {/* CTA Strip */}
        <section className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onExploreShop}
            className="px-8 py-3.5 bg-[#F05A7E] text-white text-xs font-bold uppercase tracking-wider rounded-full flex items-center gap-2 shadow-[0_4px_14px_rgba(240,90,126,0.25)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{about.primaryCtaText}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onNavigateSupport}
            className="px-8 py-3.5 bg-white border border-[#E8D5A8] text-[#121212] hover:text-[#F05A7E] hover:border-[#F05A7E] text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer"
          >
            {about.secondaryCtaText}
          </button>
        </section>
      </div>
    </div>
  );
};
