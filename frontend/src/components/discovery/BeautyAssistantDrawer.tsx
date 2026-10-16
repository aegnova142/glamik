import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, Send, ChevronRight, Gem, Droplets, Scale, Eye, ShoppingBag } from 'lucide-react';
import { Product, Shade, AssistantMessage } from '@glamirk/shared/types';
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { selectableShades } from '@glamirk/shared/utils/productVariant';
import { ProductImage } from '../product/ProductImage';
import { TRY_ON_ENABLED } from '../../utils/features';

interface BeautyAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentProductContext?: Product | null;
  hasCartItems?: boolean;
  onOpenTryOn: (product: Product, shade?: Shade) => void;
  onOpenShadeFinder: () => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onViewProduct: (product: Product) => void;
}

/** Outline lips, matching lucide's 1.5 stroke — lucide has no lips icon. */
const LipsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M2 12c2.5-3.5 5-5 7-5 1.2 0 2.2.7 3 1.5.8-.8 1.8-1.5 3-1.5 2 0 4.5 1.5 7 5-2.5 3.5-6 5.5-10 5.5S4.5 15.5 2 12Z" />
    <path d="M2 12c3 .8 6.5 1.2 10 1.2s7-.4 10-1.2" />
  </svg>
);

/** Card treatment for the prompts the engine below actually answers. */
const PROMPT_META: Record<string, { icon: React.FC<{ className?: string }>; hint: string }> = {
  'Find my lipstick shade': { icon: LipsIcon, hint: 'Explore shades by undertone' },
  'What should I wear for a wedding?': { icon: Gem, hint: 'Looks for your big days' },
  'Show me everyday looks': { icon: Sparkles, hint: 'Easy shades for every day' },
  'Help me choose a cleanser': { icon: Droplets, hint: 'Find the right size for you' },
  'Compare these shades': { icon: Scale, hint: 'Side by side, by undertone' },
  'Try shades on virtually': { icon: Eye, hint: 'Preview on camera or a model' },
};

/** TRY-ON-PAUSED: drops try-on suggestions while the feature is switched off. */
const withoutTryOn = (prompts?: string[]) => (TRY_ON_ENABLED ? prompts : prompts?.filter((p) => !/\btry\b/i.test(p)));

const formatPrice = (p: Product) => `₹${p.price.toLocaleString('en-IN')}`;
const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
/** First shade whose name matches, else the one at `fallback`. */
const pickShade = (shades: Shade[], pattern: RegExp, fallback = 0) =>
  shades.find((s) => pattern.test(s.name)) || shades[fallback] || shades[0];

