import React from 'react';
import { X, Sparkles, Mail, Phone } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

interface ConciergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAssistant: () => void;
}

export const ConciergeModal: React.FC<ConciergeModalProps> = ({ isOpen, onClose, onOpenAssistant }) => {
  const { footer } = useCMS();

  if (!isOpen) return null;

  const contactEmail = footer?.contactEmail || 'concierge@glamirk.com';
  const contactPhone = footer?.contactPhone || '+91 800 452 6475';
  const telHref = `tel:${contactPhone.replace(/[^\d+]/g, '')}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B0B0B]/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#FAF9F6] border border-[#E8D5A8] shadow-2xl p-8 sm:p-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-[#6B6B6B] hover:text-[#121212] transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2 mb-8">
          <h2 className="font-serif text-2xl sm:text-3xl text-[#121212]">Concierge Services</h2>
          <div className="flex items-center justify-center gap-2 text-[#C9972B]">
            <span className="w-8 h-px bg-[#E8D5A8]" />
            <Sparkles className="w-3.5 h-3.5" />
            <span className="w-8 h-px bg-[#E8D5A8]" />
          </div>
          <p className="text-xs sm:text-sm text-[#6B6B6B] font-light max-w-md mx-auto leading-relaxed">
            Here to help you with personalized beauty advice, orders, and everything in between.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 bg-white border border-[#E8D5A8] space-y-3 flex flex-col justify-between text-center items-center">
            <div className="space-y-2 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-[#0B0B0B] text-[#C9972B] flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="font-serif text-sm text-[#121212]">AI Beauty & Order Concierge</h3>
              <p className="text-[11px] text-[#6B6B6B] leading-relaxed">
                Instant shade advice, formulation matching, and order status in real time.
              </p>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenAssistant();
              }}
              className="w-full py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-[10.5px] font-semibold tracking-wider uppercase hover:bg-[#171717] transition-colors cursor-pointer"
            >
              CHAT NOW
            </button>
          </div>

          <div className="p-5 bg-white border border-[#E8D5A8] space-y-3 flex flex-col justify-between text-center items-center">
            <div className="space-y-2 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-[#FAF9F6] border border-[#E8D5A8] text-[#121212] flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
              <h3 className="font-serif text-sm text-[#121212]">Email Atelier Concierge</h3>
              <p className="text-[11px] text-[#6B6B6B] leading-relaxed">
                Written inquiries, bespoke bridal pairings, and order support answered in 2 hours.
              </p>
            </div>
            <a
              href={`mailto:${contactEmail}`}
              className="w-full py-2.5 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-[10.5px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors text-center block break-all"
            >
              {contactEmail}
            </a>
          </div>

          <div className="p-5 bg-white border border-[#E8D5A8] space-y-3 flex flex-col justify-between text-center items-center">
            <div className="space-y-2 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-[#FAF9F6] border border-[#E8D5A8] text-[#121212] flex items-center justify-center">
                <Phone className="w-4 h-4" />
              </div>
              <h3 className="font-serif text-sm text-[#121212]">Atelier Client Line</h3>
              <p className="text-[11px] text-[#6B6B6B] leading-relaxed">
                Mon - Sat, 10:00 AM - 7:00 PM IST across all Indian regions.
              </p>
            </div>
            <a
              href={telHref}
              className="w-full py-2.5 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-[10.5px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors text-center block"
            >
              {contactPhone}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
