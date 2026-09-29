import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

interface ProductDiscoveryBannerProps {
  onOpenShadeFinder: () => void;
}

export const ProductDiscoveryBanner: React.FC<ProductDiscoveryBannerProps> = ({
  onOpenShadeFinder,
}) => {
  return (
    <div className="my-10 p-6 sm:p-8 bg-[#FCE8ED] text-[#121212] rounded-3xl border border-[#E8D5A8] relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_4px_20px_rgba(240, 90, 126,0.06)]">
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#F05A7E]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="space-y-2 text-center md:text-left relative z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E8D5A8] text-[#F05A7E] text-[10.5px] font-bold tracking-wider uppercase rounded-full shadow-xs">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Shade Intelligence</span>
        </div>
        <h3 className="text-2xl sm:text-3xl font-extrabold text-[#121212]">
          Find Your Signature Shade
        </h3>
        <p className="text-xs sm:text-sm text-[#6B6B6B] max-w-lg leading-relaxed">
          Not sure where to start? Discover velvet lipsticks and ceremonial formulations calibrated precisely for your undertone.
        </p>
      </div>

      <button
        onClick={onOpenShadeFinder}
        className="px-7 py-3.5 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold rounded-full transition-all flex items-center gap-2 flex-shrink-0 relative z-10 shadow-[0_4px_16px_rgba(240, 90, 126,0.3)] hover:scale-102 active:scale-95 cursor-pointer"
      >
        <span>Find My Shade</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