export const BeautyAssistantDrawer: React.FC<BeautyAssistantDrawerProps> = ({
  isOpen,
  onClose,
  currentProductContext,
  hasCartItems,
  onOpenTryOn,
  onAddToBag,
  onViewProduct,
}) => {
  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  // Every name, shade and price the consultant quotes comes from the live
  // catalogue, so it can never drift from what the shop actually sells.
  const lipstick = catalogProducts.find((p) => /lipstick/i.test(p.name)) || catalogProducts[0];
  const sindoor = catalogProducts.find((p) => /sindoor/i.test(p.name));
  const cleansers = catalogProducts.filter((p) => /cleanser/i.test(p.name));
  const lipShades = lipstick ? selectableShades(lipstick) : [];
  const tryOnProduct =
    currentProductContext?.shades?.length && currentProductContext.enableTryOn !== false ? currentProductContext : lipstick;

  const getInitialMessage = (): AssistantMessage => {
    const base = {
      id: 'init',
      sender: 'assistant' as const,
      timestamp: 'Just now',
      suggestedPrompts: [
        'Find my lipstick shade',
        'What should I wear for a wedding?',
        'Show me everyday looks',
        'Help me choose a cleanser',
        'Compare these shades',
      ],
    };
    if (currentProductContext) {
      return {
        ...base,
        text: `Welcome to your private Glamirk consultation. I see you are exploring ${currentProductContext.name}. Shall we look at its shades by undertone${TRY_ON_ENABLED ? ', or try one on' : ''}?`,
        // TRY-ON-PAUSED
        suggestedPrompts: withoutTryOn(['Find my lipstick shade', 'Compare these shades', 'Try shades on virtually', 'Show me everyday looks']),
      };
    }
    if (hasCartItems) {
      return {
        ...base,
        text: 'Welcome back to Glamirk. I can help with shade pairing, occasion looks, or choosing a cleanser to go with your bag.',
      };
    }
    return {
      ...base,
      text: 'Good day! I am your Glamirk personal beauty consultant. How may I assist you with shades, formulations, or beauty rituals today?',
    };
  };

  const [messages, setMessages] = useState<AssistantMessage[]>([getInitialMessage()]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMessages([getInitialMessage()]);
    }
  }, [isOpen, currentProductContext, hasCartItems]);

  // Follow the conversation once it starts; the welcome view opens at the top.
  useEffect(() => {
    if (messages.length > 1 || isTyping) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isTyping]);

  // Escape closes; focus moves into the panel on open and back to whatever
  // opened it (the floating trigger) on close. onClose is read through a ref:
  // the parent passes a new function every render, which must not re-run this.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [isOpen]);

  // Deterministic rule engine — keyword-matched replies built from catalogue data.
  const generateAssistantResponse = (userQuery: string): AssistantMessage => {
    const query = userQuery.toLowerCase();
    const reply = (rest: Omit<AssistantMessage, 'id' | 'sender' | 'timestamp'>): AssistantMessage => ({
      id: Date.now().toString(),
      sender: 'assistant',
      timestamp: 'Just now',
      ...rest,
      // TRY-ON-PAUSED: no try-on button or try-on follow-ups while it's off.
      ...(TRY_ON_ENABLED ? {} : { actionPrompt: undefined, suggestedPrompts: withoutTryOn(rest.suggestedPrompts) }),
    });
    const shadeRec = (shade: Shade) => ({
      product: lipstick,
      suggestedShade: shade,
      reason: `${shade.name} — ${shade.undertone} undertone${shade.shortDescription ? ` · ${shade.shortDescription}` : ''}`,
    });

    if (query.includes('compare') && lipShades.length) {
      return reply({
        text: `Here are the ${lipShades.length} shades of ${lipstick.name} side by side, each labelled with its undertone.${TRY_ON_ENABLED ? ' Try any of them on before you choose.' : ''}`,
        recommendedProducts: lipShades.slice(0, 6).map(shadeRec),
        suggestedPrompts: ['Try shades on virtually', 'Show me everyday looks', 'What should I wear for a wedding?'],
      });
    }

    if (TRY_ON_ENABLED && (query.includes('try on') || query.includes('try shades') || query.includes('camera') || query.includes('virtual'))) {
      return reply({
        text: `You can preview ${tryOnProduct.name} on your live camera, an uploaded photo, or one of our model presets.`,
        actionPrompt: { label: 'OPEN VIRTUAL TRY-ON', action: 'try-on', productId: tryOnProduct.id },
        suggestedPrompts: ['Compare these shades', 'Find my lipstick shade'],
      });
    }

    if ((query.includes('shade') || query.includes('undertone')) && lipShades.length) {
      const warm = lipShades.find((s) => /warm/i.test(s.undertone));
      const cool = lipShades.find((s) => /cool/i.test(s.undertone));
      const picks = [warm, cool].filter((s): s is Shade => !!s);
      return reply({
        text: `${lipstick.name} comes in ${listNames(lipShades.map((s) => s.name))}. Each shade is labelled with its undertone — choose the one closest to yours${TRY_ON_ENABLED ? ', or try them on first' : ''}.`,
        recommendedProducts: (picks.length ? picks : lipShades.slice(0, 2)).map(shadeRec),
        actionPrompt: { label: 'TRY SHADES ON', action: 'try-on', productId: lipstick.id },
        suggestedPrompts: ['Compare these shades', 'Show me everyday looks', 'What should I wear for a wedding?'],
      });
    }

    if (query.includes('wedding') || query.includes('party') || query.includes('festive') || query.includes('bride')) {
      // A true red first; failing that, the deepest-sounding shade.
      const bold = lipShades.find((s) => /crimson|scarlet|ruby|red/i.test(s.name)) || pickShade(lipShades, /spice|berry|plum|wine/i, 2);
      const sindoorShade = sindoor ? selectableShades(sindoor)[0] : undefined;
      return reply({
        text: `For weddings and festive celebrations, pair a statement lip${bold ? ` such as ${bold.name}` : ''}${sindoor ? ` with our ${sindoor.name}` : ''}.`,
        recommendedProducts: [
          ...(bold ? [{ product: lipstick, suggestedShade: bold, reason: `${bold.name} — ${formatPrice(lipstick)}` }] : []),
          ...(sindoor ? [{ product: sindoor, suggestedShade: sindoorShade, reason: `${sindoorShade ? `${sindoorShade.name} — ` : ''}${formatPrice(sindoor)}` }] : []),
        ],
        suggestedPrompts: ['Try shades on virtually', 'Help me choose a cleanser', 'Show me everyday looks'],
      });
    }

    if ((query.includes('cleanse') || query.includes('skin') || query.includes('balm')) && cleansers.length) {
      return reply({
        text: `Our ${cleansers[0].name.replace(/\s*[—-]\s*\d+\s*g$/i, '')} melts from a balm into a milky rinse to lift makeup${cleansers.length > 1 ? `. It comes in ${listNames(cleansers.map((c) => c.name.match(/\d+\s*g/i)?.[0] || c.name))}` : ''}.`,
        recommendedProducts: cleansers.map((c) => ({ product: c, reason: `${c.subtitle || c.name} — ${formatPrice(c)}` })),
        suggestedPrompts: ['Find my lipstick shade', 'What should I wear for a wedding?'],
      });
    }

    if (query.includes('everyday') || query.includes('office') || query.includes('natural') || query.includes('minimal')) {
      const soft = [pickShade(lipShades, /nude|caramel|beige|suede/i, 0), pickShade(lipShades, /rose|pink|petal|mauve/i, 1)]
        .filter((s, i, all): s is Shade => !!s && all.findIndex((x) => x?.id === s.id) === i);
      return reply({
        text: `For effortless everyday wear, softer shades work beautifully${soft.length ? ` — try ${listNames(soft.map((s) => s.name))}` : ''}.`,
        recommendedProducts: soft.map(shadeRec),
        suggestedPrompts: ['Try shades on virtually', 'Compare these shades', 'Help me choose a cleanser'],
      });
    }

    const lineup = [lipstick, sindoor, ...cleansers].filter((p): p is Product => !!p);
    return reply({
      text: `I don’t have that specific information yet. I can help with ${listNames(lineup.map((p) => `${p.name} (${formatPrice(p)})`))}, or guide you to a shade.`,
      suggestedPrompts: ['Find my lipstick shade', 'Try shades on virtually', 'What should I wear for a wedding?'],
    });
  };

  const handleSendMessage = (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim() || isTyping) return;

    const userMsg: AssistantMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: query.trim(),
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      const reply = generateAssistantResponse(query);
      setMessages((prev) => [...prev, reply]);
      setIsTyping(false);
    }, 800);
  };

  if (!isOpen) return null;

  const isWelcomeOnly = messages.length === 1;

  return (
    <div className="fixed inset-0 z-50">
      {/* Light veil: the page stays visible behind the concierge. */}
      <button
        type="button"
        aria-label="Close assistant"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-[#0B0B0B]/20 backdrop-blur-[3px] cursor-default"
      />
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="concierge-title"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 sm:inset-auto sm:right-5 sm:bottom-[92px] sm:w-[460px] lg:w-[540px] sm:h-[min(720px,calc(100dvh-120px))] flex flex-col bg-[#FFFDF9] sm:rounded-2xl sm:border border-[#E8D2AA] shadow-[0_24px_60px_-20px_rgba(18,18,18,0.45)] overflow-hidden focus:outline-none"
      >
        {/* Header */}
        <div className="shrink-0 bg-[#101010] px-5 sm:px-6 py-4 sm:py-5 flex items-center gap-4">
          <span className="grid place-items-center w-12 h-12 sm:w-[60px] sm:h-[60px] rounded-full border border-[#D6AF65]/80 text-[#D6AF65] shrink-0">
            <Sparkles className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={1.25} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] sm:text-[11px] font-semibold tracking-[0.24em] uppercase text-[#D6AF65]">Glamirk Concierge</p>
            <h2 id="concierge-title" className="font-['Cormorant_Garamond',Georgia,serif] !font-semibold text-[17px] min-[400px]:text-[19px] sm:text-[24px] leading-tight whitespace-nowrap tracking-[0.02em] text-[#FAF9F6] uppercase">
              Beauty Consultant
            </h2>
            <p className="text-[11px] sm:text-[12px] text-[#D6AF65]/90 truncate">Your personal guide to beauty, shades &amp; rituals</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            className="grid place-items-center w-10 h-10 shrink-0 rounded-full text-[#D6AF65] hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#D6AF65]"
          >
            <X className="w-6 h-6" strokeWidth={1.5} />
          </button>
        </div>

        {/* Conversation */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-5 pb-3 space-y-4" aria-live="polite" aria-busy={isTyping}>
          {messages.map((msg, index) => {
            const isUser = msg.sender === 'user';
            const isWelcome = index === 0 && !isUser;
            return (
              <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={
                    isUser
                      ? 'max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-[#101010] text-[#FAF9F6] text-[14px] leading-relaxed'
                      : `${isWelcome ? 'w-full flex gap-4 items-start' : 'max-w-[92%]'} px-4 sm:px-5 py-4 rounded-2xl ${isWelcome ? '' : 'rounded-bl-md'} bg-[#FBEFEC] border border-[#F1D9D2] text-[#211E1C]`
                  }
                >
                  {isWelcome && (
                    <span className="grid place-items-center w-11 h-11 shrink-0 rounded-full bg-white text-[#F4517D]">
                      <Sparkles className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className={isWelcome ? 'text-[15px] sm:text-[17px] leading-[1.5]' : 'text-[14px] leading-relaxed'}>{msg.text}</p>

                    {/* Recommended products */}
                    {msg.recommendedProducts && msg.recommendedProducts.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {msg.recommendedProducts.map((rec, i) => (
                          <li key={i} className="bg-white rounded-xl border border-[#EADBC2] p-2.5 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onViewProduct(rec.product);
                              }}
                              className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-[#F4517D]"
                            >
                              {rec.suggestedShade ? (
                                <span className="w-8 h-8 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: rec.suggestedShade.hex }} aria-hidden="true" />
                              ) : (
                                <ProductImage preset="thumb" src={rec.product.images.primary} alt="" className="w-8 h-8 object-cover rounded-md shrink-0" />
                              )}
                              <span className="min-w-0">
                                <span className="block text-[13px] font-medium text-[#211E1C] truncate">{rec.product.name}</span>
                                <span className="block text-[11.5px] text-[#746D68] truncate">{rec.reason || formatPrice(rec.product)}</span>
                              </span>
                            </button>
                            <span className="flex items-center gap-1.5 shrink-0">
                              {/* TRY-ON-PAUSED */}
                              {TRY_ON_ENABLED && rec.suggestedShade && rec.product.enableTryOn !== false && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onOpenTryOn(rec.product, rec.suggestedShade);
                                  }}
                                  className="h-8 px-2.5 rounded-full border border-[#E8D2AA] text-[10.5px] font-semibold uppercase tracking-wider text-[#211E1C] hover:border-[#F4517D] hover:text-[#F4517D] transition-colors cursor-pointer"
                                >
                                  Try on
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onAddToBag(rec.product, rec.suggestedShade, undefined, 1)}
                                aria-label={`Add ${rec.product.name}${rec.suggestedShade ? ` in ${rec.suggestedShade.name}` : ''} to bag`}
                                className="h-8 px-2.5 rounded-full bg-[#F4517D] hover:bg-[#E91E59] text-white text-[10.5px] font-semibold uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" /> Bag
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Direct action */}
                    {msg.actionPrompt && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = catalogProducts.find((p) => p.id === msg.actionPrompt?.productId) || tryOnProduct;
                          onClose();
                          onOpenTryOn(target);
                        }}
                        className="mt-3 w-full h-10 rounded-full bg-[#101010] text-[#FAF9F6] text-[11px] uppercase tracking-[0.18em] font-semibold flex items-center justify-center gap-2 hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#D6AF65]" aria-hidden="true" />
                        {msg.actionPrompt.label}
                      </button>
                    )}
                  </div>
                </div>

                {/* Suggestions: cards under the welcome, chips after replies */}
                {msg.suggestedPrompts && msg.suggestedPrompts.length > 0 && (
                  isWelcome && isWelcomeOnly ? (
                    <div className="mt-4 w-full grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                      {msg.suggestedPrompts.map((prompt) => {
                        const meta = PROMPT_META[prompt];
                        const Icon = meta?.icon || Sparkles;
                        return (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => handleSendMessage(prompt)}
                            className="group flex items-center gap-3 p-3.5 sm:p-4 text-left rounded-xl bg-[#FFFDF9] border border-[#E8D2AA] hover:border-[#F4517D] hover:bg-[#FFF7F5] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F4517D]"
                          >
                            <Icon className="w-8 h-8 shrink-0 text-[#C9972B]" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13.5px] sm:text-[14px] font-medium leading-snug text-[#211E1C]">{prompt}</span>
                              {meta && <span className="block mt-1 text-[11.5px] leading-snug text-[#746D68]">{meta.hint}</span>}
                            </span>
                            <ChevronRight className="w-4 h-4 shrink-0 text-[#F4517D] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    !isUser && index === messages.length - 1 && (
                      <div className="mt-2 flex flex-wrap gap-2 max-w-full">
                        {msg.suggestedPrompts.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => handleSendMessage(prompt)}
                            className="px-3 py-1.5 rounded-full bg-white border border-[#E8D2AA] text-[12px] text-[#211E1C] hover:border-[#F4517D] hover:text-[#F4517D] transition-colors cursor-pointer"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )
                  )
                )}
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-md bg-[#FBEFEC] border border-[#F1D9D2] w-fit" role="status" aria-label="Consultant is typing">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9972B] motion-safe:animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9972B] motion-safe:animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9972B] motion-safe:animate-bounce [animation-delay:0.4s]" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="shrink-0 px-4 sm:px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
          <p className="flex items-center gap-4 text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B]" aria-hidden="true">
            <span className="flex-1 h-px bg-[#E8D2AA]" /> Or ask me anything <span className="flex-1 h-px bg-[#E8D2AA]" />
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="mt-3 flex items-center gap-2.5"
          >
            <label htmlFor="concierge-input" className="sr-only">Message the beauty consultant</label>
            <input
              id="concierge-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask about shades, undertones, or rituals..."
              autoComplete="off"
              className="flex-1 min-w-0 h-[52px] px-5 rounded-xl bg-white border border-[#E8D2AA] text-[14px] text-[#211E1C] placeholder-[#9A928C] focus:outline-none focus:border-[#F4517D] focus:ring-2 focus:ring-[#F4517D]/15 transition-colors"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              aria-label="Send message"
              className="grid place-items-center w-[52px] h-[52px] shrink-0 rounded-full bg-[#F4517D] hover:bg-[#E91E59] text-white shadow-[0_8px_20px_-8px_rgba(244,81,125,0.8)] disabled:opacity-45 disabled:shadow-none transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </form>
          <p className="mt-2.5 text-[11px] text-center text-[#746D68]">
            Personalised guidance, grounded in Glamirk product information.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
