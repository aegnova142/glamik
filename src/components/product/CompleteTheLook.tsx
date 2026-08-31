import React from 'react';
import { Product, Shade } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { ShoppingBag, Plus, Sparkles } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

interface CompleteTheLookProps {
  currentProduct: Product;
  onAddLookToBag: (items: { product: Product; shade?: Shade; size?: string }[]) => void;
  onSelectProduct: (product: Product) => void;
}

export const CompleteTheLook: React.FC<CompleteTheLookProps> = ({
  currentProduct,
  onAddLookToBag,
  onSelectProduct,
}) => {
  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const complementProducts = currentProduct.completeTheLookProductIds
    .map((id) => catalogProducts.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  if (complementProducts.length === 0) return null;

  const allLookItems = [currentProduct, ...complementProducts];
  const totalPrice = allLookItems.reduce((sum, p) => sum + p.price, 0);

  const handleAddBundle = () => {
    const items = allLookItems.map((p) => ({
      product: p,
      shade: p.shades ? p.shades[0] : undefined,
      size: p.selectedSize || (p.sizes ? p.sizes[0] : undefined),
    }));
    onAddLookToBag(items);
  };

  return (
    <section className="my-16 p-6 sm:p-8 bg-[#FAF9F6] border border-[#E8D5A8]">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[#C9972B] text-[10px] font-semibold tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>CURATED BEAUTY RITUAL</span>
          </div>
          <h3 className="font-serif text-2xl sm:text-3xl text-[#121212]">
            COMPLETE YOUR LOOK
          </h3>
          <p className="text-xs text-[#6B6B6B] font-light">
            Pair with complementary formulations for a cohesive, long-lasting editorial presence.
          </p>
        </div>

        <button
          onClick={handleAddBundle}
          className="px-6 py-3 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-2 flex-shrink-0 shadow-md cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4 text-[#C9972B]" />
          <span>ADD THE LOOK • ₹{totalPrice}</span>
        </button>
      </div>

      {/* Grid of bundle items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {allLookItems.map((item, idx) => (
          <div
            key={item.id}
            className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] flex items-center gap-3.5 group cursor-pointer hover:border-[#0B0B0B] transition-all"
            onClick={() => onSelectProduct(item)}
          >
            <div className="w-16 h-20 bg-[#FAF9F6] overflow-hidden flex-shrink-0 border border-[#E8D5A8]">
              <img
                src={item.images.primary}
                alt={item.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-[9.5px] uppercase tracking-wider text-[#C9972B] font-semibold block">
                {idx === 0 ? 'CURRENT STEP' : 'COMPLEMENTARY'}
              </span>
              <h4 className="font-serif text-sm font-medium text-[#121212] truncate group-hover:text-[#C9972B] transition-colors">
                {item.name}
              </h4>
              <span className="font-serif text-xs font-medium text-[#121212] block mt-0.5">
                {item.currency}{item.price}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
