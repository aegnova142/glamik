import React from 'react';
import { Product, Shade, CartItem } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { ProductCard } from './ProductCard';

interface RelatedProductsProps {
  currentProduct: Product;
  wishlist: string[];
  cartItems: CartItem[];
  onToggleWishlist: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onTryItOn: (product: Product) => void;
  onQuickAdd: (product: Product, shade?: Shade, size?: string) => void;
  onGoToCart: () => void;
  onBuyNow: (product: Product, shade?: Shade, size?: string) => void;
}

export const RelatedProducts: React.FC<RelatedProductsProps> = ({
  currentProduct,
  wishlist,
  cartItems,
  onToggleWishlist,
  onSelectProduct,
  onTryItOn,
  onQuickAdd,
  onGoToCart,
  onBuyNow,
}) => {
  const relatedProducts = currentProduct.relatedProductIds
    .map((id) => GLAMIRK_PRODUCTS.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  if (relatedProducts.length === 0) return null;

  return (
    <section className="my-16">
      <div className="text-center space-y-2 mb-10">
        <span className="text-[10.5px] uppercase tracking-[0.24em] font-semibold text-[#6B6B6B]">
          CURATED HARMONY
        </span>
        <h3 className="font-serif text-2xl sm:text-3xl text-[#121212]">
          YOU MAY ALSO LIKE
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[30px] max-w-4xl mx-auto">
        {relatedProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isWishlisted={wishlist.includes(product.id)}
            cartItems={cartItems}
            onToggleWishlist={onToggleWishlist}
            onSelectProduct={onSelectProduct}
            onTryItOn={onTryItOn}
            onQuickAdd={onQuickAdd}
            onGoToCart={onGoToCart}
            onBuyNow={onBuyNow}
          />
        ))}
      </div>
    </section>
  );
};
