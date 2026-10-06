// [Glamik] 2026-10-06 — Beauty Consultant drawer, premium pass: luxe gradient
// header (layered gold ring avatar, gold-foil title, availability status),
// avatar-beside chat bubbles with soft layered shadows, warm stream backdrop,
// tactile pill chips, and a gold-foil send button. Updated 2026-10-06.
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  Send,
  ShoppingBag,
  Eye,
  ArrowRight,
  User,
  Bot,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';
import { Product, Shade, AssistantMessage } from '@glamirk/shared/types';
import { GLAMIRK_PRODUCTS } from '@glamirk/shared/data/products';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { ProductImage } from '../product/ProductImage';

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

export const BeautyAssistantDrawer: React.FC<BeautyAssistantDrawerProps> = ({
  isOpen,
  onClose,
  currentProductContext,
  hasCartItems,
  onOpenTryOn,
  onOpenShadeFinder,
  onAddToBag,
  onViewProduct,
}) => {
  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const lipstick = catalogProducts.find((p) => p.id === 'matte-liquid-lipstick-collection') || catalogProducts[0];
  const sindoor = catalogProducts.find((p) => p.id === 'luxury-sindoor-vermilion-crimson') || catalogProducts[1];
  const cleanser = catalogProducts.find((p) => p.id === 'balm-to-water-cleanser-50g') || catalogProducts[2];

  const getInitialMessage = (): AssistantMessage => {
    if (currentProductContext) {
      return {
        id: 'init-context',
        sender: 'assistant',
        text: `Welcome to your private Glamirk consultation. I notice you are exploring our ${currentProductContext.name}. Would you like assistance matching your undertone or exploring shade swatches?`,
        timestamp: 'Just now',
        suggestedPrompts: [
          'Find my lipstick shade',
          'Tell me about the ingredients',
          'How do I apply this?',
          'Try this shade on',
        ],
      };
    }

    if (hasCartItems) {
      return {
        id: 'init-cart',
        sender: 'assistant',
        text: 'Welcome to Glamirk. I can assist with shade pairing, complete-the-look rituals, or finding complementary formulations for your cart.',
        timestamp: 'Just now',
        suggestedPrompts: [
          'What goes well with my selection?',
          'Find my perfect lipstick shade',
          'Help me choose a cleanser',
          'Wedding makeup recommendations',
        ],
      };
    }

    return {
      id: 'init-default',
      sender: 'assistant',
      text: 'Good day. I am your Glamirk personal beauty consultant. How may I assist you with shades, formulations, or beauty rituals today?',
      timestamp: 'Just now',
      suggestedPrompts: [
        'Find my lipstick shade',
        'What should I wear for a wedding?',
        'Show me everyday looks',
        'Help me choose a cleanser',
        'Compare these shades',
      ],
    };
  };

  const [messages, setMessages] = useState<AssistantMessage[]>([getInitialMessage()]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMessages([getInitialMessage()]);
    }
  }, [isOpen, currentProductContext, hasCartItems]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Deterministic Luxury Beauty Rule Engine
  const generateAssistantResponse = (userQuery: string): AssistantMessage => {
    const query = userQuery.toLowerCase();

    if (query.includes('shade') || query.includes('find my shade') || query.includes('undertone') || query.includes('which shade')) {
      return {
        id: Date.now().toString(),
        sender: 'assistant',
        text: 'For Indian complexions, our Matte Liquid Lipstick is calibrated in four verified shades: Caramel (Warm Terracotta), Rose Red (Neutral Berry Rose), Ruby Desire (Cool Crimson Red), and Berry Chic (Deep Plum). Would you like to take our 60-second shade quiz or try them on virtually?',
        timestamp: 'Just now',
        recommendedProducts: [
          {
            product: lipstick,
            suggestedShade: lipstick.shades?.[0],
            reason: 'Caramel — Golden terracotta nude for warm daily elegance',
          },
          {
            product: lipstick,
            suggestedShade: lipstick.shades?.[2],
            reason: 'Ruby Desire — Regal crimson for high-impact presence',
          },
        ],
        actionPrompt: {
          label: 'START SHADE CONSULTATION',
          action: 'find-shade',
        },
        suggestedPrompts: ['Try on Caramel', 'Try on Ruby Desire', 'Take the shade quiz'],
      };
    }

    if (query.includes('wedding') || query.includes('party') || query.includes('festive') || query.includes('bride')) {
      return {
        id: Date.now().toString(),
        sender: 'assistant',
        text: 'For weddings and festive celebrations, we recommend our regal bridal pairing: Matte Liquid Lipstick in "Ruby Desire" (or "Berry Chic") accompanied by our ceremonial Luxury Sindoor in "Sindoor Crimson".',
        timestamp: 'Just now',
        recommendedProducts: [
          {
            product: lipstick,
            suggestedShade: lipstick.shades?.[2],
            reason: 'Ruby Desire — Rich, velvet transfer-proof red (₹349)',
          },
          {
            product: sindoor,
            suggestedShade: sindoor.shades?.[0],
            reason: 'Luxury Sindoor — Liquid vermilion with gold-foil cap (₹299)',
          },
        ],
        suggestedPrompts: ['Add wedding look to bag', 'Try on Ruby Desire', 'Show cleanser ritual'],
      };
    }

    if (query.includes('cleanse') || query.includes('cleanser') || query.includes('skin') || query.includes('balm')) {
      return {
        id: Date.now().toString(),
        sender: 'assistant',
        text: 'Our Balm To Water Cleanser transforms from an ultra-nourishing balm into a featherlight milky rinse. It dissolves waterproof matte pigments and ceremonial sindoor in one gentle massage without stripping moisture.',
        timestamp: 'Just now',
        recommendedProducts: [
          {
            product: cleanser,
            reason: 'Available in 30g Discovery Format (₹549) and 50g Vanity Ritual Jar (₹849)',
          },
        ],
        suggestedPrompts: ['How do I use the cleanser?', 'Add 50g Cleanser to bag', 'Show lipstick shades'],
      };
    }

    if (query.includes('everyday') || query.includes('office') || query.includes('natural') || query.includes('minimal')) {
      return {
        id: Date.now().toString(),
        sender: 'assistant',
        text: 'For effortless everyday beauty and professional polish, "Caramel" and "Rose Red" offer soft, velvety definition that stays transfer-proof all day.',
        timestamp: 'Just now',
        recommendedProducts: [
          {
            product: lipstick,
            suggestedShade: lipstick.shades?.[0],
            reason: 'Caramel — Refined warm terracotta beige',
          },
          {
            product: lipstick,
            suggestedShade: lipstick.shades?.[1],
            reason: 'Rose Red — Soft berry rosewood',
          },
        ],
        suggestedPrompts: ['Try Caramel on model', 'Start shade match', 'View ingredients'],
      };
    }

    if (query.includes('try on') || query.includes('camera') || query.includes('virtual')) {
      return {
        id: Date.now().toString(),
        sender: 'assistant',
        text: 'You can preview our liquid lipsticks instantly using your live camera, an uploaded photo, or our five curated Indian complexion model presets.',
        timestamp: 'Just now',
        actionPrompt: {
          label: 'LAUNCH VIRTUAL ATELIER',
          action: 'try-on',
          productId: lipstick.id,
        },
        suggestedPrompts: ['Open Virtual Try-On', 'Find my undertone', 'Show prices'],
      };
    }

    // Default polite consultation response with verified knowledge
    return {
      id: Date.now().toString(),
      sender: 'assistant',
      text: `I don’t have that specific information yet, but I am happy to assist you with our verified formulations: Matte Liquid Lipsticks (₹349), Ceremonial Luxury Sindoor (₹299), and Balm To Water Cleanser (₹549/₹849), or guide your personalized shade discovery.`,
      timestamp: 'Just now',
      suggestedPrompts: [
        'Find my lipstick shade',
        'Try on shades virtually',
        'Help with bridal makeup',
      ],
    };
  };

  const handleSendMessage = (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim()) return;

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0B0B0B]/60 backdrop-blur-xs">
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#FBF7F4] w-full max-w-lg h-full shadow-[0_0_60px_rgba(0,0,0,0.3)] flex flex-col justify-between border-l border-[#EADFE3] lg:rounded-l-3xl overflow-hidden"
      >
        {/* Header */}
        <div className="relative px-5 py-5 bg-gradient-to-br from-[#331420] via-[#1A1012] to-[#0E0809] text-[#FAF9F6] flex items-center justify-between shrink-0 overflow-hidden">
          {/* soft gold glows + double hairline */}
          <div aria-hidden="true" className="pointer-events-none absolute -top-12 -right-8 w-48 h-48 rounded-full bg-[#C9972B]/18 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 left-10 w-40 h-40 rounded-full bg-[#9B2D4F]/15 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C9972B]/60 to-transparent" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-[3px] left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#C9972B]/20 to-transparent" />

          <div className="relative flex items-center gap-3.5">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2B1016] to-[#0B0B0B] ring-1 ring-[#C9972B]/70 shadow-[0_0_18px_rgba(201,151,43,0.4)] flex items-center justify-center text-[#E3B84B]">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="absolute inset-0 rounded-full ring-1 ring-[#C9972B]/25 scale-[1.22]" aria-hidden="true" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#4ADE80] ring-2 ring-[#1A1012]" aria-hidden="true" />
            </div>
            <div>
              <span className="text-[9.5px] font-semibold tracking-[0.28em] uppercase text-[#C9972B] block">
                Glamirk Concierge
              </span>
              <h3 className="font-serif text-xl leading-tight text-[#FAF9F6] tracking-wide bg-gradient-to-r from-[#FFF3DF] to-[#E3B84B] bg-clip-text text-transparent">
                Beauty Consultant
              </h3>
              <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-[#B79A7E]">
                <span className="w-1 h-1 rounded-full bg-[#4ADE80]" /> Available for a private consultation
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="relative p-2 text-[#C9972B] hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            aria-label="Close assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-grow p-5 overflow-y-auto space-y-4 bg-gradient-to-b from-[#FDFAF8] via-[#FBF6F2] to-[#FAF3EF]">
          
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div className={`flex items-end gap-2.5 max-w-[92%] ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.sender !== 'user' && (
                  <span className="w-9 h-9 rounded-full shrink-0 bg-gradient-to-br from-[#2B1016] to-[#0B0B0B] ring-1 ring-[#C9972B]/50 flex items-center justify-center text-[#E3B84B] shadow-[0_3px_12px_rgba(201,151,43,0.3)]">
                    <Sparkles className="w-4 h-4" />
                  </span>
                )}
                <div
                  className={`min-w-0 px-4 py-3.5 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-br from-[#2B1016] to-[#120A0C] text-[#FAF9F6] rounded-2xl rounded-br-md shadow-[0_12px_28px_rgba(43,16,22,0.28)]'
                      : 'bg-white text-[#2A2024] border border-[#F2E6EA] rounded-2xl rounded-bl-md shadow-[0_12px_32px_rgba(43,16,22,0.09)]'
                  }`}
                >
                {msg.sender !== 'user' && (
                  <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#C9972B]">
                    <span className="w-1 h-1 rounded-full bg-[#C9972B]" /> Consultant
                  </span>
                )}
                <p>{msg.text}</p>

                {/* Recommended Product Cards inside Conversation */}
                {msg.recommendedProducts && msg.recommendedProducts.length > 0 && (
                  <div className="mt-3 space-y-2 pt-3 border-t border-[#EADFE3]">
                    {msg.recommendedProducts.map((rec, i) => (
                      <div
                        key={i}
                        className="bg-[#FBF7F4] p-3 rounded-xl border border-[#EADFE3] flex items-center justify-between gap-3 shadow-[0_2px_8px_rgba(43,16,22,0.04)]"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          {rec.suggestedShade ? (
                            <div
                              className="w-5 h-5 rounded-full border border-[#0B0B0B]/10 shrink-0 shadow-xs"
                              style={{ backgroundColor: rec.suggestedShade.hex }}
                            />
                          ) : (
                            <ProductImage
                              src={rec.product.images.primary}
                              alt={rec.product.name}
                              className="w-6 h-6 object-cover rounded-none shrink-0"
                            />
                          )}
                          <div className="truncate">
                            <span className="font-serif text-[11.5px] text-[#121212] block truncate font-medium">
                              {rec.product.name}
                            </span>
                            <span className="text-[10px] text-[#524C4C] block truncate">
                              {rec.reason || `₹${rec.product.price}`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {rec.suggestedShade && (
                            <button
                              onClick={() => {
                                onClose();
                                onOpenTryOn(rec.product, rec.suggestedShade);
                              }}
                              className="px-2.5 py-1.5 bg-white border border-[#EADFE3] rounded-full text-[#2B1016] text-[9.5px] uppercase font-bold tracking-wider hover:border-[#C9972B] hover:text-[#C9972B] transition-colors cursor-pointer"
                            >
                              Try On
                            </button>
                          )}
                          <button
                            onClick={() => {
                              onAddToBag(rec.product, rec.suggestedShade, undefined, 1);
                            }}
                            className="px-2.5 py-1.5 bg-gradient-to-br from-[#2B1016] to-[#120A0C] text-[#FAF9F6] rounded-full text-[9.5px] uppercase font-bold tracking-wider hover:from-[#3a1420] transition-colors cursor-pointer"
                          >
                            + Bag
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Direct Action Buttons */}
                {msg.actionPrompt && (
                  <div className="mt-3 pt-2">
                    <button
                      onClick={() => {
                        onClose();
                        if (msg.actionPrompt?.action === 'try-on') {
                          onOpenTryOn(lipstick);
                        } else if (msg.actionPrompt?.action === 'find-shade') {
                          onOpenShadeFinder();
                        }
                      }}
                      className="w-full py-2.5 bg-gradient-to-br from-[#2B1016] to-[#120A0C] text-[#FAF9F6] rounded-xl text-[10.5px] uppercase tracking-widest font-semibold flex items-center justify-center gap-1.5 shadow-[0_4px_14px_rgba(43,16,22,0.2)] cursor-pointer hover:from-[#3a1420] transition-colors"
                    >
                      <Sparkles className="w-3 h-3 text-[#E3B84B]" />
                      <span>{msg.actionPrompt.label}</span>
                    </button>
                  </div>
                )}
                </div>
              </div>

              {/* Quick Prompts below assistant replies */}
              {msg.suggestedPrompts && (
                <div className="mt-2.5 flex flex-wrap gap-2 max-w-[92%] pl-11">
                  {msg.suggestedPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(prompt)}
                      className="px-3.5 py-1.5 bg-gradient-to-b from-white to-[#FDF5F7] border border-[#EADFE3] rounded-full text-[11px] text-[#5A4A50] hover:border-[#C9972B] hover:text-[#2B1016] hover:shadow-[0_4px_12px_rgba(201,151,43,0.16)] hover:-translate-y-0.5 transition-all cursor-pointer"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-end gap-2.5">
              <span className="w-9 h-9 rounded-full shrink-0 bg-gradient-to-br from-[#2B1016] to-[#0B0B0B] ring-1 ring-[#C9972B]/50 flex items-center justify-center text-[#E3B84B] shadow-[0_3px_12px_rgba(201,151,43,0.3)]">
                <Sparkles className="w-4 h-4" />
              </span>
              <div className="flex items-center gap-1.5 px-4 py-3.5 bg-white border border-[#F2E6EA] rounded-2xl rounded-bl-md shadow-[0_12px_32px_rgba(43,16,22,0.09)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C9972B] animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#C9972B] animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#C9972B] animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-white/80 backdrop-blur border-t border-[#EADFE3]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2.5"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask about shades, undertones, or rituals..."
              className="flex-grow px-5 py-3.5 bg-[#FBF7F4] border border-[#EADFE3] rounded-full text-xs text-[#2A2024] placeholder-[#9A8A90] focus:outline-none focus:border-[#C9972B] focus:ring-2 focus:ring-[#C9972B]/15 transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="relative w-12 h-12 rounded-full bg-gradient-to-br from-[#E3B84B] via-[#C9972B] to-[#A86E1A] text-white flex items-center justify-center ring-1 ring-[#E3B84B]/50 shadow-[0_8px_20px_rgba(201,151,43,0.4)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 disabled:shadow-none transition-all cursor-pointer shrink-0 overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-white/20 before:rounded-t-full"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="flex items-center justify-center gap-1.5 text-[10px] text-[#9A8A90] text-center mt-2.5 font-light tracking-wide">
            <ShieldCheck className="w-3 h-3 text-[#C9972B]" />
            Calibrated with verified formulas &amp; shade intelligence.
          </p>
        </div>

      </motion.div>
    </div>
  );
};
