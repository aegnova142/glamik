import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Instagram,
  Youtube,
  Globe,
  Linkedin,
  X as XLogo,
  ShieldCheck,
  RotateCcw,
  Headphones,
  Truck,
  Sparkles,
  Lock,
  ShoppingBag,
  Search,
  Heart,
  User,
  Share2,
  Layers,
  Tag,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { CMSFooterLink } from '../../types';

// lucide-react has no Pinterest glyph — a small single-color brand mark,
// styled the same as every other social icon (sized via className).
const PinterestLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.03-.655 2.569-.994 3.995-.283 1.194.598 2.169 1.775 2.169 2.129 0 3.768-2.245 3.768-5.487 0-2.868-2.061-4.874-5.005-4.874-3.41 0-5.409 2.557-5.409 5.199 0 1.03.397 2.132.892 2.732a.36.36 0 0 1 .083.345c-.09.375-.293 1.194-.333 1.361-.052.221-.174.267-.4.161-1.492-.694-2.424-2.876-2.424-4.627 0-3.769 2.738-7.229 7.892-7.229 4.144 0 7.365 2.953 7.365 6.899 0 4.117-2.595 7.431-6.199 7.431-1.211 0-2.35-.629-2.738-1.373 0 0-.599 2.282-.744 2.84-.269 1.037-.998 2.336-1.487 3.128C9.399 23.837 10.679 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0Z"/>
  </svg>
);

interface FooterProps {
  onOpenShadeFinder: () => void;
  onNavigateHome: () => void;
  onNavigateShop: (category?: string | null, subCategory?: string | null) => void;
  onNavigateShopTheLook: () => void;
  onNavigateCart?: () => void;
  onNavigateTracking?: () => void;
  onNavigateSupport?: () => void;
  onNavigateMyGlam?: () => void;
  onNavigateJournal?: () => void;
  onNavigateGuides?: () => void;
  onNavigateSocialCommerce?: () => void;
  onNavigateCampaign?: (campaignId: string) => void;
  onNavigateLegal?: (policy?: 'privacy' | 'terms' | 'shipping' | 'returns' | 'cookies') => void;
  onNavigateAdmin?: () => void;
  onNavigateAbout?: () => void;
  onOpenConcierge?: () => void;
}

const SOCIAL_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Instagram,
  YouTube: Youtube,
  Youtube,
  Pinterest: PinterestLogo,
  LinkedIn: Linkedin,
  Linkedin,
  X: XLogo,
  Twitter: XLogo,
};

const TRUST_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ShieldCheck,
  RotateCcw,
  Headphones,
  Truck,
  Sparkles,
  Lock,
};

export const FOOTER_COLUMN_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingBag,
  Search,
  Heart,
  Headphones,
  User,
  ShieldCheck,
  Share2,
  Layers,
  Tag,
  Sparkles,
};

