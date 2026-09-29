/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Glamirk Beauty Private Limited — Production SEO Architecture
 * Dynamic document head, canonical link, OpenGraph, Twitter Card & Schema.org JSON-LD structured data.
 */

export interface SeoMetadata {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'product';
  jsonLd?: Record<string, any>;
}

export function updatePageSeo(meta: SeoMetadata): void {
  if (typeof document === 'undefined') return;

  const brandName = 'Glamirk Beauty Private Limited';
  const fullTitle = meta.title.includes('Glamirk')
    ? meta.title
    : `${meta.title} | ${brandName}`;

  // Document Title
  document.title = fullTitle;

  // Meta Description
  let descTag = document.querySelector('meta[name="description"]');
  if (!descTag) {
    descTag = document.createElement('meta');
    descTag.setAttribute('name', 'description');
    document.head.appendChild(descTag);
  }
  descTag.setAttribute('content', meta.description);

  // Canonical Link
  let canonicalTag = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonicalTag) {
    canonicalTag = document.createElement('link');
    canonicalTag.setAttribute('rel', 'canonical');
    document.head.appendChild(canonicalTag);
  }
  canonicalTag.setAttribute('href', meta.canonicalUrl || window.location.href);

  // OpenGraph Tags
  const setMeta = (attrName: string, attrVal: string, content: string) => {
    let tag = document.querySelector(`meta[${attrName}="${attrVal}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(attrName, attrVal);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  };

  setMeta('property', 'og:site_name', brandName);
  setMeta('property', 'og:title', fullTitle);
  setMeta('property', 'og:description', meta.description);
  setMeta('property', 'og:type', meta.ogType || 'website');
  setMeta('property', 'og:url', meta.canonicalUrl || window.location.href);

  if (meta.ogImage) {
    setMeta('property', 'og:image', meta.ogImage);
  }

  // Twitter Card
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', fullTitle);
  setMeta('name', 'twitter:description', meta.description);
  if (meta.ogImage) {
    setMeta('name', 'twitter:image', meta.ogImage);
  }

  // Schema.org Structured Data
  let scriptTag = document.getElementById('glamirk-schema-jsonld') as HTMLScriptElement | null;
  if (!scriptTag) {
    scriptTag = document.createElement('script');
    scriptTag.id = 'glamirk-schema-jsonld';
    scriptTag.type = 'application/ld+json';
    document.head.appendChild(scriptTag);
  }

  const baseSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brandName,
    url: 'https://glamirk.com',
    logo: 'https://glamirk.com/logo.png',
    description: 'Luxury Indian beauty atelier formulating high-performance cosmetics, lipsticks, and skin cleansers.',
    foundingLocation: 'India',
  };

  const finalSchema = meta.jsonLd ? { ...baseSchema, ...meta.jsonLd } : baseSchema;
  scriptTag.textContent = JSON.stringify(finalSchema);
}
