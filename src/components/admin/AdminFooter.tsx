/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSFooterConfig, CMSFooterColumn, CMSFooterLink, CMSLegalPolicyContent } from '../../types';
import { FOOTER_COLUMN_ICON_MAP } from '../layout/Footer';
import {
  Layers,
  Save,
  Check,
  Plus,
  Trash2,
  FileText,
  ShieldCheck,
  Truck,
  RotateCcw,
  Cookie,
  Sparkles,
  Link as LinkIcon,
  MoveUp,
  MoveDown,
  RotateCcw as ResetIcon,
  ExternalLink,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

const DEFAULT_PRESET_FOOTER: CMSFooterConfig = {
  brandDescription:
    'Glamirk Beauty Private Limited is dedicated to modern luxury beauty, thoughtful formulations, and intelligent color personalization calibrated for Indian complexions.',
  tagline: 'Intelligent color personalization and modern luxury cosmetics calibrated for Indian complexions.',
  newsletterTitle: 'Enter The Glam',
  newsletterSubtitle: 'Be the first to discover new cosmetic launches, private shade previews, and editorial beauty rituals.',
  copyright: '© 2026 Glamirk Beauty Private Limited. All rights reserved.',
  copyrightText: '© 2026 Glamirk Beauty Private Limited. All rights reserved.',
  columns: [
    {
      id: 'col-shop',
      title: 'Shop',
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
      order: 4,
      links: [
        { id: 'l13', label: 'Privacy Policy', url: '/legal?policy=privacy', actionKey: 'legal-privacy' },
        { id: 'l14', label: 'Terms of Use', url: '/legal?policy=terms', actionKey: 'legal-terms' },
        { id: 'l15', label: 'Refund Policy', url: '/legal?policy=returns', actionKey: 'legal-returns' },
      ],
    },
  ],
  socialLinks: [
    { platform: 'Instagram', url: 'https://instagram.com/glamirkbeauty', handle: '@glamirkbeauty' },
    { platform: 'YouTube', url: 'https://youtube.com/@glamirkbeauty', handle: 'Glamirk Atelier' },
    { platform: 'Pinterest', url: 'https://pinterest.com/glamirkbeauty', handle: 'Glamirk Beauty' },
  ],
  legalLinks: [
    { id: 'leg-priv', label: 'Privacy Policy', url: '/legal?policy=privacy', policyKey: 'privacy' },
    { id: 'leg-term', label: 'Terms of Service', url: '/legal?policy=terms', policyKey: 'terms' },
    { id: 'leg-ship', label: 'Shipping Policy', url: '/legal?policy=shipping', policyKey: 'shipping' },
    { id: 'leg-cook', label: 'Cookie Policy', url: '/legal?policy=cookies', policyKey: 'cookies' },
  ],
  paymentMethods: ['Visa', 'Mastercard', 'RuPay', 'UPI', 'Amex'],
  trustBadges: [
    { id: 'tb-secure', icon: 'ShieldCheck', title: '100% Secure', subtitle: 'Payments' },
    { id: 'tb-support', icon: 'Headphones', title: 'Customer Support', subtitle: 'Mon - Sat | 10AM - 7PM' },
  ],
  legalPolicies: {
    privacy: {
      id: 'privacy',
      title: 'Privacy & Data Protection Policy',
      subtitle: 'Data protection, camera privacy & client confidentiality',
      effectiveDate: '2026 Current Production Release',
      content: 'Glamirk Beauty Private Limited respects the personal privacy of our patrons. We design all client interactions, shade discovery consultations, and shopping flows with privacy-by-design principles.',
      sections: [
        {
          heading: '1. Our Privacy Philosophy',
          body: 'Glamirk Beauty Private Limited respects the personal privacy of our patrons. We design all client interactions, shade discovery consultations, and shopping flows with privacy-by-design principles. We collect only the information necessary to fulfill orders, personalize shade selections, and maintain client loyalty relationships.',
        },
        {
          heading: '2. Virtual Try-On & Camera Image Processing',
          body: 'Our Virtual Try-On and Find My Shade camera diagnostics process facial geometry and skin tone cues purely locally within your browser session using real-time canvas calculations. We do not upload, retain, distribute, or sell your biometric facial data or uploaded photos to external servers.',
        },
        {
          heading: '3. Information We Collect',
          body: 'When you place an order or create a Glamirk Privé profile, we collect contact details (name, email address, phone number for courier notifications), delivery coordinates (shipping address and postal PIN code), and transaction references.',
        },
        {
          heading: '4. Security & Data Protection',
          body: 'All communications are protected via 256-bit TLS encryption. Client profile data is stored on secure, monitored infrastructure compliant with ISO 27001 standards.',
        },
      ],
    },
    terms: {
      id: 'terms',
      title: 'Terms of Service & Atelier Conditions',
      subtitle: 'Atelier standards, intellectual property & order terms',
      effectiveDate: '2026 Current Production Release',
      content: 'Welcome to Glamirk Beauty. By accessing our atelier website, diagnostic tools, or purchasing our luxury cosmetic creations, you agree to the following terms and conditions.',
      sections: [
        {
          heading: '1. Acceptance of Terms',
          body: 'By accessing or ordering from Glamirk Beauty Private Limited, you confirm that you are at least 18 years of age or possess legal parental consent.',
        },
        {
          heading: '2. Intellectual Property & Formulation Integrity',
          body: 'All formulations, shade names (e.g. Sovereign Velvet, Royal Ochre), packaging architecture, visual assets, and diagnostic algorithms are the exclusive intellectual property of Glamirk Beauty Private Limited.',
        },
        {
          heading: '3. Orders, Pricing & Authenticity',
          body: 'All prices listed on Glamirk.com are in Indian Rupees (INR) inclusive of applicable GST taxes. We guarantee 100% authentic, tamper-evident sealed luxury products dispatched directly from our certified facilities.',
        },
        {
          heading: '4. Cosmetic Safety & Patch Testing',
          body: 'While our products undergo rigorous dermatological testing for sensitive complexions, we recommend performing a 24-hour patch test before full application.',
        },
      ],
    },
    shipping: {
      id: 'shipping',
      title: 'Luxury Shipping & White-Glove Delivery',
      subtitle: 'Pan-India transit, temperature control & dispatch times',
      effectiveDate: '2026 Current Production Release',
      content: 'We take extraordinary care to ensure your Glamirk creations arrive in flawless, pristine condition through temperature-regulated logistics across India.',
      sections: [
        {
          heading: '1. Complimentary Shipping Privilege',
          body: 'We offer complimentary expedited express shipping across all pin codes in India on all orders valued at ₹999 and above. Orders below ₹999 incur a flat nominal courier fee of ₹99.',
        },
        {
          heading: '2. Dispatch Timelines',
          body: 'Orders placed before 2:00 PM IST on business days are prepared and handed to our premium courier partners within 24 hours. Metro deliveries typically arrive within 2-3 business days.',
        },
        {
          heading: '3. Temperature-Safe Packaging',
          body: 'To protect delicate botanicals and velvety lip pigments from thermal degradation during transit, every order is cushioned in insulated, eco-conscious bespoke protective casing.',
        },
        {
          heading: '4. Real-Time Tracking & Notifications',
          body: 'Once dispatched, you will receive real-time SMS and WhatsApp notifications with live GPS tracking links to monitor your courier.',
        },
      ],
    },
    cookies: {
      id: 'cookies',
      title: 'Cookie Preference & Technology Transparency',
      subtitle: 'Session state, shade preferences & analytical tracking',
      effectiveDate: '2026 Current Production Release',
      content: 'Our cookie notice outlines how we utilize cookies and local browser storage to provide personalized beauty recommendations.',
      sections: [
        {
          heading: '1. What Are Cookies',
          body: 'Cookies are small text identifiers stored on your device that enable our atelier website to remember your diagnostic shade matches, bag items, and language preferences.',
        },
        {
          heading: '2. Essential Functional Cookies',
          body: 'These cookies are required for fundamental e-commerce operations such as retaining items in your shopping bag, secure checkout authentication, and currency formatting.',
        },
        {
          heading: '3. Personalization & Diagnostic Cookies',
          body: 'With your consent, these cookies retain your undertone diagnostic results (e.g. Deep Olive, Warm Golden) so you never need to re-calibrate when browsing new launches.',
        },
        {
          heading: '4. Managing Preferences',
          body: 'You may adjust or clear your cookie preferences anytime via your browser settings without affecting core order fulfillment.',
        },
      ],
    },
    returns: {
      id: 'returns',
      title: 'Returns, Exchanges & Quality Guarantee',
      subtitle: 'Hygiene standards, replacements & claims procedure',
      effectiveDate: '2026 Current Production Release',
      content: 'Because our cosmetics are crafted with uncompromised hygiene standards, we uphold clear guidelines regarding returns and exchanges.',
      sections: [
        {
          heading: '1. 7-Day Replacement Guarantee',
          body: 'If your order arrives damaged, defective, or incorrect, notify our Concierge team within 7 days of delivery for an immediate complimentary express replacement.',
        },
        {
          heading: '2. Hygiene Safety Standards',
          body: 'Due to cosmetic health and safety standards, opened or used makeup and skincare items cannot be accepted for routine return once safety seals are broken.',
        },
        {
          heading: '3. Claim Resolution',
          body: 'Simply share photos of the damaged unit to care@glamirk.com or WhatsApp +91 800 452 6475 for instant priority processing.',
        },
      ],
    },
  },
};

type ActiveSubTab = 'columns' | 'policies' | 'brand' | 'social' | 'trust';

const AVAILABLE_PAYMENT_METHODS = ['Visa', 'Mastercard', 'RuPay', 'UPI', 'Amex', 'PayPal', 'GPay'];
const AVAILABLE_TRUST_ICONS = ['ShieldCheck', 'RotateCcw', 'Headphones', 'Truck', 'Sparkles', 'Lock'];
const AVAILABLE_COLUMN_ICONS = Object.keys(FOOTER_COLUMN_ICON_MAP);

export const AdminFooter: React.FC = () => {
  const { footer, saveFooter } = useCMS();
  const [footerState, setFooterState] = useState<CMSFooterConfig>(footer || DEFAULT_PRESET_FOOTER);
  const [activeSubTab, setActiveSubTab] = useState<ActiveSubTab>('columns');
  const [selectedPolicyKey, setSelectedPolicyKey] = useState<string>('privacy');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  useEffect(() => {
    if (footer) {
      // Merge with safe defaults if some fields are missing
      setFooterState({
        ...DEFAULT_PRESET_FOOTER,
        ...footer,
        columns: footer.columns && footer.columns.length > 0 ? footer.columns : DEFAULT_PRESET_FOOTER.columns,
        legalLinks: footer.legalLinks && footer.legalLinks.length > 0 ? footer.legalLinks : DEFAULT_PRESET_FOOTER.legalLinks,
        legalPolicies: footer.legalPolicies || DEFAULT_PRESET_FOOTER.legalPolicies,
        paymentMethods: footer.paymentMethods && footer.paymentMethods.length > 0 ? footer.paymentMethods : DEFAULT_PRESET_FOOTER.paymentMethods,
        trustBadges: footer.trustBadges && footer.trustBadges.length > 0 ? footer.trustBadges : DEFAULT_PRESET_FOOTER.trustBadges,
      });
    }
  }, [footer]);

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await saveFooter(footerState);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const handleResetToPreset = () => {
    if (window.confirm('Reset footer columns, payment methods, trust badges, and legal policy templates to official Glamirk configuration?')) {
      setFooterState(DEFAULT_PRESET_FOOTER);
    }
  };

  // Column operations
  const handleUpdateColumnTitle = (colIndex: number, newTitle: string) => {
    const updated = [...(footerState.columns || [])];
    updated[colIndex] = { ...updated[colIndex], title: newTitle };
    setFooterState({ ...footerState, columns: updated });
  };

  const handleAddColumn = () => {
    const newColId = `col-${Date.now()}`;
    const newCol: CMSFooterColumn = {
      id: newColId,
      title: 'New Section',
      icon: 'Layers',
      order: (footerState.columns || []).reduce((max, c) => Math.max(max, c.order || 0), 0) + 1,
      links: [{ id: `l-${Date.now()}`, label: 'New Link', url: '/shop' }],
    };
    setFooterState({ ...footerState, columns: [...(footerState.columns || []), newCol] });
    setExpandedCol(newColId);
  };

  const handleDeleteColumn = (colIndex: number) => {
    const updated = (footerState.columns || []).filter((_, idx) => idx !== colIndex);
    setFooterState({ ...footerState, columns: updated });
  };

  const handleUpdateColumnIcon = (colIndex: number, icon: string) => {
    const updated = [...(footerState.columns || [])];
    updated[colIndex] = { ...updated[colIndex], icon };
    setFooterState({ ...footerState, columns: updated });
  };

  // Link operations
  const handleAddLink = (colIndex: number) => {
    const updated = [...(footerState.columns || [])];
    const newLink: CMSFooterLink = {
      id: `l-${Date.now()}`,
      label: 'New Link Title',
      url: '/shop',
      actionKey: 'custom',
    };
    updated[colIndex].links = [...(updated[colIndex].links || []), newLink];
    setFooterState({ ...footerState, columns: updated });
  };

  const handleUpdateLink = (colIndex: number, linkIndex: number, updates: Partial<CMSFooterLink>) => {
    const updated = [...(footerState.columns || [])];
    const colLinks = [...(updated[colIndex].links || [])];
    colLinks[linkIndex] = { ...colLinks[linkIndex], ...updates };
    updated[colIndex].links = colLinks;
    setFooterState({ ...footerState, columns: updated });
  };

  const handleDeleteLink = (colIndex: number, linkIndex: number) => {
    const updated = [...(footerState.columns || [])];
    updated[colIndex].links = (updated[colIndex].links || []).filter((_, idx) => idx !== linkIndex);
    setFooterState({ ...footerState, columns: updated });
  };

  // Policy operations
  const currentPolicy: CMSLegalPolicyContent =
    footerState.legalPolicies?.[selectedPolicyKey] ||
    DEFAULT_PRESET_FOOTER.legalPolicies?.[selectedPolicyKey] || {
      id: selectedPolicyKey,
      title: 'Legal Policy',
      subtitle: '',
      effectiveDate: '2026 Current Release',
      content: '',
      sections: [],
    };

  const handleUpdatePolicyField = (field: keyof CMSLegalPolicyContent, value: any) => {
    const policies = { ...(footerState.legalPolicies || DEFAULT_PRESET_FOOTER.legalPolicies || {}) };
    policies[selectedPolicyKey] = {
      ...currentPolicy,
      [field]: value,
    };
    setFooterState({ ...footerState, legalPolicies: policies });
  };

  const handleAddPolicySection = () => {
    const sections = [...(currentPolicy.sections || [])];
    sections.push({
      heading: `${sections.length + 1}. New Clause Heading`,
      body: 'Add the complete terms, criteria, and legal statement here...',
    });
    handleUpdatePolicyField('sections', sections);
  };

  const handleUpdatePolicySection = (sectionIndex: number, field: 'heading' | 'body', value: string) => {
    const sections = [...(currentPolicy.sections || [])];
    sections[sectionIndex] = { ...sections[sectionIndex], [field]: value };
    handleUpdatePolicyField('sections', sections);
  };

  const handleDeletePolicySection = (sectionIndex: number) => {
    const sections = (currentPolicy.sections || []).filter((_, idx) => idx !== sectionIndex);
    handleUpdatePolicyField('sections', sections);
  };

  // Legal Bottom Links operations
  const handleUpdateLegalLink = (idx: number, updates: Partial<{ label: string; url: string; policyKey: string }>) => {
    const updated = [...(footerState.legalLinks || [])];
    updated[idx] = { ...updated[idx], ...updates };
    setFooterState({ ...footerState, legalLinks: updated });
  };

  // Social link operations
  const handleAddSocialLink = () => {
    const updated = [...(footerState.socialLinks || []), { platform: 'New Platform', url: 'https://', handle: '' }];
    setFooterState({ ...footerState, socialLinks: updated });
  };

  const handleUpdateSocialPlatform = (idx: number, platform: string) => {
    const updated = [...(footerState.socialLinks || [])];
    updated[idx] = { ...updated[idx], platform };
    setFooterState({ ...footerState, socialLinks: updated });
  };

  const handleDeleteSocialLink = (idx: number) => {
    const updated = (footerState.socialLinks || []).filter((_, i) => i !== idx);
    setFooterState({ ...footerState, socialLinks: updated });
  };

  // Payment method operations
  const handleTogglePaymentMethod = (method: string) => {
    const current = footerState.paymentMethods || [];
    const updated = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    setFooterState({ ...footerState, paymentMethods: updated });
  };

  // Trust badge operations
  const handleAddTrustBadge = () => {
    const newBadge = { id: `tb-${Date.now()}`, icon: 'ShieldCheck', title: 'New Badge', subtitle: 'Description' };
    setFooterState({ ...footerState, trustBadges: [...(footerState.trustBadges || []), newBadge] });
  };

  const handleUpdateTrustBadge = (idx: number, updates: Partial<{ icon: string; title: string; subtitle: string }>) => {
    const updated = [...(footerState.trustBadges || [])];
    updated[idx] = { ...updated[idx], ...updates };
    setFooterState({ ...footerState, trustBadges: updated });
  };

  const handleDeleteTrustBadge = (idx: number) => {
    const updated = (footerState.trustBadges || []).filter((_, i) => i !== idx);
    setFooterState({ ...footerState, trustBadges: updated });
  };

  return (
    <div className="space-y-6">
      {/* Header with Save & Action Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#E8D5A8]/20">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-xl sm:text-2xl text-[#FAF9F6]">Real-Time Footer &amp; Policy Editor</h2>
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/40 rounded-full font-bold">
              Live Sync
            </span>
          </div>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Real-time control over all footer columns (Shop, About, Help, Legal), payment methods, trust badges &amp; Legal Policies.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleResetToPreset}
            type="button"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-[#171717] hover:bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            title="Reset to official preset"
          >
            <ResetIcon className="w-3.5 h-3.5" />
            <span>Reset Official Preset</span>
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            type="button"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-[#F05A7E] hover:bg-[#F05A7E] active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-[0_4px_14px_rgba(240,90,126,0.3)] disabled:opacity-50"
          >
            {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Saved Live!' : isSaving ? 'Saving...' : 'Save & Publish Live'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex overflow-x-auto gap-2 p-1.5 bg-[#171717] rounded-xl border border-[#E8D5A8]/20 no-scrollbar">
        <button
          onClick={() => setActiveSubTab('columns')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'columns'
              ? 'bg-[#F05A7E] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#FAF9F6] hover:bg-[#171717]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Footer Columns</span>
        </button>

        <button
          onClick={() => setActiveSubTab('policies')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'policies'
              ? 'bg-[#F05A7E] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#FAF9F6] hover:bg-[#171717]'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Legal Policies (Privacy, Terms, Shipping, Cookies)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('brand')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'brand'
              ? 'bg-[#F05A7E] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#FAF9F6] hover:bg-[#171717]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Brand &amp; Newsletter</span>
        </button>

        <button
          onClick={() => setActiveSubTab('social')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'social'
              ? 'bg-[#F05A7E] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#FAF9F6] hover:bg-[#171717]'
          }`}
        >
          <LinkIcon className="w-4 h-4" />
          <span>Social Handles</span>
        </button>

        <button
          onClick={() => setActiveSubTab('trust')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'trust'
              ? 'bg-[#F05A7E] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#FAF9F6] hover:bg-[#171717]'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Payments &amp; Trust Badges</span>
        </button>
      </div>

      {/* TAB 1: FOOTER COLUMNS & LINKS */}
      {activeSubTab === 'columns' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-[#171717] rounded-xl border border-[#E8D5A8]/20">
            <div>
              <h3 className="font-serif text-base text-[#FAF9F6]">Navigation Columns &amp; Links</h3>
              <p className="text-xs text-[#6B6B6B] mt-0.5">
                Edit column headers (Shop, About, Help, Legal) and each linked destination.
              </p>
            </div>
            <button
              onClick={handleAddColumn}
              type="button"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#171717] hover:bg-[#0B0B0B] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
              <span>Add Column</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(footerState.columns || []).map((col, colIdx) => {
              const isColExpanded = expandedCol === col.id;
              return (
                <div
                  key={col.id || colIdx}
                  className="bg-[#171717] border border-[#E8D5A8]/25 rounded-2xl p-5 space-y-4 shadow-sm"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#E8D5A8]/15">
                    <div className="flex-1 flex items-center gap-2">
                      <select
                        value={col.icon || 'Layers'}
                        onChange={(e) => handleUpdateColumnIcon(colIdx, e.target.value)}
                        title="Column Icon"
                        className="w-9 h-9 shrink-0 px-1 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[#F05A7E] text-xs focus:border-[#F05A7E] focus:outline-none"
                      >
                        {AVAILABLE_COLUMN_ICONS.map((icon) => (
                          <option key={icon} value={icon}>{icon}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={col.title}
                        onChange={(e) => handleUpdateColumnTitle(colIdx, e.target.value)}
                        placeholder="Column Title (e.g. Shop, Editorial)"
                        className="flex-1 px-3 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-sm font-bold text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={() => handleDeleteColumn(colIdx)}
                      className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
                      title="Delete Column"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Links List for this Column */}
                  <div className="space-y-3">
                    {(col.links || []).map((link, linkIdx) => (
                      <div
                        key={link.id || linkIdx}
                        className="p-3 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-2 hover:border-[#E8D5A8]/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={link.label}
                            onChange={(e) => handleUpdateLink(colIdx, linkIdx, { label: e.target.value })}
                            placeholder="Link Title (e.g. Matte Liquid Lipsticks)"
                            className="flex-1 px-2.5 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs font-semibold text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                          />
                          <button
                            onClick={() => handleDeleteLink(colIdx, linkIdx)}
                            className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
                            title="Remove Link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {/* Route / Action Presets */}
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-0.5">
                              Action Destination
                            </label>
                            <select
                              value={link.actionKey || (link.url.includes('category=') ? 'category' : 'custom')}
                              onChange={(e) => {
                                const val = e.target.value;
                                let newUrl = link.url;
                                if (val === 'shop-lips') newUrl = '/shop?category=Makeup&sub=Lips';
                                else if (val === 'shop-sindoor') newUrl = '/shop?category=Makeup&sub=Face';
                                else if (val === 'shop-cleanser') newUrl = '/shop?category=Skin&sub=Cleansing';
                                else if (val === 'shop-all') newUrl = '/shop';
                                else if (val === 'journal') newUrl = '/journal';
                                else if (val === 'guides') newUrl = '/beauty-guides';
                                else if (val === 'social') newUrl = '/social-commerce';
                                else if (val === 'campaign') newUrl = '/campaign/sovereign-velvet-festive';
                                else if (val === 'shade-finder') newUrl = '/find-my-shade';
                                else if (val === 'looks') newUrl = '/looks';
                                else if (val === 'loyalty' || val === 'my-glam') newUrl = '/my-glam';
                                else if (val === 'philosophy') newUrl = '/#philosophy';
                                else if (val === 'support') newUrl = '/support';
                                else if (val === 'tracking') newUrl = '/order-tracking';
                                else if (val === 'legal-shipping') newUrl = '/legal?policy=shipping';

                                handleUpdateLink(colIdx, linkIdx, { actionKey: val, url: newUrl });
                              }}
                              className="w-full px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                            >
                              <optgroup label="Shop Creations">
                                <option value="shop-lips">Matte Liquid Lipsticks (/shop?category=Makeup&sub=Lips)</option>
                                <option value="shop-sindoor">Luxury Sindoor (/shop?category=Makeup&sub=Face)</option>
                                <option value="shop-cleanser">Balm To Water Cleanser (/shop?category=Skin&sub=Cleansing)</option>
                                <option value="shop-all">Shop All Creations (/shop)</option>
                              </optgroup>
                              <optgroup label="Editorial & Stories">
                                <option value="journal">The Glamirk Journal (/journal)</option>
                                <option value="guides">Beauty Guides &amp; Rituals (/beauty-guides)</option>
                                <option value="social">Glamirk On You (Social) (/social-commerce)</option>
                                <option value="campaign">Sovereign Velvet Campaign (/campaign)</option>
                              </optgroup>
                              <optgroup label="Discovery & AI">
                                <option value="shade-finder">Find Your Shade Diagnostic (/find-my-shade)</option>
                                <option value="looks">Shop The Look (/looks)</option>
                                <option value="loyalty">Glamirk Privé Loyalty (/my-glam)</option>
                                <option value="philosophy">Atelier Philosophy (/#philosophy)</option>
                              </optgroup>
                              <optgroup label="Client Care">
                                <option value="support">Concierge Support &amp; FAQ (/support)</option>
                                <option value="tracking">Track Your Order (/order-tracking)</option>
                                <option value="legal-shipping">Shipping &amp; Returns (/legal?policy=shipping)</option>
                                <option value="my-glam">My Glam Account (/my-glam)</option>
                              </optgroup>
                              <optgroup label="Custom">
                                <option value="custom">Custom URL Path</option>
                              </optgroup>
                            </select>
                          </div>

                          {/* URL input */}
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-0.5">
                              URL / Path
                            </label>
                            <input
                              type="text"
                              value={link.url}
                              onChange={(e) => handleUpdateLink(colIdx, linkIdx, { url: e.target.value })}
                              placeholder="/shop or https://..."
                              className="w-full px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => handleAddLink(colIdx)}
                      type="button"
                      className="w-full py-2 flex items-center justify-center gap-1.5 bg-[#0B0B0B] hover:bg-[#171717] border border-dashed border-[#E8D5A8]/30 rounded-xl text-xs text-[#FAF9F6] font-semibold transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
                      <span>Add Link to {col.title}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: LEGAL POLICIES (Privacy, Terms, Shipping, Cookies, Returns) */}
      {activeSubTab === 'policies' && (
        <div className="space-y-6">
          <div className="p-4 bg-[#171717] rounded-xl border border-[#E8D5A8]/20 space-y-3">
            <h3 className="font-serif text-base text-[#FAF9F6]">Legal Policies &amp; Atelier Compliance</h3>
            <p className="text-xs text-[#6B6B6B]">
              Edit the exact content, clauses, headings, and disclosures displayed across all Legal Policy pages.
            </p>

            {/* Policy Selector Pills */}
            <div className="flex flex-wrap gap-2 pt-2">
              {[
                { id: 'privacy', label: 'Privacy Policy', icon: ShieldCheck },
                { id: 'terms', label: 'Terms of Service', icon: FileText },
                { id: 'shipping', label: 'Shipping Policy', icon: Truck },
                { id: 'cookies', label: 'Cookie Policy', icon: Cookie },
                { id: 'returns', label: 'Returns & Exchanges', icon: RotateCcw },
              ].map((p) => {
                const Icon = p.icon;
                const isSelected = selectedPolicyKey === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPolicyKey(p.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#F05A7E] text-white shadow-sm'
                        : 'bg-[#0B0B0B] text-[#FAF9F6] border border-[#E8D5A8]/20 hover:border-[#E8D5A8]/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Policy Editor */}
          <div className="bg-[#171717] border border-[#E8D5A8]/25 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8D5A8]/20">
              <h4 className="font-serif text-lg text-[#FAF9F6] capitalize">
                Editing: {currentPolicy.title || selectedPolicyKey}
              </h4>
              <span className="text-xs text-[#E8D5A8] font-mono">
                Key: {selectedPolicyKey}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  value={currentPolicy.title || ''}
                  onChange={(e) => handleUpdatePolicyField('title', e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Effective Date Tag
                </label>
                <input
                  type="text"
                  value={currentPolicy.effectiveDate || ''}
                  onChange={(e) => handleUpdatePolicyField('effectiveDate', e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Policy Subtitle / Summary Line
              </label>
              <input
                type="text"
                value={currentPolicy.subtitle || ''}
                onChange={(e) => handleUpdatePolicyField('subtitle', e.target.value)}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Overview / Introductory Statement
              </label>
              <textarea
                rows={3}
                value={currentPolicy.content || ''}
                onChange={(e) => handleUpdatePolicyField('content', e.target.value)}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none leading-relaxed"
              />
            </div>

            {/* Document Policy Sections */}
            <div className="pt-3 border-t border-[#E8D5A8]/20 space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold uppercase tracking-wider text-[#E8D5A8]">
                  Clauses &amp; Policy Sections ({currentPolicy.sections?.length || 0})
                </h5>
                <button
                  onClick={handleAddPolicySection}
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#171717] hover:bg-[#0B0B0B] text-[#FAF9F6] rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
                  <span>Add Section Clause</span>
                </button>
              </div>

              <div className="space-y-4">
                {(currentPolicy.sections || []).map((sec, secIdx) => (
                  <div
                    key={secIdx}
                    className="p-4 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={sec.heading}
                        onChange={(e) => handleUpdatePolicySection(secIdx, 'heading', e.target.value)}
                        placeholder="Section Heading (e.g. 1. Our Privacy Philosophy)"
                        className="flex-1 px-3 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs font-bold text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                      />
                      <button
                        onClick={() => handleDeletePolicySection(secIdx)}
                        className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
                        title="Delete Section"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <textarea
                      rows={4}
                      value={sec.body}
                      onChange={(e) => handleUpdatePolicySection(secIdx, 'body', e.target.value)}
                      placeholder="Detailed policy text..."
                      className="w-full px-3 py-2 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none leading-relaxed"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Legal Links Bar Configuration */}
            <div className="pt-5 border-t border-[#E8D5A8]/20 space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-[#E8D5A8]">
                Footer Bottom Legal Bar Links
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(footerState.legalLinks || []).map((leg, legIdx) => (
                  <div key={leg.id || legIdx} className="p-3 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-2">
                    <label className="block text-[10px] uppercase text-[#6B6B6B]">Link {legIdx + 1} Label</label>
                    <input
                      type="text"
                      value={leg.label}
                      onChange={(e) => handleUpdateLegalLink(legIdx, { label: e.target.value })}
                      className="w-full px-2.5 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs font-semibold text-[#FAF9F6]"
                    />
                    <label className="block text-[10px] uppercase text-[#6B6B6B]">Target URL</label>
                    <input
                      type="text"
                      value={leg.url}
                      onChange={(e) => handleUpdateLegalLink(legIdx, { url: e.target.value })}
                      className="w-full px-2.5 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BRAND & NEWSLETTER */}
      {activeSubTab === 'brand' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
            <h3 className="font-serif text-base text-[#FAF9F6]">Brand Statements</h3>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Footer Brand Tagline
              </label>
              <textarea
                rows={3}
                value={footerState.tagline || ''}
                onChange={(e) => setFooterState({ ...footerState, tagline: e.target.value, brandDescription: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Copyright Notice
              </label>
              <input
                type="text"
                value={footerState.copyright || footerState.copyrightText || ''}
                onChange={(e) => setFooterState({ ...footerState, copyright: e.target.value, copyrightText: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={footerState.contactEmail || ''}
                  onChange={(e) => setFooterState({ ...footerState, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Concierge Phone
                </label>
                <input
                  type="text"
                  value={footerState.contactPhone || ''}
                  onChange={(e) => setFooterState({ ...footerState, contactPhone: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
            <h3 className="font-serif text-base text-[#FAF9F6]">Newsletter Strip</h3>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Newsletter Main Heading
              </label>
              <input
                type="text"
                value={footerState.newsletterTitle || ''}
                onChange={(e) => setFooterState({ ...footerState, newsletterTitle: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Newsletter Subtitle Description
              </label>
              <textarea
                rows={3}
                value={footerState.newsletterSubtitle || ''}
                onChange={(e) => setFooterState({ ...footerState, newsletterSubtitle: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SOCIAL MEDIA HANDLES */}
      {activeSubTab === 'social' && (
        <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base text-[#FAF9F6]">Social Media Profiles</h3>
            <button
              onClick={handleAddSocialLink}
              type="button"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
              <span>Add Platform</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(footerState.socialLinks || []).map((soc, idx) => (
              <div key={idx} className="p-4 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={soc.platform}
                    onChange={(e) => handleUpdateSocialPlatform(idx, e.target.value)}
                    placeholder="Platform Name"
                    className="flex-1 px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs font-bold text-[#E8D5A8] uppercase focus:border-[#F05A7E] focus:outline-none"
                  />
                  <button
                    onClick={() => handleDeleteSocialLink(idx)}
                    className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
                    title="Remove Platform"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] text-[#6B6B6B] uppercase">Profile URL</label>
                  <input
                    type="text"
                    value={soc.url}
                    onChange={(e) => {
                      const updated = [...(footerState.socialLinks || [])];
                      updated[idx].url = e.target.value;
                      setFooterState({ ...footerState, socialLinks: updated });
                    }}
                    className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#6B6B6B] uppercase">Display Handle</label>
                  <input
                    type="text"
                    value={soc.handle || ''}
                    onChange={(e) => {
                      const updated = [...(footerState.socialLinks || [])];
                      updated[idx].handle = e.target.value;
                      setFooterState({ ...footerState, socialLinks: updated });
                    }}
                    placeholder="@glamirkbeauty"
                    className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: PAYMENT METHODS & TRUST BADGES */}
      {activeSubTab === 'trust' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
            <h3 className="font-serif text-base text-[#FAF9F6]">Accepted Payment Methods</h3>
            <p className="text-xs text-[#6B6B6B]">Toggle which payment badges appear in the footer bottom bar.</p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_PAYMENT_METHODS.map((method) => {
                const isActive = (footerState.paymentMethods || []).includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => handleTogglePaymentMethod(method)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#C9972B] text-[#0B0B0B] border-[#C9972B]'
                        : 'bg-[#0B0B0B] text-[#6B6B6B] border-[#E8D5A8]/30 hover:border-[#E8D5A8]/60'
                    }`}
                  >
                    {method}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#171717] border border-[#E8D5A8]/25 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-base text-[#FAF9F6]">Trust Badges</h3>
                <p className="text-xs text-[#6B6B6B] mt-0.5">The 3 badges shown on the right side of the footer bottom bar.</p>
              </div>
              <button
                onClick={handleAddTrustBadge}
                type="button"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#F05A7E]" />
                <span>Add Badge</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(footerState.trustBadges || []).map((badge, idx) => (
                <div key={badge.id || idx} className="p-4 bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={badge.icon}
                      onChange={(e) => handleUpdateTrustBadge(idx, { icon: e.target.value })}
                      className="flex-1 px-2 py-1 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6] focus:border-[#F05A7E] focus:outline-none"
                    >
                      {AVAILABLE_TRUST_ICONS.map((icon) => (
                        <option key={icon} value={icon}>{icon}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDeleteTrustBadge(idx)}
                      className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer"
                      title="Remove Badge"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={badge.title}
                    onChange={(e) => handleUpdateTrustBadge(idx, { title: e.target.value })}
                    placeholder="Title (e.g. 100% Secure)"
                    className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs font-semibold text-[#FAF9F6]"
                  />
                  <input
                    type="text"
                    value={badge.subtitle}
                    onChange={(e) => handleUpdateTrustBadge(idx, { subtitle: e.target.value })}
                    placeholder="Subtitle (e.g. Payments)"
                    className="w-full px-2.5 py-1.5 bg-[#171717] border border-[#E8D5A8]/30 rounded text-xs text-[#FAF9F6]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
