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
} from 'lucide-react';
import { Product, Shade, AssistantMessage } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';

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
  const lipstick = GLAMIRK_PRODUCTS.find((p) => p.id === 'matte-liquid-lipstick-collection') || GLAMIRK_PRODUCTS[0];
  const sindoor = GLAMIRK_PRODUCTS.find((p) => p.id === 'luxury-sindoor-vermilion-crimson') || GLAMIRK_PRODUCTS[1];
  const cleanser = GLAMIRK_PRODUCTS.find((p) => p.id === 'balm-to-water-cleanser-50g') || GLAMIRK_PRODUCTS[2];

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
        className="bg-[#FAF9F6] w-full max-w-lg h-full shadow-2xl flex flex-col justify-between border-l border-[#E8D5A8]"
      >
        {/* Header */}
        <div className="p-5 bg-[#0B0B0B] text-[#FAF9F6] border-b border-[#0B0B0B] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#0B0B0B] border border-[#C9972B]/50 flex items-center justify-center text-[#C9972B]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B] block">
                GLAMIRK CONCIERGE
              </span>
              <h3 className="font-serif text-base text-[#FAF9F6]">
                BEAUTY CONSULTANT
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[#C9972B] hover:text-white hover:bg-[#0B0B0B] rounded-full transition-colors cursor-pointer"
            aria-label="Close assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-grow p-5 overflow-y-auto space-y-4">
          
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[88%] p-4 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#0B0B0B] text-[#FAF9F6] border border-[#0B0B0B]'
                    : 'bg-[#FAF9F6] text-[#121212] border border-[#E8D5A8]'
                }`}
              >
                <p>{msg.text}</p>

                {/* Recommended Product Cards inside Conversation */}
                {msg.recommendedProducts && msg.recommendedProducts.length > 0 && (
                  <div className="mt-3 space-y-2 pt-2 border-t border-[#E8D5A8]">
                    {msg.recommendedProducts.map((rec, i) => (
                      <div
                        key={i}
                        className="bg-[#FAF9F6] p-3 border border-[#E8D5A8] flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          {rec.suggestedShade ? (
                            <div
                              className="w-5 h-5 rounded-full border border-[#0B0B0B]/10 shrink-0 shadow-xs"
                              style={{ backgroundColor: rec.suggestedShade.hex }}
                            />
                          ) : (
                            <img
                              src={rec.product.images.primary}
                              alt={rec.product.name}
                              className="w-6 h-6 object-cover rounded-none shrink-0"
                            />
                          )}
                          <div className="truncate">
                            <span className="font-serif text-[11.5px] text-[#121212] block truncate font-medium">
                              {rec.product.name}
                            </span>
                            <span className="text-[10px] text-[#6B6B6B] block truncate">
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
                              className="px-2 py-1 bg-[#FAF9F6] border border-[#E8D5A8] text-[#121212] text-[9.5px] uppercase font-bold tracking-wider hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer"
                            >
                              Try On
                            </button>
                          )}
                          <button
                            onClick={() => {
                              onAddToBag(rec.product, rec.suggestedShade, undefined, 1);
                            }}
                            className="px-2 py-1 bg-[#0B0B0B] text-[#FAF9F6] text-[9.5px] uppercase font-bold tracking-wider hover:bg-[#0B0B0B] transition-colors cursor-pointer"
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
                      className="w-full py-2 bg-[#0B0B0B] text-[#FAF9F6] text-[10.5px] uppercase tracking-widest font-semibold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer hover:bg-[#0B0B0B]"
                    >
                      <Sparkles className="w-3 h-3 text-[#C9972B]" />
                      <span>{msg.actionPrompt.label}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Prompts below assistant replies */}
              {msg.suggestedPrompts && (
                <div className="mt-2 flex flex-wrap gap-1.5 max-w-[90%]">
                  {msg.suggestedPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(prompt)}
                      className="px-2.5 py-1 bg-[#FAF9F6] border border-[#E8D5A8] text-[10px] text-[#6B6B6B] hover:border-[#0B0B0B] hover:text-[#121212] transition-colors cursor-pointer"
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
            <div className="flex items-center gap-2 p-3 bg-[#FAF9F6] border border-[#E8D5A8] w-24">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9972B] animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9972B] animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9972B] animate-bounce [animation-delay:0.4s]" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-[#FAF9F6] border-t border-[#E8D5A8]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask about shades, undertones, or rituals..."
              className="flex-grow px-4 py-3 bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#121212] placeholder-[#6B6B6B] focus:outline-none focus:border-[#0B0B0B] transition-colors"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-3 bg-[#0B0B0B] text-[#FAF9F6] hover:bg-[#0B0B0B] disabled:opacity-40 transition-colors cursor-pointer shrink-0"
              aria-label="Send message"
            >
              <Send className="w-4 h-4 text-[#C9972B]" />
            </button>
          </form>
          <p className="text-[10px] text-[#6B6B6B] text-center mt-2 font-light">
            Glamirk Consultant calibrated with verified formulas & shade intelligence.
          </p>
        </div>

      </motion.div>
    </div>
  );
};
