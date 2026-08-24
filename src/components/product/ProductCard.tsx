import React, { useState } from 'react';
import { Heart, Sparkles, Eye, ShoppingBag, ArrowRight, Star } from 'lucide-react';
import { Product, Shade } from '../../types';

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  onToggleWishlist: (productId: string) => void;
  onQuickView: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isWishlisted,
  onToggleWishlist,
  onQuickView,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
}) => {
  const [selectedShade, setSelectedShade] = useState<Shade | undefined>(
    product.shades ? product.shades[0] : undefined
  );
  const [isHovered, setIsHovered] = useState(false);

  const displayImage = isHovered && product.images.secondary
    ? product.images.secondary
    : product.images.primary;

  return (
    <div
      id={`product-card-${product.id}`}
      className="group relative flex flex-col bg-white rounded-[20px] border border-[#E8D5A8] overflow-hidden shadow-[0_4px_16px_rgba(240,90,126,0.04)] hover:shadow-[0_12px_30px_rgba(240,90,126,0.12)] hover:border-[#FCE8ED] transition-all duration-300 p-[26px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Product Image Frame */}
      <div className="relative w-full aspect-[4/3] shrink-0 overflow-hidden rounded-[16px] bg-[#FCE8ED]">
        {/* Main Product Image */}
        <img
          src={displayImage}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-contain object-center transition-transform duration-700 ease-out group-hover:scale-105"
        />

        {/* Reference Pink Pill Product Badge */}
        {product.tag && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <span className="px-2.5 py-1 bg-white/95 text-[#F05A7E] text-[9.5px] font-bold tracking-wider uppercase rounded-full shadow-xs border border-[#E8D5A8]">
              {product.tag}
            </span>
          </div>
        )}

        {/* Wishlist Icon Button with Soft Pink Container */}
        <button
          id={`wishlist-btn-${product.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product.id);
          }}
          className="absolute top-2.5 right-2.5 z-10 p-2 bg-white/90 hover:bg-white text-[#121212] backdrop-blur-xs transition-all duration-200 border border-[#E8D5A8] rounded-full shadow-xs hover:scale-110"
          aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
        >
          <Heart
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
              isWishlisted ? 'fill-[#F05A7E] text-[#F05A7E]' : 'text-[#6B6B6B] hover:text-[#F05A7E]'
            }`}
          />
        </button>

        {/* Floating Quick Action Overlay on Hover */}
        {(product.enableQuickView !== false || (product.shades && product.enableTryOn !== false)) && (
          <div className="absolute inset-x-2.5 bottom-2.5 z-10 flex gap-1.5 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
            {product.enableQuickView !== false && (
              <button
                id={`quickview-btn-${product.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickView(product);
                }}
                className="flex-1 py-2 px-2.5 bg-white/95 hover:bg-[#FCE8ED] text-[#121212] text-[10px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1 shadow-sm border border-[#E8D5A8]"
              >
                <Eye className="w-3 h-3 text-[#F05A7E]" />
                <span>Quick View</span>
              </button>
            )}

            {product.shades && product.enableTryOn !== false && (
              <button
                id={`tryon-btn-${product.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTryItOn(product);
                }}
                className="py-2 px-2.5 bg-white/95 hover:bg-[#FCE8ED] text-[#F05A7E] text-[10px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1 shadow-sm border border-[#E8D5A8]"
                title="Virtual Try-On"
              >
                <Sparkles className="w-3 h-3 text-[#F05A7E]" />
                <span className="hidden sm:inline">Try On</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Product Information */}
      <div className="pt-4 flex flex-col space-y-1.5 flex-1 justify-between">
        <div>
          {/* Subcategory */}
          <div className="text-[11px] text-[#6B6B6B] font-medium">
            <span>{product.subCategory}</span>
          </div>

          {/* Product Title */}
          <h3
            onClick={() => onSelectProduct(product)}
            className="text-sm sm:text-base font-bold text-[#121212] leading-snug cursor-pointer hover:text-[#F05A7E] transition-colors mt-0.5 line-clamp-1"
          >
            {product.name}
          </h3>

          {/* Subtitle / Key Note */}
          <p className="text-xs text-[#6B6B6B] line-clamp-1 mt-0.5">
            {product.subtitle}
          </p>

          {/* Shade Swatch Selector */}
          {product.shades && product.shades.length > 0 && (
            <div className="pt-2 flex items-center gap-1.5 flex-wrap">
              {product.shades.slice(0, 6).map((shade) => (
                <button
                  key={shade.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedShade(shade);
                  }}
                  className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                    selectedShade?.id === shade.id
                      ? 'border-[#F05A7E] scale-125 ring-2 ring-[#F05A7E]/30'
                      : 'border-[#0B0B0B]/15 hover:scale-110'
                  }`}
                  style={{ backgroundColor: shade.hex }}
                  title={`${shade.name} (${shade.undertone} undertone)`}
                  aria-label={`Select shade ${shade.name}`}
                />
              ))}
              {product.shades.length > 6 && (
                <span className="text-[10px] text-[#6B6B6B] font-medium">
                  +{product.shades.length - 6}
                </span>
              )}
            </div>
          )}

          {/* Size Badge for Cleansers */}
          {product.sizes && !product.shades && (
            <div className="pt-1.5 flex items-center gap-1.5 text-[11px] text-[#6B6B6B]">
              <span className="px-2 py-0.5 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full font-bold text-[#F05A7E] text-[10px]">
                {product.selectedSize || '30g & 50g'}
              </span>
              <span>Solid Balm To Water</span>
            </div>
          )}
        </div>

        {/* Price and Add to Cart Pill Button */}
        <div className="pt-3 border-t border-[#E8D5A8]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-lg font-bold text-[#121212]">
              {product.currency}{product.price}
            </span>
            {product.originalPrice && product.originalPrice > product.price && (
              <>
                <span className="text-xs text-[#6B6B6B] line-through">
                  {product.currency}{product.originalPrice}
                </span>
                <span className="text-[10px] font-bold text-[#F05A7E]">
                  ({Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF)
                </span>
              </>
            )}
          </div>

          <button
            id={`quickadd-btn-${product.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd(product, selectedShade, product.selectedSize || (product.sizes ? product.sizes[0] : undefined));
            }}
            className="py-2 px-3.5 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-semibold rounded-full transition-all duration-200 flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(240, 90, 126,0.25)] hover:scale-102 active:scale-95 cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Add to Cart</span>
          </button>
        </div>
      </div>
    </div>
  );
};

