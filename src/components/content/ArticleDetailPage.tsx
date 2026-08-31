import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Clock,
  Share2,
  Check,
  ShoppingBag,
  Sparkles,
  ArrowRight,
  Bookmark,
  Heart,
  Eye,
  Camera,
} from 'lucide-react';
import { JournalArticle, Product, Shade } from '../../types';
import { ArticleCard } from './ArticleCard';
import { GLAMIRK_JOURNAL_ARTICLES_EXTENDED } from '../../data/editorial';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { GLAMIRK_LOOKS } from '../../data/looks';
import { updatePageSeo } from '../../utils/seo';
import { trackEvent } from '../../utils/analytics';
import { useCMS } from '../../context/CMSContext';

interface ArticleDetailPageProps {
  articleId: string;
  onBackToJournal: () => void;
  onOpenArticle: (id: string) => void;
  onOpenProduct: (product: Product) => void;
  onOpenLook: (lookId: string) => void;
  onOpenTryOn: (productId?: string, shadeId?: string) => void;
  onAddToCart: (product: Product, shade?: Shade, size?: string) => void;
}

export const ArticleDetailPage: React.FC<ArticleDetailPageProps> = ({
  articleId,
  onBackToJournal,
  onOpenArticle,
  onOpenProduct,
  onOpenLook,
  onOpenTryOn,
  onAddToCart,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string>('');
  const { journalArticles, looks, products: cmsProducts } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const articles = (journalArticles && journalArticles.length > 0 ? journalArticles : GLAMIRK_JOURNAL_ARTICLES_EXTENDED).filter(
    (a) => a.status !== 'draft'
  );
  const looksList = looks && looks.length > 0 ? looks : GLAMIRK_LOOKS;

  const article = articles.find((a) => a.id === articleId) || articles[0];

  useEffect(() => {
    updatePageSeo({
      title: article.seoTitle || `${article.title} | The Glamirk Journal`,
      description: article.seoDescription || article.excerpt,
      ogImage: article.heroImageLarge || article.image,
      ogType: 'article',
    });
    trackEvent('article_view', { articleId: article.id, title: article.title });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [article.id]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: article.title,
        text: article.excerpt,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleWhatsAppShare = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`Read "${article.title}" on Glamirk Beauty:\n`);
    window.open(`https://api.whatsapp.com/send?text=${text}${url}`, '_blank');
  };

  // Find shoppable products
  const shoppableProducts = catalogProducts.filter((p) =>
    article.shoppableProductIds?.includes(p.id)
  );

  // Related articles
  const relatedArticles = articles.filter(
    (a) => article.relatedArticleIds?.includes(a.id) || (a.category === article.category && a.id !== article.id)
  ).slice(0, 3);

  // Related looks
  const relatedLooks = (looksList).filter((l) =>
    article.relatedLookIds?.includes(l.id)
  );

  return (
    <article className="bg-[#FAF9F6] min-h-screen text-[#121212] pb-24">
      {/* Top Reading Navigation Bar */}
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/90 backdrop-blur-md border-b border-[#E8D5A8] px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <button
          onClick={onBackToJournal}
          className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] uppercase text-[#121212] hover:text-[#C9972B] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>JOURNAL ATELIER</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-block text-[11px] text-[#6B6B6B] font-serif italic truncate max-w-xs">
            {article.title}
          </span>
          <button
            onClick={handleWhatsAppShare}
            className="px-2.5 py-1.5 bg-[#FAF9F6] hover:bg-[#E8D5A8] text-[#121212] text-[10px] font-semibold tracking-wider uppercase transition-colors"
            title="Share via WhatsApp"
          >
            WhatsApp
          </button>
          <button
            onClick={handleShare}
            className="p-1.5 text-[#121212] hover:text-[#C9972B] transition-colors flex items-center gap-1 text-xs"
            title="Copy Link"
          >
            {copiedLink ? (
              <span className="text-[10px] text-[#C9972B] font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Copied
              </span>
            ) : (
              <Share2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Article Header & Editorial Title */}
      <header className="max-w-4xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <span className="px-3 py-1 bg-[#FAF9F6] text-[#C9972B] text-[10.5px] font-semibold tracking-[0.22em] uppercase border border-[#E8D5A8]">
            {article.category}
          </span>
          <span className="text-xs text-[#6B6B6B] flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {article.readTime}
          </span>
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#121212] tracking-tight leading-tight pt-2">
          {article.title}
        </h1>

        {article.subtitle && (
          <p className="font-serif italic text-lg sm:text-xl text-[#6B6B6B] max-w-2xl mx-auto">
            {article.subtitle}
          </p>
        )}

        <div className="pt-4 flex items-center justify-center gap-4 text-xs text-[#6B6B6B] border-t border-[#E8D5A8] max-w-md mx-auto">
          <span>Words by <strong className="text-[#121212] font-medium">{article.author}</strong></span>
          <span>•</span>
          <span>{article.date}</span>
        </div>
      </header>

      {/* Hero Cover Visual */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mb-12">
        <div className="relative aspect-[16/9] sm:aspect-[21/9] bg-[#FAF9F6] overflow-hidden border border-[#E8D5A8] shadow-xl">
          <img
            src={article.heroImageLarge || article.image}
            alt={article.title}
            className="w-full h-full object-cover"
            loading="eager"
          />
        </div>
      </div>

      {/* Main Content & Table of Contents Layout */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Sticky Table of Contents (Desktop) */}
        {article.tableOfContents && article.tableOfContents.length > 0 && (
          <aside className="hidden lg:block lg:col-span-3">
            <div className="sticky top-20 space-y-4 p-5 bg-[#FAF9F6] border border-[#E8D5A8]">
              <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-[#C9972B] block border-b border-[#E8D5A8] pb-2">
                INDEX
              </span>
              <ul className="space-y-3 text-xs text-[#6B6B6B]">
                {article.tableOfContents.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="hover:text-[#121212] transition-colors leading-relaxed block hover:translate-x-0.5"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>

              {shoppableProducts.length > 0 && (
                <div className="pt-4 border-t border-[#E8D5A8] space-y-2">
                  <span className="text-[9.5px] font-bold tracking-widest uppercase text-[#121212] block">
                    IN THIS STORY
                  </span>
                  <div className="text-[11px] text-[#6B6B6B]">
                    {shoppableProducts.map((p) => p.name).join(', ')}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Center Editorial Body Column */}
        <div className={`space-y-10 ${article.tableOfContents ? 'lg:col-span-9' : 'lg:col-span-12 max-w-3xl mx-auto'}`}>
          
          {/* Excerpt Lead In */}
          <div className="font-serif text-lg sm:text-xl text-[#171717] leading-relaxed border-l-2 border-[#C9972B] pl-6 italic">
            {article.excerpt}
          </div>

          {/* Render Sections */}
          {article.sections && article.sections.length > 0 ? (
            article.sections.map((section, sIdx) => {
              const matchingProduct = section.shoppableProductId
                ? catalogProducts.find((p) => p.id === section.shoppableProductId)
                : null;
              const matchingShade = (matchingProduct && section.shoppableShadeId)
                ? matchingProduct.shades?.find((s) => s.id === section.shoppableShadeId)
                : matchingProduct?.shades?.[0];

              return (
                <section
                  key={sIdx}
                  id={article.tableOfContents?.[sIdx]?.id}
                  className="space-y-6 pt-6 border-t border-[#E8D5A8] first:border-none first:pt-0"
                >
                  {section.heading && (
                    <div className="space-y-1">
                      <h2 className="font-serif text-2xl sm:text-3xl text-[#121212] tracking-tight">
                        {section.heading}
                      </h2>
                      {section.subheading && (
                        <p className="text-xs tracking-widest uppercase font-semibold text-[#C9972B]">
                          {section.subheading}
                        </p>
                      )}
                    </div>
                  )}

                  {section.paragraphs.map((pText, pIdx) => (
                    <p key={pIdx} className="text-base text-[#171717] leading-relaxed font-light">
                      {pText}
                    </p>
                  ))}

                  {/* Pull Quote */}
                  {section.pullQuote && (
                    <div className="my-8 py-6 px-8 bg-[#FAF9F6] border-y border-[#E8D5A8] text-center">
                      <blockquote className="font-serif text-xl sm:text-2xl text-[#121212] italic leading-snug">
                        "{section.pullQuote}"
                      </blockquote>
                      <span className="block mt-2 text-[10px] tracking-[0.2em] uppercase text-[#C9972B] font-semibold">
                        — GLAMIRK FORMULATION EDITORIAL
                      </span>
                    </div>
                  )}

                  {/* In-Article Image Visual */}
                  {section.image && (
                    <figure className="my-6 space-y-2">
                      <div className="overflow-hidden border border-[#E8D5A8] aspect-[16/10] bg-[#FAF9F6]">
                        <img
                          src={section.image}
                          alt={section.heading || 'Editorial Visual'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      {section.imageCaption && (
                        <figcaption className="text-center text-xs text-[#6B6B6B] italic">
                          {section.imageCaption}
                        </figcaption>
                      )}
                    </figure>
                  )}

                  {/* Pro-Tip Box */}
                  {section.tipBox && (
                    <div className="p-6 bg-[#FAF9F6] border border-[#E8D5A8] space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-[#C9972B]">
                        <Sparkles className="w-4 h-4 text-[#C9972B]" />
                        <span>{section.tipBox.title}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed">
                        {section.tipBox.text}
                      </p>
                    </div>
                  )}

                  {/* Inline Shoppable Product Card (Content-to-Commerce Loop) */}
                  {matchingProduct && (
                    <div className="my-8 p-6 bg-[#FAF9F6] border border-[#C9972B]/50 shadow-md flex flex-col sm:flex-row items-center gap-6">
                      <div className="w-24 h-28 bg-[#FAF9F6] overflow-hidden flex-shrink-0 border border-[#E8D5A8]">
                        <img
                          src={matchingProduct.images.primary}
                          alt={matchingProduct.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex-grow space-y-1 text-center sm:text-left">
                        <span className="text-[9.5px] font-bold tracking-[0.22em] uppercase text-[#C9972B] block">
                          FEATURED IN THIS SECTION
                        </span>
                        <h4 className="font-serif text-lg text-[#121212] font-medium">
                          {matchingProduct.name}
                        </h4>
                        {matchingShade && (
                          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-[#6B6B6B]">
                            <span
                              className="w-3 h-3 rounded-full border border-[#0B0B0B]/10 inline-block"
                              style={{ backgroundColor: matchingShade.hex }}
                            />
                            <span>Featured Shade: <strong>{matchingShade.name}</strong></span>
                          </div>
                        )}
                        <p className="text-xs text-[#6B6B6B] line-clamp-1">
                          {matchingProduct.subtitle}
                        </p>
                        <span className="font-serif text-sm font-medium text-[#121212] block pt-1">
                          ₹{matchingProduct.price}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2 w-full sm:w-auto flex-shrink-0">
                        <button
                          onClick={() => {
                            trackEvent('product_clicked_from_article', {
                              articleId: article.id,
                              productId: matchingProduct.id,
                            });
                            onAddToCart(matchingProduct, matchingShade);
                          }}
                          className="px-6 py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-[11px] font-semibold tracking-widest uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <ShoppingBag className="w-3.5 h-3.5 text-[#C9972B]" />
                          <span>ADD TO BAG</span>
                        </button>
                        <button
                          onClick={() => onOpenTryOn(matchingProduct.id, matchingShade?.id)}
                          className="px-4 py-1.5 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-[10px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-[#FAF9F6] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3 h-3 text-[#C9972B]" />
                          <span>TRY ON SHADE</span>
                        </button>
                      </div>
                    </div>
                  )}

                </section>
              );
            })
          ) : (
            <div className="space-y-4">
              {article.content.map((cParagraph, cIdx) => (
                <p key={cIdx} className="text-base text-[#171717] leading-relaxed font-light">
                  {cParagraph}
                </p>
              ))}
            </div>
          )}

          {/* Related Shop The Look Integration */}
          {relatedLooks.length > 0 && (
            <div className="pt-10 border-t border-[#E8D5A8] space-y-6">
              <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-[#C9972B] block">
                COMPLEMENTARY BEAUTY EDIT
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {relatedLooks.map((look) => (
                  <div
                    key={look.id}
                    onClick={() => onOpenLook(look.id)}
                    className="group cursor-pointer bg-[#FAF9F6] border border-[#E8D5A8] p-4 flex gap-4 items-center hover:border-[#C9972B] transition-all"
                  >
                    <div className="w-20 h-24 overflow-hidden bg-[#FAF9F6] flex-shrink-0">
                      <img src={look.image} alt={look.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold">{look.category}</span>
                      <h4 className="font-serif text-base text-[#121212] group-hover:text-[#C9972B] transition-colors">{look.title}</h4>
                      <p className="text-xs text-[#6B6B6B] line-clamp-1">{look.tagline}</p>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#121212] block pt-1">SHOP THE LOOK →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Bottom Editorial Suggestions: YOU MAY ALSO LIKE */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 pt-16 border-t border-[#E8D5A8] space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-[#C9972B] block">
              MORE FROM THE ATELIER
            </span>
            <h3 className="font-serif text-2xl sm:text-3xl text-[#121212]">
              YOU MAY ALSO LIKE
            </h3>
          </div>
          <button
            onClick={onBackToJournal}
            className="text-xs font-semibold tracking-widest uppercase text-[#121212] hover:text-[#C9972B] flex items-center gap-1"
          >
            <span>VIEW ALL JOURNAL STORIES</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[30px]">
          {relatedArticles.map((relArt) => (
            <ArticleCard key={relArt.id} article={relArt} onOpen={() => onOpenArticle(relArt.id)} />
          ))}
        </div>
      </section>
    </article>
  );
};
