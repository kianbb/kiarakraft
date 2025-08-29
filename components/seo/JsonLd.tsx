import Script from 'next/script';

interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * Generic JSON-LD component for structured data
 */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <Script
      id="json-ld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data, null, 2),
      }}
    />
  );
}

/**
 * Organization JSON-LD for homepage
 */
export function OrganizationJsonLd({ locale }: { locale: string }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: locale === 'fa' ? 'کیارا کرفت' : 'Kiara Kraft',
    url: 'https://www.kiarakraft.com',
    logo: 'https://www.kiarakraft.com/logo.png',
    sameAs: [
      'https://instagram.com/kiarakraft',
      'https://telegram.me/kiarakraft',
    ],
    description:
      locale === 'fa'
        ? 'بازارچه آنلاین محصولات دست‌ساز ایرانی - کیارا کرفت'
        : 'Iranian handmade marketplace - Connecting artisans with buyers',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'IR',
      addressLocality: locale === 'fa' ? 'تهران' : 'Tehran',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: 'support@kiarakraft.com',
    },
  };

  return <JsonLd data={data} />;
}

/**
 * BreadcrumbList JSON-LD for navigation
 */
export function BreadcrumbJsonLd({
  items,
}: {
  items: Array<{
    name: string;
    url: string;
    position: number;
  }>;
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(item => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      item: item.url,
    })),
  };

  return <JsonLd data={data} />;
}

/**
 * Product JSON-LD for product pages (enhanced version)
 */
export function ProductJsonLd({
  product,
  locale,
}: {
  product: {
    title: string;
    description: string;
    priceToman: number;
    images: Array<{ url: string; alt?: string }>;
    seller: {
      displayName: string;
      handle: string;
    };
    ratingAvg: number;
    ratingCount: number;
    slug: string;
  };
  locale: string;
}) {
  // Convert Toman to IRR for schema.org (1 Toman = 10 IRR)
  const priceIRR = product.priceToman * 10;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    image: product.images.map(img => img.url),
    url: `https://www.kiarakraft.com/${locale}/product/${product.slug}`,
    brand: {
      '@type': 'Brand',
      name: product.seller.displayName,
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'IRR',
      price: priceIRR,
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: product.seller.displayName,
        url: `https://www.kiarakraft.com/${locale}/shop/${product.seller.handle}`,
      },
    },
    aggregateRating:
      product.ratingCount > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };

  return <JsonLd data={data} />;
}

/**
 * WebSite JSON-LD with search box
 */
export function WebSiteJsonLd({ locale }: { locale: string }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: locale === 'fa' ? 'کیارا کرفت' : 'Kiara Kraft',
    url: 'https://www.kiarakraft.com',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `https://www.kiarakraft.com/${locale}/explore?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return <JsonLd data={data} />;
}
