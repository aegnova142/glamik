import React, { useState } from 'react';
import { SUPPORT_FAQS } from '../../data/commerce';
import { SupportFaq } from '../../types';
import {
  Search,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Mail,
  Phone,
  ArrowLeft,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  Truck,
  HelpCircle,
} from 'lucide-react';
import { motion } from 'motion/react';

interface SupportCenterPageProps {
  onBack: () => void;
  onOpenAssistant: () => void;
  onNavigateMyGlamTab?: (tab: 'RETURNS' | 'ORDERS') => void;
}

export const SupportCenterPage: React.FC<SupportCenterPageProps> = ({
  onBack,
  onOpenAssistant,
  onNavigateMyGlamTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [openFaqId, setOpenFaqId] = useState<string | null>('faq-1');

  const categories = [
    'ALL',
    'ORDERS',
    'DELIVERY',
    'PAYMENTS',
    'RETURNS',
    'PRODUCTS',
    'FIND MY SHADE',
    'ACCOUNT',
  ];

  const filteredFaqs = SUPPORT_FAQS.filter((faq) => {
    const matchesCategory = selectedCategory === 'ALL' || faq.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleFaq = (id: string) => {
    setOpenFaqId(openFaqId === id ? null : id);
  };

  return (
    <div className="bg-[#FAF9F6] min-h-screen py-10 sm:py-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Navigation Back */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-[#6B6B6B] hover:text-[#121212] font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>
        </div>

        {/* Header */}
        <div className="text-center space-y-3 mb-10 max-w-2xl mx-auto">
          <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
            GLAMIRK CLIENT SERVICE CONCIERGE
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#121212]">
            HOW CAN WE HELP?
          </h1>
          <p className="text-xs sm:text-sm text-[#6B6B6B] font-light leading-relaxed">
            Direct assistance, delivery timelines, shade pairing guidance, and returns for your Glamirk creations.
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-10">
          <div className="relative">
            <Search className="w-5 h-5 text-[#6B6B6B] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your question (e.g. 'Where is my order?', 'How to find my shade?')..."
              className="w-full pl-12 pr-4 py-4 text-xs sm:text-sm bg-white border border-[#E8D5A8] focus:border-[#0B0B0B] focus:outline-hidden shadow-xs"
            />
          </div>
        </div>

        {/* Contact Concierge Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {/* Card 1: AI Concierge */}
          <div className="p-6 bg-white border border-[#E8D5A8] space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#0B0B0B] text-[#C9972B] flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-base text-[#121212]">
                AI Beauty & Order Concierge
              </h3>
              <p className="text-xs text-[#6B6B6B] leading-relaxed">
                Instant shade advice, formulation matching, and order status in real time.
              </p>
            </div>
            <button
              onClick={onOpenAssistant}
              className="w-full py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] transition-colors cursor-pointer"
            >
              CHAT NOW
            </button>
          </div>

          {/* Card 2: WhatsApp / Email */}
          <div className="p-6 bg-white border border-[#E8D5A8] space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FAF9F6] border border-[#E8D5A8] text-[#121212] flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-base text-[#121212]">
                Email Atelier Concierge
              </h3>
              <p className="text-xs text-[#6B6B6B] leading-relaxed">
                Written inquiries, bespoke bridal pairings, and order support answered in 2 hours.
              </p>
            </div>
            <a
              href="mailto:concierge@glamirk.com"
              className="w-full py-2.5 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors text-center block"
            >
              concierge@glamirk.com
            </a>
          </div>

          {/* Card 3: Dedicated Support Line */}
          <div className="p-6 bg-white border border-[#E8D5A8] space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FAF9F6] border border-[#E8D5A8] text-[#121212] flex items-center justify-center">
                <Phone className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-base text-[#121212]">
                Atelier Client Line
              </h3>
              <p className="text-xs text-[#6B6B6B] leading-relaxed">
                Mon - Sat, 10:00 AM - 7:00 PM IST across all Indian regions.
              </p>
            </div>
            <a
              href="tel:18002094526"
              className="w-full py-2.5 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors text-center block"
            >
              1800-GLAMIRK
            </a>
          </div>
        </div>

        {/* Category Pills */}
        <div className="mb-8 space-y-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6B6B6B] block">
            BROWSE BY SUBJECT:
          </span>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 text-xs font-semibold tracking-wider uppercase border transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#0B0B0B] text-white border-[#0B0B0B]'
                    : 'bg-white text-[#6B6B6B] border-[#E8D5A8] hover:border-[#0B0B0B]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ List */}
        <div className="space-y-3">
          {filteredFaqs.length === 0 ? (
            <div className="p-8 bg-white border border-[#E8D5A8] text-center space-y-2">
              <HelpCircle className="w-8 h-8 text-[#C9972B] mx-auto" />
              <p className="font-serif text-base text-[#121212]">
                No answers matched "{searchQuery}".
              </p>
              <p className="text-xs text-[#6B6B6B]">
                Try searching for 'order', 'delivery', 'shade', or tap "Chat Now" to speak with our concierge.
              </p>
            </div>
          ) : (
            filteredFaqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div
                  key={faq.id}
                  className="bg-white border border-[#E8D5A8] transition-all"
                >
                  <button
                    onClick={() => toggleFaq(faq.id)}
                    className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div className="space-y-1">
                      <span className="text-[9.5px] uppercase tracking-widest font-semibold text-[#C9972B] bg-[#C9972B]/10 px-2 py-0.5">
                        {faq.category}
                      </span>
                      <h4 className="font-serif text-base sm:text-lg text-[#121212]">
                        {faq.question}
                      </h4>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5 text-[#121212] flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-[#6B6B6B] flex-shrink-0" />
                    )}
                  </button>

                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="px-5 sm:px-6 pb-6 pt-2 text-xs sm:text-sm text-[#6B6B6B] font-light leading-relaxed border-t border-[#FAF9F6]"
                    >
                      <p>{faq.answer}</p>
                    </motion.div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
};
