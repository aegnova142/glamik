import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, ShoppingBag, Sparkles, Check, ChevronRight, ShieldCheck } from 'lucide-react';
import { Product, Shade } from '../../types';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  isWishlisted: boolean;
  onToggleWishlist: (productId: string) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onTryItOn: (product: Product) => void;
  onViewDetails?: (product: Product) => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  product,
  isOpen,
  onClose,
  isWishlisted,
  onToggleWishlist,
  onAddToBag,
  onTryItOn,
  onViewDetails,
}) => {
  const [selectedShade, setSelectedShade] = useState<Shade | undefined>(undefined);
  const [selectedSize, setSelectedSize] = useState<string | undefined>(undefined);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'DESCRIPTION' | 'RITUAL' | 'BENEFITS'>('DESCRIPTION');

  useEffect(() => {
    if (product) {
      setSelectedShade(product.shades ? product.shades[0] : undefined);
      setSelectedSize(product.selectedSize || (product.sizes ? product.sizes[0] : undefined));
      setActiveImageIndex(0);
      setQuantity(1);
      setActiveTab('DESCRIPTION');
    }
  }, [product]);

  if (!product) return null;

  const imagesList = [
    product.images.primary,
    product.images.secondary,
    product.images.detail,
    product.images.texture,
  ].filter(Boolean) as string[];

  const currentPrice = selectedSize === '30g' ? 549 : product.price;

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
            className="fixed inset-0 bg-[#0B0B0B]/60 backdrop-blur-xs transition-opacity"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-white rounded-3xl border border-[#E8D5A8] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden z-10 grid grid-cols-1 md:grid-cols-12"
          >
            {/* Close Button */}
            <button
              id="quickview-close-btn"
              onClick={onClose}
              className="absolute top-4 right-4 z-20 p-2 bg-white/90 hover:bg-[#FCE8ED] text-[#121212] hover:text-[#F05A7E] transition-colors rounded-full border border-[#E8D5A8] shadow-sm cursor-pointer"
              aria-label="Close product view"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Gallery (Col 1 to 6) */}
            <div className="md:col-span-6 p-6 sm:p-8 bg-[#FCE8ED]/50 border-r border-[#E8D5A8] flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                {/* Main Large Visual */}
                <div className="relative aspect-[4/5] bg-white rounded-2xl overflow-hidden border border-[#E8D5A8] shadow-sm">
                  <img
                    src={imagesList[activeImageIndex] || product.images.primary}
                    alt={product.name}
                    className="w-full h-full object-cover transition-all duration-500"
                  />
                  {product.tag && (
                    <span className="absolute top-3 left-3 px-3 py-1 bg-[#F05A7E] text-white text-[10px] font-bold tracking-wider uppercase rounded-full shadow-sm">
                      {product.tag}
                    </span>
                  )}
                </div>

                {/* Thumbnails */}
                {imagesList.length > 1 && (
                  <div className="grid grid-cols-4 gap-2.5">
                    {imagesList.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImageIndex(idx)}
                        className={`aspect-square overflow-hidden rounded-xl border transition-all cursor-pointer ${
                          activeImageIndex === idx
                            ? 'border-[#F05A7E] ring-2 ring-[#F05A7E]/30 scale-102'
                            : 'border-[#E8D5A8] opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img} alt="Thumbnail" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Try It On Teaser Banner inside modal */}
              {product.shades && (
                <div className="mt-6 p-4 bg-white rounded-2xl border border-[#E8D5A8] flex items-center justify-between shadow-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] tracking-wider uppercase text-[#F05A7E] font-bold">
                      Shade Intelligence
                    </span>
                    <p className="text-xs text-[#6B6B6B]">
                      Explore curated tones for Indian skin.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onTryItOn(product);
                    }}
                    className="px-3.5 py-1.5 bg-[#FCE8ED] text-[#F05A7E] hover:bg-[#F05A7E] hover:text-white border border-[#E8D5A8] text-xs font-bold rounded-full flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Try On</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Information & Customization (Col 7 to 12) */}
            <div className="md:col-span-6 p-6 sm:p-8 flex flex-col justify-between space-y-5 overflow-y-auto">
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-[11px] tracking-wider uppercase text-[#6B6B6B] mb-1 font-semibold pr-12">
                    <span>{product.subCategory}</span>
                    <button
                      onClick={() => onToggleWishlist(product.id)}
                      className="flex items-center gap-1 text-[#6B6B6B] hover:text-[#F05A7E] cursor-pointer transition-colors"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isWishlisted ? 'fill-[#F05A7E] text-[#F05A7E]' : ''
                        }`}
                      />
                      <span className="text-[10.5px] font-bold">
                        {isWishlisted ? 'Saved' : 'Save'}
                      </span>
                    </button>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[#121212] leading-tight">
                    {product.name}
                  </h2>

                  <p className="text-xs sm:text-sm text-[#6B6B6B] mt-1 leading-relaxed">
                    {product.subtitle}
                  </p>
                </div>

                {/* Price Display */}
                <div className="flex items-baseline gap-2 pt-2 border-t border-[#E8D5A8]">
                  <span className="text-2xl text-[#121212] font-extrabold">
                    {product.currency}{currentPrice}
                  </span>
                  <span className="text-xs text-[#6B6B6B]">
                    (Inclusive of all taxes & free shipping over ₹999)
                  </span>
                </div>

                {/* Size Selector for Cleansers */}
                {product.sizes && (
                  <div className="space-y-2 pt-1">
                    <label className="text-xs uppercase tracking-wider text-[#6B6B6B] font-bold block">
                      Select Size:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {product.sizes.map((size) => (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          className={`p-3 text-left rounded-2xl border transition-all cursor-pointer ${
                            selectedSize === size
                              ? 'border-[#F05A7E] bg-[#FCE8ED] shadow-xs'
                              : 'border-[#E8D5A8] bg-white text-[#6B6B6B] hover:border-[#F05A7E]/50'
                          }`}
                        >
                          <span className="text-xs font-bold text-[#121212] block">
                            {size} {size === '30g' ? 'Discovery Format' : 'Ritual Jar'}
                          </span>
                          <span className="text-[10.5px] text-[#6B6B6B] block mt-0.5">
                            {size === '30g' ? '₹549' : '₹849'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Shade Swatch Selector */}
                {product.shades && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6B6B6B] font-semibold">
                        Select Shade: <strong className="text-[#121212] font-bold">{selectedShade?.name}</strong>
                      </span>
                      <span className="text-[#F05A7E] font-bold text-[11px]">
                        {selectedShade?.undertone} Undertone
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                      {product.shades.map((shade) => (
                        <button
                          key={shade.id}
                          onClick={() => setSelectedShade(shade)}
                          className={`w-7 h-7 rounded-full border transition-all cursor-pointer ${
                            selectedShade?.id === shade.id
                              ? 'border-[#F05A7E] scale-110 ring-2 ring-[#F05A7E]/40'
                              : 'border-[#0B0B0B]/10 hover:scale-105'
                          }`}
                          style={{ backgroundColor: shade.hex }}
                          title={`${shade.name} - ${shade.undertone}`}
                          aria-label={shade.name}
                        />
                      ))}
                    </div>

                    {selectedShade && (
                      <p className="text-xs text-[#6B6B6B] bg-[#FCE8ED] p-2.5 rounded-xl border border-[#E8D5A8] mt-2">
                        {selectedShade.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Detail Tabs */}
                <div className="pt-2 border-t border-[#E8D5A8] space-y-3">
                  <div className="flex items-center gap-4 text-xs font-bold tracking-wider uppercase border-b border-[#E8D5A8] pb-2">
                    <button
                      onClick={() => setActiveTab('DESCRIPTION')}
                      className={`pb-1 transition-colors cursor-pointer ${
                        activeTab === 'DESCRIPTION'
                          ? 'text-[#F05A7E] border-b-2 border-[#F05A7E]'
                          : 'text-[#6B6B6B] hover:text-[#121212]'
                      }`}
                    >
                      Description
                    </button>
                    <button
                      onClick={() => setActiveTab('RITUAL')}
                      className={`pb-1 transition-colors cursor-pointer ${
                        activeTab === 'RITUAL'
                          ? 'text-[#F05A7E] border-b-2 border-[#F05A7E]'
                          : 'text-[#6B6B6B] hover:text-[#121212]'
                      }`}
                    >
                      The Ritual
                    </button>
                    <button
                      onClick={() => setActiveTab('BENEFITS')}
                      className={`pb-1 transition-colors cursor-pointer ${
                        activeTab === 'BENEFITS'
                          ? 'text-[#F05A7E] border-b-2 border-[#F05A7E]'
                          : 'text-[#6B6B6B] hover:text-[#121212]'
                      }`}
                    >
                      Benefits
                    </button>
                  </div>

                  <div className="text-xs text-[#6B6B6B] leading-relaxed min-h-[50px]">
                    {activeTab === 'DESCRIPTION' && (
                      <p>{product.description}</p>
                    )}
                    {activeTab === 'RITUAL' && (
                      <p>{product.ritual}</p>
                    )}
                    {activeTab === 'BENEFITS' && (
                      <ul className="space-y-1.5">
                        {product.benefits.map((benefit, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-[#F05A7E] flex-shrink-0" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

              </div>

              {/* Bottom Action Area */}
              <div className="pt-3 border-t border-[#E8D5A8] space-y-3">
                <div className="flex items-center gap-3">
                  {/* Quantity */}
                  <div className="flex items-center border border-[#E8D5A8] rounded-full bg-white px-1">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-8 h-8 flex items-center justify-center text-xs text-[#121212] hover:bg-[#FCE8ED] rounded-full transition-colors cursor-pointer"
                    >
                      -
                    </button>
                    <span className="px-2 text-xs font-bold text-[#121212]">{quantity}</span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center text-xs text-[#121212] hover:bg-[#FCE8ED] rounded-full transition-colors cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  {/* Add to Bag CTA */}
                  <button
                    id="quickview-add-to-bag-btn"
                    onClick={() => {
                      onAddToBag(product, selectedShade, selectedSize, quantity);
                      onClose();
                    }}
                    className="flex-grow py-3.5 px-6 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold rounded-full transition-all flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(240, 90, 126,0.3)] hover:scale-102 active:scale-95 cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Add To Bag • ₹{currentPrice! * quantity}</span>
                  </button>
                </div>

                {onViewDetails && (
                  <button
                    onClick={() => {
                      onClose();
                      onViewDetails(product);
                    }}
                    className="w-full py-2 text-center text-xs font-bold text-[#6B6B6B] hover:text-[#F05A7E] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>View Complete Product Details & Ritual</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