export const Footer: React.FC<FooterProps> = ({
  onOpenShadeFinder,
  onNavigateHome,
  onNavigateShop,
  onNavigateShopTheLook,
  onNavigateCart,
  onNavigateTracking,
  onNavigateSupport,
  onNavigateMyGlam,
  onNavigateJournal,
  onNavigateGuides,
  onNavigateSocialCommerce,
  onNavigateCampaign,
  onNavigateLegal,
  onNavigateAdmin,
  onNavigateAbout,
  onOpenConcierge,
}) => {
  const { footer, globalSettings } = useCMS();
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  // Fallback defaults if CMS footer is loading
  const defaultColumns = [
    {
      id: 'col-shop',
      title: 'Shop',
      icon: 'ShoppingBag',
      order: 1,
      links: [
        { id: 'l1', label: 'All Products', url: '/shop', actionKey: 'shop-all' },
        { id: 'l2', label: 'Best Sellers', url: '/shop', actionKey: 'shop-all' },
        { id: 'l3', label: 'New Arrivals', url: '/shop', actionKey: 'shop-all' },
        { id: 'l4', label: 'Personalized Kit', url: '/find-my-shade', actionKey: 'shade-finder' },
      ],
    },
    {
      id: 'col-about',
      title: 'Company',
      icon: 'Heart',
      order: 2,
      links: [
        { id: 'l5', label: 'Our Story', url: '/about', actionKey: 'about' },
        { id: 'l6', label: 'Our Mission', url: '/about', actionKey: 'about' },
        { id: 'l7', label: 'Our Values', url: '/about', actionKey: 'about' },
        { id: 'l16', label: 'Contact Us', url: '/support', actionKey: 'contact' },
      ],
    },
    {
      id: 'col-help',
      title: 'Help',
      icon: 'Headphones',
      order: 3,
      links: [
        { id: 'l8', label: 'FAQ', url: '/support', actionKey: 'support' },
        { id: 'l9', label: 'Contact', url: '/support', actionKey: 'support' },
        { id: 'l10', label: 'Shipping', url: '/legal?policy=shipping', actionKey: 'legal-shipping' },
        { id: 'l11', label: 'Returns', url: '/legal?policy=returns', actionKey: 'legal-returns' },
        { id: 'l12', label: 'Track Order', url: '/order-tracking', actionKey: 'tracking' },
      ],
    },
    {
      id: 'col-legal',
      title: 'Legal',
      icon: 'ShieldCheck',
      order: 4,
      links: [
        { id: 'l13', label: 'Privacy Policy', url: '/legal?policy=privacy', actionKey: 'legal-privacy' },
        { id: 'l14', label: 'Terms of Use', url: '/legal?policy=terms', actionKey: 'legal-terms' },
        { id: 'l15', label: 'Refund Policy', url: '/legal?policy=returns', actionKey: 'legal-returns' },
      ],
    },
    {
      id: 'col-marketplaces',
      title: 'Available On',
      icon: 'Tag',
      order: 5,
      links: [
        { id: 'ml-nykaa', label: 'Nykaa', url: 'https://www.nykaa.com', isExternal: true },
        { id: 'ml-amazon', label: 'Amazon', url: 'https://www.amazon.in', isExternal: true },
        { id: 'ml-flipkart', label: 'Flipkart', url: 'https://www.flipkart.com', isExternal: true },
        { id: 'ml-myntra', label: 'Myntra', url: 'https://www.myntra.com', isExternal: true },
        { id: 'ml-purplle', label: 'Purplle', url: 'https://www.purplle.com', isExternal: true },
      ],
    },
  ];

  const defaultSocialLinks = [
    { platform: 'Instagram', url: 'https://instagram.com/glamirkbeauty', handle: '@glamirkbeauty' },
    { platform: 'YouTube', url: 'https://youtube.com/@glamirkbeauty', handle: 'Glamirk Atelier' },
    { platform: 'Pinterest', url: 'https://pinterest.com/glamirkbeauty', handle: 'Glamirk Beauty' },
  ];

  const defaultPaymentMethods = ['Visa', 'Mastercard', 'RuPay', 'UPI', 'Amex'];

  const defaultTrustBadges = [
    { id: 'tb-secure', icon: 'ShieldCheck', title: '100% Secure', subtitle: 'Payments' },
    { id: 'tb-support', icon: 'Headphones', title: 'Customer Support', subtitle: 'Mon - Sat | 10AM - 7PM' },
  ];

  const columns = footer?.columns && footer.columns.length > 0 ? footer.columns : defaultColumns;
  const socialLinks = footer?.socialLinks && footer.socialLinks.length > 0 ? footer.socialLinks : defaultSocialLinks;
  const paymentMethods = footer?.paymentMethods && footer.paymentMethods.length > 0 ? footer.paymentMethods : defaultPaymentMethods;
  const trustBadges = footer?.trustBadges && footer.trustBadges.length > 0 ? footer.trustBadges : defaultTrustBadges;
  const copyrightText = footer?.copyright || footer?.copyrightText || `© ${new Date().getFullYear()} Glamirk Luxury Beauty. All rights reserved.`;

  // Smart action dispatcher based on link actionKey, url, and label
  const handleFooterLinkClick = (link: CMSFooterLink) => {
    const url = (link.url || '').toLowerCase();
    const label = (link.label || '').toLowerCase();
    const key = (link.actionKey || '').toLowerCase();

    if (link.isExternal || url.startsWith('http://') || url.startsWith('https://')) {
      window.open(link.url, '_blank', 'noopener,noreferrer');
      return;
    }

    // 1. About Us
    if (key === 'about' || url === '/about' || label === 'about us') {
      onNavigateAbout?.();
      return;
    }

    // 1b. Contact -> Concierge popup
    if (label === 'contact' || label === 'contact us' || key === 'contact' || key === 'concierge') {
      if (onOpenConcierge) {
        onOpenConcierge();
        return;
      }
    }

    // 2. Shop Category / Subcategory checks
    if (key === 'shop-lips' || (url.includes('category=makeup') && url.includes('lips')) || label.includes('matte liquid') || label.includes('lipstick')) {
      onNavigateShop('Makeup', 'Lips');
    } else if (key === 'shop-face' || key === 'shop-sindoor' || (url.includes('category=makeup') && url.includes('face')) || label.includes('sindoor')) {
      onNavigateShop('Makeup', 'Face');
    } else if (key === 'shop-cleanser' || (url.includes('category=skin') && url.includes('cleansing')) || label.includes('cleanser') || label.includes('balm to water')) {
      onNavigateShop('Skin', 'Cleansing');
    } else if (key === 'shop-all' || url === '/shop' || label.includes('shop all') || label.includes('all products') || label.includes('best sellers') || label.includes('new arrivals')) {
      onNavigateShop(null, null);
    } else if (url.includes('category=')) {
      const params = new URLSearchParams(url.split('?')[1] || '');
      const cat = params.get('category') || undefined;
      const sub = params.get('sub') || params.get('subCategory') || undefined;
      onNavigateShop(cat, sub);
    }
    // 3. Discovery & AI Tools
    else if (key === 'shade-finder' || url.includes('find-my-shade') || label.includes('diagnostic') || label.includes('shade') || label.includes('personalized kit')) {
      onOpenShadeFinder();
    } else if (key === 'looks' || url.includes('looks') || label.includes('shop the look')) {
      onNavigateShopTheLook();
    } else if (key === 'loyalty' || key === 'my-glam' || url.includes('my-glam') || url.includes('prive') || label.includes('loyalty') || label.includes('privé') || label.includes('account')) {
      onNavigateMyGlam?.();
    } else if (key === 'philosophy' || url.includes('philosophy') || label.includes('philosophy')) {
      onNavigateHome();
    }
    // 4. Editorial & Social
    else if (key === 'journal' || url.includes('journal') || label.includes('journal')) {
      onNavigateJournal?.();
    } else if (key === 'guides' || url.includes('beauty-guides') || label.includes('guide') || label.includes('ritual')) {
      onNavigateGuides?.();
    } else if (key === 'social' || url.includes('social-commerce') || label.includes('social') || label.includes('glamirk on you')) {
      onNavigateSocialCommerce?.();
    } else if (key === 'campaign' || url.includes('campaign') || label.includes('campaign')) {
      const cId = url.includes('sovereign-velvet') ? 'sovereign-velvet-festive' : url.split('/campaign/')[1] || 'sovereign-velvet-festive';
      onNavigateCampaign?.(cId);
    }
    // 5. Client Care
    else if (key === 'tracking' || url.includes('tracking') || label.includes('track')) {
      onNavigateTracking?.();
    } else if (key === 'support' || url.includes('support') || label.includes('support') || label.includes('concierge') || label.includes('faq') || label.includes('contact')) {
      onNavigateSupport?.();
    } else if (key === 'legal-shipping' || (url.includes('shipping') && url.includes('legal'))) {
      onNavigateLegal?.('shipping');
    }
    // 6. Legal Policy Fallback
    else if (url.includes('legal') || url.includes('policy')) {
      if (url.includes('terms') || label.includes('terms')) {
        onNavigateLegal?.('terms');
      } else if (url.includes('shipping') || label.includes('shipping')) {
        onNavigateLegal?.('shipping');
      } else if (url.includes('cookies') || label.includes('cookie')) {
        onNavigateLegal?.('cookies');
      } else if (url.includes('returns') || label.includes('return') || label.includes('refund')) {
        onNavigateLegal?.('returns');
      } else {
        onNavigateLegal?.('privacy');
      }
    } else if (url === '/' || url === '') {
      onNavigateHome();
    } else {
      onNavigateShop(null, null);
    }
  };

  return (
    <footer className="bg-[#171717] text-[#FAF9F6] pt-12 pb-8 border-t border-[#E8D5A8]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Brand Block (mobile — desktop version sits as the left column below) */}
        <div className="md:hidden pb-8 border-b border-[#E8D5A8]/15 space-y-3 max-w-md">
          {globalSettings?.logoUrl ? (
            <img src={globalSettings.logoUrl} alt={globalSettings.logoText || globalSettings.brandName || 'Logo'} className="h-12 w-auto max-w-[200px] object-contain" />
          ) : (
            <span className="font-serif text-xl tracking-widest uppercase text-[#FAF9F6]">{globalSettings?.logoText || 'GLAMIRK'}</span>
          )}
          <p className="text-xs text-[#FAF9F6]/60 leading-relaxed">
            {footer?.tagline || footer?.brandDescription || 'Intelligent color personalization and modern luxury cosmetics calibrated for Indian complexions.'}
          </p>
          {(footer?.contactEmail || footer?.contactPhone) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#FAF9F6]/60">
              {footer?.contactEmail && <span>{footer.contactEmail}</span>}
              {footer?.contactPhone && <span>{footer.contactPhone}</span>}
            </div>
          )}
        </div>

        {/* Mobile Collapsible Accordion Sections (md:hidden) */}
        <div className="md:hidden space-y-2 pb-6">
          {columns.map((col) => {
            const isOpen = openSection === col.id || openSection === col.title;
            const ColIcon = FOOTER_COLUMN_ICON_MAP[col.icon || ''] || Layers;
            return (
              <div key={col.id} className="border-b border-[#E8D5A8]/15 py-2.5">
                <button
                  onClick={() => toggleSection(col.id)}
                  className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-[0.15em] text-[#C9972B] py-1 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ColIcon className="w-3.5 h-3.5 text-[#F05A7E]" />
                    <span>{col.title}</span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#6B6B6B] transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#E3B84B]' : ''}`}
                  />
                </button>
                {isOpen && (
                  <ul className="pt-3 pb-1 space-y-2.5 text-xs text-[#FAF9F6]/70">
                    {col.links.map((lnk) => (
                      <li key={lnk.id}>
                        <button
                          onClick={() => handleFooterLinkClick(lnk)}
                          className="flex items-center gap-1.5 hover:text-[#E3B84B] text-left transition-colors cursor-pointer w-full py-0.5"
                        >
                          <ChevronRight className="w-3 h-3 text-[#C9972B] shrink-0" />
                          <span>{lnk.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Mobile Social */}
          <div className="border-b border-[#E8D5A8]/15 py-2.5">
            <span className="block text-xs font-bold uppercase tracking-[0.15em] text-[#C9972B] py-1">Social</span>
            <ul className="pt-2 space-y-2.5">
              {socialLinks.map((soc) => {
                const Icon = SOCIAL_ICON_MAP[soc.platform] || Globe;
                return (
                  <li key={soc.platform}>
                    <a
                      href={soc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-xs text-[#FAF9F6]/70 hover:text-[#E3B84B] transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 text-[#C9972B]" />
                      <span>{soc.platform}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Desktop Layout: Brand column on the left + Column count adapts to however many admin has configured */}
        <div className="hidden md:flex md:gap-10 pb-10">
          {/* Brand Column (left side, distinct from Social) */}
          <div className="w-64 shrink-0 pr-8 border-r border-[#E8D5A8]/15 space-y-3">
            {globalSettings?.logoUrl ? (
            <img src={globalSettings.logoUrl} alt={globalSettings.logoText || globalSettings.brandName || 'Logo'} className="h-12 w-auto max-w-[200px] object-contain" />
          ) : (
            <span className="font-serif text-xl tracking-widest uppercase text-[#FAF9F6]">{globalSettings?.logoText || 'GLAMIRK'}</span>
          )}
            <p className="text-xs text-[#FAF9F6]/60 leading-relaxed">
              {footer?.tagline || footer?.brandDescription || 'Intelligent color personalization and modern luxury cosmetics calibrated for Indian complexions.'}
            </p>
            {(footer?.contactEmail || footer?.contactPhone) && (
              <div className="flex flex-col gap-1 text-xs text-[#FAF9F6]/60">
                {footer?.contactEmail && <span>{footer.contactEmail}</span>}
                {footer?.contactPhone && <span>{footer.contactPhone}</span>}
              </div>
            )}
          </div>

          <div
            className="flex-1 grid md:divide-x md:divide-[#E8D5A8]/15"
            style={{ gridTemplateColumns: `repeat(${columns.length + 1}, minmax(0, 1fr))` }}
          >
          {columns.map((col, idx) => {
            const ColIcon = FOOTER_COLUMN_ICON_MAP[col.icon || ''] || Layers;
            return (
              <div key={col.id} className={`px-6 ${idx === 0 ? 'pl-0' : ''} space-y-3`}>
                <div className="space-y-2">
                  <ColIcon className="w-4 h-4 text-[#F05A7E]" />
                  <h4 className="text-xs font-bold tracking-[0.15em] uppercase text-[#C9972B]">
                    {col.title}
                  </h4>
                  <div className="w-6 h-[2px] bg-[#C9972B]/60" />
                </div>
                <ul className="space-y-2.5">
                  {col.links.map((lnk) => (
                    <li key={lnk.id}>
                      <button
                        onClick={() => handleFooterLinkClick(lnk)}
                        className="flex items-center gap-1.5 text-xs text-[#FAF9F6]/70 hover:text-[#E3B84B] transition-colors text-left cursor-pointer"
                      >
                        <ChevronRight className="w-3 h-3 text-[#C9972B] shrink-0" />
                        <span>{lnk.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {/* Social Column */}
          <div className="px-6 space-y-3">
            <div className="space-y-2">
              <Share2 className="w-4 h-4 text-[#F05A7E]" />
              <h4 className="text-xs font-bold tracking-[0.15em] uppercase text-[#C9972B]">Follow Us</h4>
              <div className="w-6 h-[2px] bg-[#C9972B]/60" />
            </div>
            <ul className="space-y-3">
              {socialLinks.map((soc) => {
                const Icon = SOCIAL_ICON_MAP[soc.platform] || Globe;
                return (
                  <li key={soc.platform}>
                    <a
                      href={soc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-xs text-[#FAF9F6]/70 hover:text-[#E3B84B] transition-colors"
                    >
                      <span className="w-7 h-7 rounded-md bg-[#0B0B0B] border border-[#E8D5A8]/20 flex items-center justify-center text-[#C9972B] shrink-0">
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span>{soc.platform}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright + Payment Methods + Trust Badges */}
        <div className="border-t border-[#E8D5A8]/15 pt-6 flex flex-col lg:flex-row items-center justify-between gap-y-4 gap-x-8 lg:pr-44">
          <p className="text-xs text-[#FAF9F6]/60 text-center lg:text-left shrink-0">{copyrightText}</p>

          {/* Payment method badges */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {paymentMethods.map((pm) => (
              <span
                key={pm}
                className="px-2.5 py-1.5 rounded-md bg-white text-[10px] font-bold text-[#121212] border border-[#E8D5A8]/40"
              >
                {pm}
              </span>
            ))}
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-5 shrink-0">
            {trustBadges.map((badge) => {
              const Icon = TRUST_ICON_MAP[badge.icon] || ShieldCheck;
              return (
                <div key={badge.id} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-[#C9972B] shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold text-[#FAF9F6] leading-snug">{badge.title}</p>
                    <p className="text-[9px] text-[#FAF9F6]/50 leading-snug">{badge.subtitle}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </footer>
  );
};
