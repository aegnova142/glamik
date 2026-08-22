import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, ArrowRight, Share2, Sparkles } from 'lucide-react';
import { JournalArticle } from '../../types';

interface JournalModalProps {
  article: JournalArticle | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenShadeFinder: () => void;
}

export const JournalModal: React.FC<JournalModalProps> = ({
  article,
  isOpen,
  onClose,
  onOpenShadeFinder,
}) => {
  if (!article) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-[#FAF9F6] border border-[#E8D5A8] shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto z-10"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 p-2 bg-[#FAF9F6]/80 hover:bg-[#0B0B0B] hover:text-white text-[#121212] transition-colors rounded-full border border-[#E8D5A8]"
              aria-label="Close article"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Hero Image */}
            <div className="relative aspect-[16/9] bg-[#FAF9F6] overflow-hidden">
              <img
                src={article.image}
                alt={article.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B]/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-6 right-6 text-white">
                <span className="text-[10px] tracking-widest uppercase text-[#C9972B] block font-semibold mb-1">
                  {article.category}
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl text-white leading-tight">
                  {article.title}
                </h2>
              </div>
            </div>

            {/* Article Content */}
            <div className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between text-xs text-[#6B6B6B] pb-4 border-b border-[#E8D5A8]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {article.readTime}
                  </span>
                  <span>•</span>
                  <span>{article.date}</span>
                </div>
                <span>By {article.author}</span>
              </div>

              <p className="font-serif text-lg text-[#121212] italic leading-relaxed text-[#C9972B]">
                &ldquo;{article.excerpt}&rdquo;
              </p>

              <div className="space-y-4 text-sm text-[#171717] font-light leading-relaxed">
                {article.content.map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>

              {/* Callout box inside article */}
              <div className="bg-[#FAF9F6] p-5 border border-[#E8D5A8] space-y-2">
                <span className="text-[10px] tracking-widest uppercase text-[#C9972B] font-semibold block">
                  GLAMIRK BEAUTY INTELLIGENCE
                </span>
                <p className="text-xs text-[#6B6B6B]">
                  Discover your personalized undertone and shade recommendations with our intelligent matcher.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onOpenShadeFinder();
                  }}
                  className="mt-2 inline-flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[#121212] hover:text-[#C9972B]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C9972B]" />
                  <span>LAUNCH SHADE FINDER</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="pt-4 border-t border-[#E8D5A8] flex items-center justify-between">
                <span className="text-xs text-[#6B6B6B]">
                  Glamirk Beauty Editorial Studio
                </span>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B]"
                >
                  CLOSE
                </button>
              </div>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
