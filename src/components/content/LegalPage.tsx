/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Truck, RotateCcw, FileText, Cookie, ChevronRight, ArrowLeft } from 'lucide-react';
import { updatePageSeo } from '../../utils/seo';
import { useCMS } from '../../context/CMSContext';

export type PolicyType = 'privacy' | 'terms' | 'shipping' | 'returns' | 'cookies';

interface LegalPageProps {
  initialPolicy?: PolicyType;
  onNavigateHome: () => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({
  initialPolicy = 'privacy',
  onNavigateHome,
}) => {
  const { footer } = useCMS();
  const [activePolicy, setActivePolicy] = useState<PolicyType>(initialPolicy);

  useEffect(() => {
    if (initialPolicy) {
      setActivePolicy(initialPolicy);
    }
  }, [initialPolicy]);

  const cmsPolicy = footer?.legalPolicies?.[activePolicy];

  useEffect(() => {
    const titles: Record<PolicyType, string> = {
      privacy: 'Privacy & Data Protection Policy',
      terms: 'Terms of Service & Atelier Conditions',
      shipping: 'Luxury Shipping & White-Glove Delivery',
      returns: 'Returns, Exchanges & Quality Guarantee',
      cookies: 'Cookie Preference & Technology Transparency',
    };
    const titleToUse = cmsPolicy?.title || titles[activePolicy];
    updatePageSeo({
      title: `${titleToUse} | Glamirk Beauty Private Limited`,
      description: `Official legal and operational policies for Glamirk Beauty Private Limited. Review our commitments to formulation purity, data protection, and customer care.`,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activePolicy, cmsPolicy]);

  const policies = [
    {
      id: 'privacy' as PolicyType,
      label: 'Privacy Policy',
      icon: ShieldCheck,
      subtitle: 'Data protection, camera privacy & client confidentiality',
    },
    {
      id: 'terms' as PolicyType,
      label: 'Terms of Service',
      icon: FileText,
      subtitle: 'Atelier standards, intellectual property & order terms',
    },
    {
      id: 'shipping' as PolicyType,
      label: 'Shipping Policy',
      icon: Truck,
      subtitle: 'Pan-India transit, temperature control & dispatch times',
    },
    {
      id: 'returns' as PolicyType,
      label: 'Returns & Refunds',
      icon: RotateCcw,
      subtitle: 'Hygiene standards, replacements & claims procedure',
    },
    {
      id: 'cookies' as PolicyType,
      label: 'Cookie Policy',
      icon: Cookie,
      subtitle: 'Session state, shade preferences & analytical tracking',
    },
  ];

  return (
    <div id="glamirk-legal-page" className="min-h-screen bg-[#FAF9F6] pt-8 pb-24">
      {/* Header Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#C9972B] mb-6">
          <button
            onClick={onNavigateHome}
            className="hover:text-[#121212] transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </button>
          <ChevronRight className="w-3 h-3 text-[#C9972B]" />
          <span>Legal &amp; Atelier Policies</span>
          <ChevronRight className="w-3 h-3 text-[#C9972B]" />
          <span className="text-[#121212] font-medium">
            {policies.find((p) => p.id === activePolicy)?.label}
          </span>
        </div>

        <div className="border-b border-[#E8D5A8] pb-8">
          <span className="text-[11px] uppercase tracking-[0.25em] text-[#C9972B] font-medium block mb-2">
            Glamirk Beauty Private Limited
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#121212] tracking-tight">
            Policies &amp; Transparency
          </h1>
          <p className="text-[#6B6B6B] text-sm sm:text-base font-light mt-3 max-w-2xl">
            Our commitment to purity in beauty extends to absolute clarity in our customer relationships, formulation transparency, and ethical data governance.
          </p>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-4">
            <div className="sticky top-28 bg-[#FFFFFF] border border-[#E8D5A8] p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#C9972B] font-medium px-3 py-2">
                Policy Directory
              </p>
              <div className="space-y-1 mt-2">
                {policies.map((p) => {
                  const Icon = p.icon;
                  const isActive = activePolicy === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActivePolicy(p.id)}
                      className={`w-full text-left p-3.5 flex items-start gap-3 transition-all duration-200 ${
                        isActive
                          ? 'bg-[#0B0B0B] text-[#FAF9F6]'
                          : 'text-[#121212] hover:bg-[#FAF9F6] hover:text-[#C9972B]'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-[#C9972B]' : 'text-[#C9972B]'}`} />
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] font-medium">
                          {p.label}
                        </p>
                        <p className={`text-[11px] mt-0.5 font-light leading-snug line-clamp-1 ${isActive ? 'text-[#E8D5A8]' : 'text-[#C9972B]'}`}>
                          {p.subtitle}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 pt-6 border-t border-[#E8D5A8] px-3">
                <p className="text-xs text-[#C9972B] font-light leading-relaxed">
                  Have questions about these terms? Reach our concierge at{' '}
                  <span className="font-medium text-[#121212]">care@glamirk.com</span>
                </p>
              </div>
            </div>
          </div>

          {/* Policy Document Content */}
          <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#E8D5A8] p-6 sm:p-10 shadow-sm">
            {cmsPolicy ? (
              <article className="max-w-none text-[#121212]">
                <div className="border-b border-[#E8D5A8] pb-6 mb-8">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9972B] font-medium">
                    Effective Date: {cmsPolicy.effectiveDate || 'Current Production Release'}
                  </span>
                  <h2 className="font-serif text-2xl sm:text-3xl text-[#121212] mt-2 mb-1">
                    {cmsPolicy.title}
                  </h2>
                  <p className="text-xs text-[#C9972B] uppercase tracking-wider">
                    Glamirk Beauty Private Limited
                  </p>
                  {cmsPolicy.subtitle && (
                    <p className="text-xs text-[#6B6B6B] mt-1 font-normal">
                      {cmsPolicy.subtitle}
                    </p>
                  )}
                  {cmsPolicy.content && (
                    <p className="text-sm text-[#6B6B6B] mt-3 font-light leading-relaxed">
                      {cmsPolicy.content}
                    </p>
                  )}
                </div>

                <div className="space-y-6 text-sm sm:text-base font-light leading-relaxed text-[#171717]">
                  {cmsPolicy.sections && cmsPolicy.sections.length > 0 ? (
                    cmsPolicy.sections.map((sec, idx) => (
                      <section key={idx} className="space-y-2">
                        <h3 className="font-serif text-lg text-[#121212] font-medium">
                          {sec.heading}
                        </h3>
                        <p className="whitespace-pre-line text-[#171717]">
                          {sec.body}
                        </p>
                      </section>
                    ))
                  ) : (
                    <p>{cmsPolicy.content}</p>
                  )}
                </div>
              </article>
            ) : activePolicy === 'privacy' ? (
              <article className="max-w-none text-[#121212]">
                <div className="border-b border-[#E8D5A8] pb-6 mb-8">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9972B] font-medium">
                    Effective Date: Current Production Release
                  </span>
                  <h2 className="font-serif text-2xl sm:text-3xl text-[#121212] mt-2 mb-1">
                    Privacy &amp; Data Protection Policy
                  </h2>
                  <p className="text-xs text-[#C9972B] uppercase tracking-wider">
                    Glamirk Beauty Private Limited
                  </p>
                </div>

                <div className="space-y-6 text-sm sm:text-base font-light leading-relaxed text-[#171717]">
                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      1. Our Privacy Philosophy
                    </h3>
                    <p>
                      Glamirk Beauty Private Limited respects the personal privacy of our patrons. We design all client interactions, shade discovery consultations, and shopping flows with privacy-by-design principles. We collect only the information necessary to fulfill orders, personalize shade selections, and maintain client loyalty relationships.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      2. Virtual Try-On &amp; Camera Image Processing
                    </h3>
                    <p>
                      Our Virtual Try-On and Find My Shade camera diagnostics process facial geometry and skin tone cues purely locally within your browser session using real-time canvas calculations. <strong>We do not upload, retain, distribute, or sell your biometric facial data or uploaded photos to external servers or third-party advertising brokers.</strong> You retain complete freedom to use our platform with preset model avatars without activating your camera.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      3. Information We Collect
                    </h3>
                    <p>
                      When you place an order or create a Glamirk Privé profile, we collect:
                    </p>
                    <ul className="list-disc pl-5 space-y-1.5 mt-2 text-sm text-[#171717]">
                      <li>Contact details (name, email address, phone number for courier notifications)</li>
                      <li>Delivery coordinates (shipping address and postal PIN code)</li>
                      <li>Transaction references (payment authorization identifiers; payment credentials are encrypted by our certified payment gateway)</li>
                      <li>Voluntary beauty preferences (saved skin tone, undertone, and shade preferences in your local profile)</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      4. Data Security &amp; Retention
                    </h3>
                    <p>
                      All customer transactions are secured with industry-standard TLS encryption. Client preferences are stored locally in your browser to give you immediate access across visits without invasive tracking.
                    </p>
                  </section>
                </div>
              </article>
            ) : activePolicy === 'terms' ? (
              <article className="max-w-none text-[#121212]">
                <div className="border-b border-[#E8D5A8] pb-6 mb-8">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9972B] font-medium">
                    Terms &amp; Conditions
                  </span>
                  <h2 className="font-serif text-2xl sm:text-3xl text-[#121212] mt-2 mb-1">
                    Terms of Service
                  </h2>
                  <p className="text-xs text-[#C9972B] uppercase tracking-wider">
                    Glamirk Beauty Private Limited
                  </p>
                </div>

                <div className="space-y-6 text-sm sm:text-base font-light leading-relaxed text-[#171717]">
                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      1. Brand Purity &amp; Formulation Integrity
                    </h3>
                    <p>
                      All products showcased on glamirk.com are authentic, original formulations developed and verified by Glamirk Beauty Private Limited. Product descriptions, ingredients listings, and suggested application rituals reflect authentic cosmetic testing standards.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      2. Pricing &amp; Transparent Commerce
                    </h3>
                    <p>
                      All prices are listed in Indian Rupees (INR ₹) inclusive of applicable GST taxes. We do not manufacture artificial pricing countdowns or unverified discounts. Delivery fees, where applicable, are transparently presented in your bag prior to final checkout.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      3. Intellectual Property
                    </h3>
                    <p>
                      All trademarks, editorial articles, beauty guides, photography, shade formulations, and digital consultation tools are the intellectual property of Glamirk Beauty Private Limited. Unauthorized duplication or commercial distribution is strictly prohibited.
                    </p>
                  </section>
                </div>
              </article>
            ) : activePolicy === 'shipping' ? (
              <article className="max-w-none text-[#121212]">
                <div className="border-b border-[#E8D5A8] pb-6 mb-8">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9972B] font-medium">
                    Pan-India Delivery Logistics
                  </span>
                  <h2 className="font-serif text-2xl sm:text-3xl text-[#121212] mt-2 mb-1">
                    Shipping &amp; Delivery Policy
                  </h2>
                  <p className="text-xs text-[#C9972B] uppercase tracking-wider">
                    Glamirk Beauty Private Limited
                  </p>
                </div>

                <div className="space-y-6 text-sm sm:text-base font-light leading-relaxed text-[#171717]">
                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      1. Dispatch Timeline &amp; Packaging
                    </h3>
                    <p>
                      Orders placed before 2:00 PM IST on business days are dispatched from our central distribution facility within 24 hours. Each order is packaged in temperature-protected, sustainable luxury packaging designed to preserve the delicate lipid balance of our liquid lipsticks and balm-to-water formulations.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      2. Delivery Schedules Across India
                    </h3>
                    <div className="border border-[#E8D5A8] overflow-hidden my-4">
                      <table className="min-w-full text-xs text-left">
                        <thead className="bg-[#FAF9F6] border-b border-[#E8D5A8] uppercase tracking-wider text-[#C9972B]">
                          <tr>
                            <th className="p-3">Region</th>
                            <th className="p-3">Estimated Transit</th>
                            <th className="p-3">Shipping Tier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8D5A8]">
                          <tr>
                            <td className="p-3 font-medium text-[#121212]">Metro Hubs (Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata)</td>
                            <td className="p-3 text-[#171717]">2 – 3 Business Days</td>
                            <td className="p-3 text-[#C9972B] font-medium">Express Air Priority</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-medium text-[#121212]">Tier 1 &amp; Tier 2 Cities</td>
                            <td className="p-3 text-[#171717]">3 – 5 Business Days</td>
                            <td className="p-3 text-[#171717]">Standard Air Transit</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-medium text-[#121212]">Regional &amp; Special Locations</td>
                            <td className="p-3 text-[#171717]">5 – 7 Business Days</td>
                            <td className="p-3 text-[#171717]">Insured Surface Courier</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      3. Complimentary Shipping Threshold
                    </h3>
                    <p>
                      All orders with a value exceeding ₹999 qualify for complimentary expedited shipping nationwide. Orders below ₹999 incur a flat ₹99 packaging and courier facilitation fee.
                    </p>
                  </section>
                </div>
              </article>
            ) : activePolicy === 'returns' ? (
              <article className="max-w-none text-[#121212]">
                <div className="border-b border-[#E8D5A8] pb-6 mb-8">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9972B] font-medium">
                    Client Satisfaction &amp; Quality Guarantee
                  </span>
                  <h2 className="font-serif text-2xl sm:text-3xl text-[#121212] mt-2 mb-1">
                    Returns, Exchanges &amp; Quality Policy
                  </h2>
                  <p className="text-xs text-[#C9972B] uppercase tracking-wider">
                    Glamirk Beauty Private Limited
                  </p>
                </div>

                <div className="space-y-6 text-sm sm:text-base font-light leading-relaxed text-[#171717]">
                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      1. Sanitary &amp; Hygiene Standards
                    </h3>
                    <p>
                      Due to strict health and cosmetic hygiene standards, opened cosmetic formulations (lipsticks, sindoor, cleansers) cannot be accepted for sanitary resale. However, if your product arrives damaged in transit, defective, or incorrect, we provide an immediate, complimentary replacement.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      2. 7-Day Quality Claim Window
                    </h3>
                    <p>
                      If you experience any transit damage or delivery discrepancy, please notify our client concierge within 7 days of package delivery with a photograph of the parcel and order number. You can submit claims directly from your <strong>My Glam &gt; Returns &amp; Claims</strong> dashboard or by emailing care@glamirk.com.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      3. Refund Disbursement
                    </h3>
                    <p>
                      Approved refunds are initiated within 48 business hours to your original source payment method (UPI, credit/debit card, net banking).
                    </p>
                  </section>
                </div>
              </article>
            ) : (
              <article className="max-w-none text-[#121212]">
                <div className="border-b border-[#E8D5A8] pb-6 mb-8">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9972B] font-medium">
                    Session &amp; Preference Transparency
                  </span>
                  <h2 className="font-serif text-2xl sm:text-3xl text-[#121212] mt-2 mb-1">
                    Cookie &amp; Local Storage Policy
                  </h2>
                  <p className="text-xs text-[#C9972B] uppercase tracking-wider">
                    Glamirk Beauty Private Limited
                  </p>
                </div>

                <div className="space-y-6 text-sm sm:text-base font-light leading-relaxed text-[#171717]">
                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      1. How We Use Storage Technologies
                    </h3>
                    <p>
                      Glamirk utilizes modern browser local storage and essential session cookies strictly to preserve your shopping bag items, saved beauty profile, shade test results, and recent product visits across browser refreshes.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-serif text-lg text-[#121212] font-medium mb-2">
                      2. Essential vs. Analytical Storage
                    </h3>
                    <ul className="list-disc pl-5 space-y-1.5 text-sm text-[#171717]">
                      <li><strong>Essential Storage:</strong> Required for the shopping cart, checkout step state, wishlist persistence, and customer session preservation.</li>
                      <li><strong>Personalization Storage:</strong> Remembers your undertone and shade match recommendations so you don't need to re-take the diagnostic.</li>
                      <li><strong>First-Party Analytics:</strong> Anonymized event telemetry to measure page performance, error occurrences, and conversion drop-offs.</li>
                    </ul>
                  </section>
                </div>
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
