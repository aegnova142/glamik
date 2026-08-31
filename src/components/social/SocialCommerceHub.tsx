import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Instagram,
  ShoppingBag,
  Sparkles,
  ArrowRight,
  BadgeCheck,
  Camera,
  Heart,
  Upload,
  Check,
} from 'lucide-react';
import { SocialPost, Product, Shade, Creator } from '../../types';
import { GLAMIRK_SOCIAL_POSTS, GLAMIRK_CREATORS } from '../../data/editorial';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { SocialPostModal } from './SocialPostModal';
import { updatePageSeo } from '../../utils/seo';
import { trackEvent } from '../../utils/analytics';
import { useCMS } from '../../context/CMSContext';

interface SocialCommerceHubProps {
  onOpenProduct: (product: Product) => void;
  onOpenLook: (lookId: string) => void;
  onAddToCart: (product: Product, shade?: Shade) => void;
}

export const SocialCommerceHub: React.FC<SocialCommerceHubProps> = ({
  onOpenProduct,
  onOpenLook,
  onAddToCart,
}) => {
  // Live, admin-controlled catalog — GLAMIRK_PRODUCTS is only the seed
  // fallback for a not-yet-populated CMS, never the primary source.
  const { products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'CREATORS' | 'COMMUNITY'>('ALL');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submittedUgc, setSubmittedUgc] = useState(false);

  useEffect(() => {
    updatePageSeo({
      title: 'Glamirk On You | Social Commerce & Beauty Looks',
      description: 'Discover how beauty creators and community connoisseurs style Glamirk velvet lipsticks, ceremonial sindoor, and balm cleansers.',
    });
    trackEvent('content_view', { section: 'social_commerce_hub' });
  }, []);

  const filteredPosts = GLAMIRK_SOCIAL_POSTS.filter((post) => {
    if (filter === 'ALL') return true;
    if (filter === 'CREATORS') return post.isVerified;
    if (filter === 'COMMUNITY') return !post.isVerified || post.platform === 'Community UGC';
    return true;
  });

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#121212] pb-24 pt-8">
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 text-center border-b border-[#E8D5A8]">
        <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C9972B] block mb-2">
          SOCIAL COMMERCE & LOOKS
        </span>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#121212] tracking-tight mb-3">
          GLAMIRK ON YOU
        </h1>
        <p className="font-serif italic text-lg sm:text-xl text-[#6B6B6B] max-w-xl mx-auto">
          Real complexions. Iconic expressions. Tag @glamirkbeauty or #GlamirkBeauty.
        </p>

        {/* Filter Navigation */}
        <div className="flex items-center justify-center gap-3 mt-8">
          {(['ALL', 'CREATORS', 'COMMUNITY'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-5 py-2.5 text-xs font-semibold tracking-[0.18em] uppercase transition-all duration-300 rounded-none cursor-pointer ${
                filter === tab
                  ? 'bg-[#0B0B0B] text-[#FAF9F6] shadow-md'
                  : 'bg-[#FAF9F6] text-[#6B6B6B] hover:bg-[#E8D5A8] hover:text-[#121212]'
              }`}
            >
              {tab === 'ALL' ? 'ALL LOOKS' : tab === 'CREATORS' ? 'CREATOR EDITS' : 'COMMUNITY ATELIER'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-20">
        
        {/* Asymmetric Social Content Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredPosts.map((post, idx) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
              className="group relative bg-[#FAF9F6] border border-[#E8D5A8] overflow-hidden flex flex-col justify-between hover:shadow-xl transition-all duration-300"
            >
              {/* Media Block */}
              <div
                onClick={() => {
                  trackEvent('social_post_clicked', { postId: post.id, creator: post.creatorHandle });
                  setSelectedPost(post);
                }}
                className="relative aspect-[3/4] bg-[#FAF9F6] overflow-hidden cursor-pointer"
              >
                <img
                  src={post.mediaUrl}
                  alt={post.caption}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  loading="lazy"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B]/75 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                {/* Creator Badge Overlay */}
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-[#0B0B0B]/60 backdrop-blur-xs px-2.5 py-1 text-white text-[11px]">
                  <span className="font-mono">{post.creatorHandle}</span>
                  {post.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-[#C9972B]" />}
                </div>

                {/* Bottom Tagged Product Pill */}
                <div className="absolute bottom-3 left-3 right-3 text-[#FAF9F6] space-y-1">
                  {post.lookTitle && (
                    <span className="text-[9.5px] uppercase tracking-wider text-[#C9972B] font-semibold block">
                      {post.lookTitle}
                    </span>
                  )}
                  <p className="text-xs font-light line-clamp-2 leading-tight">
                    {post.caption}
                  </p>
                </div>
              </div>

              {/* Shoppable Footer Action */}
              <div className="p-4 bg-[#FAF9F6] border-t border-[#E8D5A8] flex items-center justify-between gap-2">
                <div className="text-[11px] text-[#6B6B6B] truncate">
                  {post.taggedProducts[0]?.productName}
                </div>
                <button
                  onClick={() => setSelectedPost(post)}
                  className="px-3 py-1.5 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] flex items-center gap-1.5 transition-colors cursor-pointer flex-shrink-0"
                >
                  <ShoppingBag className="w-3 h-3 text-[#C9972B]" />
                  <span>SHOP THIS LOOK</span>
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Creator Spotlight: GLAMIRK CREATORS */}
        <div className="bg-[#0B0B0B] text-[#FAF9F6] p-8 sm:p-12 lg:p-16 border border-[#171717] space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#171717] pb-6">
            <div>
              <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B] block">
                EDITORIAL CURATORS
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl text-[#FAF9F6] tracking-tight">
                GLAMIRK CREATORS
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#C9972B] max-w-md font-light">
              Collaborations with leading South Asian makeup artists, color theorists, and luxury beauty tastemakers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {GLAMIRK_CREATORS.map((creator) => {
              const curatedProducts = catalogProducts.filter((p) =>
                creator.curatedProductIds.includes(p.id)
              );

              return (
                <div
                  key={creator.id}
                  className="bg-[#0B0B0B] border border-[#171717] p-6 sm:p-8 flex flex-col justify-between space-y-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-[#171717] border-2 border-[#C9972B] flex-shrink-0">
                      <img src={creator.avatar} alt={creator.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-serif text-xl text-[#FAF9F6]">{creator.name}</h3>
                        <BadgeCheck className="w-4 h-4 text-[#C9972B]" />
                      </div>
                      <span className="text-xs text-[#C9972B] font-mono">{creator.handle}</span>
                      <p className="text-xs text-[#C9972B] leading-relaxed pt-1">
                        {creator.bio}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#171717] space-y-3">
                    <span className="text-[10px] font-semibold tracking-widest uppercase text-[#C9972B] block">
                      SHOP {creator.name.toUpperCase()}’S GLAM EDIT
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      {curatedProducts.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => onOpenProduct(p)}
                          className="bg-[#0B0B0B] p-3 border border-[#171717] flex items-center gap-3 cursor-pointer group hover:border-[#C9972B] transition-colors"
                        >
                          <div className="w-10 h-12 bg-[#171717] overflow-hidden flex-shrink-0">
                            <img src={p.images.primary} alt={p.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="space-y-0.5 overflow-hidden">
                            <h4 className="text-[11px] font-serif text-[#FAF9F6] group-hover:text-[#C9972B] transition-colors truncate">
                              {p.name}
                            </h4>
                            <span className="text-[10px] text-[#C9972B]">₹{p.price}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {creator.signatureLookId && (
                    <button
                      onClick={() => onOpenLook(creator.signatureLookId!)}
                      className="w-full py-3 bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#E8D5A8] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>SHOP SIGNATURE LOOK</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Community Submission Strip */}
        <div className="bg-[#E8D5A8] border border-[#E8D5A8] p-8 sm:p-12 text-center space-y-4">
          <span className="text-[10.5px] font-bold tracking-[0.24em] uppercase text-[#C9972B] block">
            BEAUTY COMMUNITY
          </span>
          <h3 className="font-serif text-2xl sm:text-3xl text-[#121212]">
            FEATURE YOUR GLAMIRK RITUAL
          </h3>
          <p className="text-xs sm:text-sm text-[#6B6B6B] max-w-md mx-auto leading-relaxed">
            Tag @glamirkbeauty in your Instagram posts or submit your editorial look to be featured in our permanent Atelier gallery.
          </p>

          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="mt-2 px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <Camera className="w-4 h-4 text-[#C9972B]" />
            <span>SUBMIT YOUR LOOK</span>
          </button>
        </div>

      </div>

      {/* Social Post Detail Modal */}
      <SocialPostModal
        isOpen={!!selectedPost}
        onClose={() => setSelectedPost(null)}
        post={selectedPost}
        products={catalogProducts}
        onOpenProduct={onOpenProduct}
        onOpenLook={onOpenLook}
        onAddToCart={onAddToCart}
      />

      {/* Community Look Submission Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setIsSubmitModalOpen(false)}
            className="fixed inset-0 bg-[#0B0B0B]/70 backdrop-blur-xs"
          />
          <div className="relative bg-[#FAF9F6] border border-[#E8D5A8] p-8 max-w-md w-full shadow-2xl z-50 space-y-5 text-center">
            {submittedUgc ? (
              <div className="space-y-4 py-6">
                <div className="w-12 h-12 bg-[#FAF9F6] rounded-full flex items-center justify-center mx-auto text-[#C9972B]">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="font-serif text-2xl text-[#121212]">Thank You</h4>
                <p className="text-xs text-[#6B6B6B]">
                  Your look submission has been received by our editorial team. If approved, you will be notified and featured on Glamirk On You.
                </p>
                <button
                  onClick={() => {
                    setSubmittedUgc(false);
                    setIsSubmitModalOpen(false);
                  }}
                  className="px-6 py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs uppercase tracking-widest"
                >
                  CLOSE
                </button>
              </div>
            ) : (
              <>
                <h4 className="font-serif text-2xl text-[#121212]">
                  Submit Your Glamirk Look
                </h4>
                <p className="text-xs text-[#6B6B6B]">
                  Share your Instagram handle or photo link wearing Glamirk formulations.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubmittedUgc(true);
                  }}
                  className="space-y-3 text-left"
                >
                  <div>
                    <label className="text-[10.5px] uppercase font-bold tracking-wider text-[#6B6B6B] block mb-1">
                      Instagram Handle / Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="@yourhandle"
                      className="w-full px-3 py-2.5 bg-[#FAF9F6] border border-[#E8D5A8] text-xs focus:outline-none focus:border-[#C9972B]"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] uppercase font-bold tracking-wider text-[#6B6B6B] block mb-1">
                      Glamirk Shade / Product Worn
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nude Suede / Spice Velvet"
                      className="w-full px-3 py-2.5 bg-[#FAF9F6] border border-[#E8D5A8] text-xs focus:outline-none focus:border-[#C9972B]"
                    />
                  </div>
                  <div className="pt-2 flex gap-2">
                    <button
                      type="submit"
                      className="flex-grow py-3 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-widest uppercase hover:bg-[#0B0B0B]"
                    >
                      SUBMIT FOR REVIEW
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSubmitModalOpen(false)}
                      className="px-4 py-3 bg-[#E8D5A8] text-[#121212] text-xs font-semibold uppercase"
                    >
                      CANCEL
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
