import React, { useState } from 'react';
import { ArrowRight, Check, Sparkles, Flower2, ChevronDown } from 'lucide-react';
import { useCMS } from '../context/CMSContext';
import { CMSFooterLink } from '../types';

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
}

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
}) => {
  const { footer } = useCMS();
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setIsSubscribed(true);
      setEmail('');
    }
  };

  // Fallback defaults if CMS footer is loading
  const defaultColumns = [
    {
      id: 'col-shop',
      title: 'Shop',
      order: 1,
      links: [
        { id: 'l1', label: 'Matte Liquid Lipsticks', url: '/shop?category=Makeup&sub=Lips', actionKey: 'shop-lips' },
        { id: 'l2', label: 'Luxury Sindoor', url: '/shop?category=Makeup&sub=Face', actionKey: 'shop-sindoor' },
        { id: 'l3', label: 'Balm To Water Cleanser', url: '/shop?category=Skin&sub=Cleansing', actionKey: 'shop-cleanser' },
        { id: 'l4', label: 'Shop All Creations', url: '/shop', actionKey: 'shop-all' },
      ],
    },
    {
      id: 'col-editorial',
      title: 'Editorial & Journal',
      order: 2,
      links: [
        { id: 'l5', label: 'The Glamirk Journal', url: '/journal', actionKey: 'journal' },
        { id: 'l6', label: 'Beauty Guides & Rituals', url: '/beauty-guides', actionKey: 'guides' },
        { id: 'l7', label: 'Glamirk On You (Social)', url: '/social-commerce', actionKey: 'social' },
        { id: 'l8', label: 'Sovereign Velvet Campaign', url: '/campaign/sovereign-velvet-festive', actionKey: 'campaign' },
      ],
    },
    {
      id: 'col-discovery',
      title: 'Discovery & AI',
      order: 3,
      links: [
        { id: 'l9', label: 'Find Your Shade Diagnostic', url: '/find-my-shade', actionKey: 'shade-finder' },
        { id: 'l10', label: 'Shop The Look', url: '/looks', actionKey: 'looks' },
        { id: 'l11', label: 'Glamirk Privé Loyalty', url: '/my-glam', actionKey: 'loyalty' },
        { id: 'l12', label: 'Atelier Philosophy', url: '/#philosophy', actionKey: 'philosophy' },
      ],
    },
    {
      id: 'col-care',
      title: 'Client Care',
      order: 4,
      links: [
        { id: 'l13', label: 'Concierge Support & FAQ', url: '/support', actionKey: 'support' },
        { id: 'l14', label: 'Track Your Order', url: '/order-tracking', actionKey: 'tracking' },
        { id: 'l15', label: 'Shipping & Returns', url: '/legal?policy=shipping', actionKey: 'legal-shipping' },
        { id: 'l16', label: 'My Glam Account', url: '/my-glam', actionKey: 'my-glam' },
      ],
    },
  ];

  const defaultLegalLinks = [
    { id: 'leg-priv', label: 'Privacy Policy', url: '/legal?policy=privacy', policyKey: 'privacy' },
    { id: 'leg-term', label: 'Terms of Service', url: '/legal?policy=terms', policyKey: 'terms' },
    { id: 'leg-ship', label: 'Shipping Policy', url: '/legal?policy=shipping', policyKey: 'shipping' },
    { id: 'leg-cook', label: 'Cookie Policy', url: '/legal?policy=cookies', policyKey: 'cookies' },
  ];

  const columns = footer?.columns && footer.columns.length > 0 ? footer.columns : defaultColumns;
  const legalLinks = footer?.legalLinks && footer.legalLinks.length > 0 ? footer.legalLinks : defaultLegalLinks;
  const brandTagline = footer?.tagline || footer?.brandDescription || 'Intelligent color personalization and modern luxury cosmetics calibrated for Indian complexions.';
  const newsletterTitle = footer?.newsletterTitle || 'Enter The Glam';
  const newsletterSubtitle = footer?.newsletterSubtitle || 'Be the first to discover new cosmetic launches, private shade previews, and editorial beauty rituals.';
  const copyrightText = footer?.copyright || footer?.copyrightText || `© ${new Date().getFullYear()} Glamirk Beauty Private Limited. All rights reserved.`;

  // Smart action dispatcher based on link actionKey, url, and label
  const handleFooterLinkClick = (link: CMSFooterLink) => {
    const url = (link.url || '').toLowerCase();
    const label = (link.label || '').toLowerCase();
    const key = (link.actionKey || '').toLowerCase();

    if (link.isExternal || url.startsWith('http://') || url.startsWith('https://')) {
      window.open(link.url, '_blank', 'noopener,noreferrer');
      return;
    }

    // 1. Shop Category / Subcategory checks
    if (key === 'shop-lips' || (url.includes('category=makeup') && url.includes('lips')) || label.includes('matte liquid') || label.includes('lipstick')) {
      onNavigateShop('Makeup', 'Lips');
    } else if (key === 'shop-face' || key === 'shop-sindoor' || (url.includes('category=makeup') && url.includes('face')) || label.includes('sindoor')) {
      onNavigateShop('Makeup', 'Face');
    } else if (key === 'shop-cleanser' || (url.includes('category=skin') && url.includes('cleansing')) || label.includes('cleanser') || label.includes('balm to water')) {
      onNavigateShop('Skin', 'Cleansing');
    } else if (key === 'shop-all' || url === '/shop' || label.includes('shop all')) {
      onNavigateShop(null, null);
    } else if (url.includes('category=')) {
      const params = new URLSearchParams(url.split('?')[1] || '');
      const cat = params.get('category') || undefined;
      const sub = params.get('sub') || params.get('subCategory') || undefined;
      onNavigateShop(cat, sub);
    }
    // 2. Discovery & AI Tools
    else if (key === 'shade-finder' || url.includes('find-my-shade') || label.includes('diagnostic') || label.includes('shade')) {
      onOpenShadeFinder();
    } else if (key === 'looks' || url.includes('looks') || label.includes('shop the look')) {
      onNavigateShopTheLook();
    } else if (key === 'loyalty' || key === 'my-glam' || url.includes('my-glam') || url.includes('prive') || label.includes('loyalty') || label.includes('privé') || label.includes('account')) {
      onNavigateMyGlam?.();
    } else if (key === 'philosophy' || url.includes('philosophy') || label.includes('philosophy')) {
      onNavigateHome();
    }
    // 3. Editorial & Social
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
    // 4. Client Care
    else if (key === 'tracking' || url.includes('tracking') || label.includes('track')) {
      onNavigateTracking?.();
    } else if (key === 'support' || url.includes('support') || label.includes('support') || label.includes('concierge') || label.includes('faq')) {
      onNavigateSupport?.();
    } else if (key === 'legal-shipping' || url.includes('shipping') || label.includes('shipping')) {
      onNavigateLegal?.('shipping');
    }
    // 5. Legal Policy Fallback
    else if (url.includes('legal') || url.includes('policy')) {
      if (url.includes('terms') || label.includes('terms')) {
        onNavigateLegal?.('terms');
      } else if (url.includes('shipping') || label.includes('shipping')) {
        onNavigateLegal?.('shipping');
      } else if (url.includes('cookies') || label.includes('cookie')) {
        onNavigateLegal?.('cookies');
      } else if (url.includes('returns') || label.includes('return')) {
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

  const handleLegalLinkClick = (leg: { id: string; label: string; url: string; policyKey?: string }) => {
    const key =
      leg.policyKey ||
      (leg.url.includes('policy=') ? leg.url.split('policy=')[1] : '') ||
      (leg.label.toLowerCase().includes('terms')
        ? 'terms'
        : leg.label.toLowerCase().includes('ship')
        ? 'shipping'
        : leg.label.toLowerCase().includes('cookie')
        ? 'cookies'
        : leg.label.toLowerCase().includes('return')
        ? 'returns'
        : 'privacy');
    onNavigateLegal?.(key as any);
  };

  return (
    <footer className="bg-[#FCE8ED]/80 text-[#121212] pt-12 sm:pt-16 pb-16 sm:pb-12 border-t border-[#E8D5A8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Newsletter Strip */}
        <div id="stay-in-glam-section" className="pb-8 sm:pb-12 mb-8 sm:mb-12 border-b border-[#E8D5A8] grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-[#E8D5A8] shadow-xs">
          <div className="lg:col-span-6 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FCE8ED] border border-[#E8D5A8] rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-[#F05A7E]" />
              <span className="text-[10px] sm:text-[10.5px] font-bold tracking-wider uppercase text-[#F05A7E]">
                Exclusive Invitation
              </span>
            </div>
            <h3 className="text-xl sm:text-3xl font-extrabold text-[#121212] leading-tight">
              {newsletterTitle}
            </h3>
            <p className="text-xs sm:text-sm text-[#6B6B6B] max-w-md">
              {newsletterSubtitle}
            </p>
          </div>

          <div className="lg:col-span-6">
            {isSubscribed ? (
              <div className="p-4 bg-[#FCE8ED] rounded-2xl border border-[#F05A7E]/30 text-[#F05A7E] flex items-center gap-3">
                <Check className="w-5 h-5 text-[#F05A7E] flex-shrink-0" />
                <span className="text-xs tracking-wide font-bold">
                  Welcome to Glamirk! You are now subscribed to our private guest list.
                </span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="newsletter-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address..."
                  className="flex-grow px-4 py-3 bg-[#FCE8ED] rounded-full border border-[#E8D5A8] text-xs sm:text-sm text-[#121212] placeholder-[#6B6B6B] focus:outline-none focus:border-[#F05A7E] focus:bg-white transition-colors"
                />
                <button
                  id="newsletter-join-btn"
                  type="submit"
                  className="px-7 py-3 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold rounded-full transition-all flex items-center justify-center gap-2 flex-shrink-0 shadow-[0_4px_14px_rgba(240,90,126,0.25)] hover:scale-102 active:scale-95 cursor-pointer"
                >
                  <span>Subscribe</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Mobile Collapsible Accordion Sections (md:hidden) */}
        <div className="md:hidden space-y-3 pb-8 border-b border-[#E8D5A8]">
          
          {/* Mobile Brand Info */}
          <div className="pb-3 border-b border-[#E8D5A8]/60 space-y-2">
            <button onClick={onNavigateHome} className="text-left cursor-pointer flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#FCE8ED] border border-[#E8D5A8] flex items-center justify-center text-[#F05A7E]">
                <Flower2 className="w-3.5 h-3.5 text-[#F05A7E]" />
              </div>
              <span className="text-lg font-bold tracking-tight text-[#121212]">
                Glamirk Luxury Beauty
              </span>
            </button>
            <p className="text-xs text-[#6B6B6B] leading-relaxed">
              {brandTagline}
            </p>
          </div>

          {/* Dynamic Accordions from CMS Columns */}
          {columns.map((col) => {
            const isOpen = openSection === col.id || openSection === col.title;
            return (
              <div key={col.id} className="border-b border-[#E8D5A8]/60 py-2.5">
                <button
                  onClick={() => toggleSection(col.id)}
                  className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#121212] py-1 cursor-pointer"
                >
                  <span className={isOpen ? 'text-[#F05A7E]' : ''}>{col.title}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#6B6B6B] transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[#F05A7E]' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <ul className="pt-3 pb-1 space-y-2.5 text-xs text-[#6B6B6B]">
                    {col.links.map((lnk) => (
                      <li key={lnk.id}>
                        <button
                          onClick={() => handleFooterLinkClick(lnk)}
                          className="hover:text-[#F05A7E] text-left transition-colors cursor-pointer block w-full py-0.5"
                        >
                          {lnk.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop Multi-Column Main Footer Links (hidden md:grid) */}
        <div className="hidden md:grid grid-cols-2 md:grid-cols-5 gap-8 sm:gap-10 pb-12 border-b border-[#E8D5A8]">
          
          {/* Col 1: Brand Essence */}
          <div className="col-span-2 md:col-span-1 space-y-3">
            <button onClick={onNavigateHome} className="text-left cursor-pointer flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#FCE8ED] border border-[#E8D5A8] flex items-center justify-center text-[#F05A7E]">
                <Flower2 className="w-3.5 h-3.5 text-[#F05A7E]" />
              </div>
              <span className="text-xl font-bold tracking-tight text-[#121212] hover:text-[#F05A7E] transition-colors">
                Glamirk
              </span>
            </button>
            <p className="text-xs text-[#6B6B6B] leading-relaxed">
              {brandTagline}
            </p>
            <div className="pt-1 text-[11px] text-[#6B6B6B] space-y-0.5 font-medium">
              <p>Corporate: Mumbai &amp; New Delhi, India</p>
            </div>
          </div>

          {/* Dynamic Columns from CMS */}
          {columns.map((col) => (
            <div key={col.id} className="space-y-3">
              <h4 className="text-xs font-bold tracking-wider uppercase text-[#F05A7E]">
                {col.title}
              </h4>
              <ul className="space-y-2 text-xs text-[#6B6B6B]">
                {col.links.map((lnk) => (
                  <li key={lnk.id}>
                    <button
                      onClick={() => handleFooterLinkClick(lnk)}
                      className="hover:text-[#F05A7E] transition-colors text-left cursor-pointer block"
                    >
                      {lnk.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        </div>

        {/* Bottom Legal Copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B6B6B]">
          <p>{copyrightText}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-3 sm:gap-4">
            {legalLinks.map((leg, idx) => (
              <React.Fragment key={leg.id || idx}>
                {idx > 0 && <span className="text-[#E8D5A8]">•</span>}
                <button
                  onClick={() => handleLegalLinkClick(leg)}
                  className="hover:text-[#F05A7E] cursor-pointer transition-colors"
                >
                  {leg.label}
                </button>
              </React.Fragment>
            ))}
            {onNavigateAdmin && (
              <>
                <span className="text-[#E8D5A8]">•</span>
                <button
                  onClick={onNavigateAdmin}
                  className="hover:text-[#C9972B] font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] hover:underline cursor-pointer transition-colors"
                >
                  Admin Portal
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </footer>
  );
};



