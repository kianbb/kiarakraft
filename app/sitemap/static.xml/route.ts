import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = 'https://www.kiarakraft.com';
  const now = new Date().toISOString();

  // Static pages with priorities and change frequencies
  const staticPages = [
    // Homepage - highest priority
    {
      fa: `${baseUrl}/fa`,
      en: `${baseUrl}/en`,
      changefreq: 'daily',
      priority: '1.0',
    },
    // Explore - high priority
    {
      fa: `${baseUrl}/fa/explore`,
      en: `${baseUrl}/en/explore`,
      changefreq: 'hourly',
      priority: '0.9',
    },
    // Authentication pages
    {
      fa: `${baseUrl}/fa/auth/login`,
      en: `${baseUrl}/en/auth/login`,
      changefreq: 'monthly',
      priority: '0.3',
    },
    {
      fa: `${baseUrl}/fa/auth/register`,
      en: `${baseUrl}/en/auth/register`,
      changefreq: 'monthly',
      priority: '0.3',
    },
    // Legal pages
    {
      fa: `${baseUrl}/fa/legal/terms`,
      en: `${baseUrl}/en/legal/terms`,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      fa: `${baseUrl}/fa/legal/privacy`,
      en: `${baseUrl}/en/legal/privacy`,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      fa: `${baseUrl}/fa/legal/refunds`,
      en: `${baseUrl}/en/legal/refunds`,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      fa: `${baseUrl}/fa/legal/shipping`,
      en: `${baseUrl}/en/legal/shipping`,
      changefreq: 'yearly',
      priority: '0.3',
    },
    // Help pages
    {
      fa: `${baseUrl}/fa/help`,
      en: `${baseUrl}/en/help`,
      changefreq: 'monthly',
      priority: '0.4',
    },
    {
      fa: `${baseUrl}/fa/contact`,
      en: `${baseUrl}/en/contact`,
      changefreq: 'monthly',
      priority: '0.4',
    },
    {
      fa: `${baseUrl}/fa/about`,
      en: `${baseUrl}/en/about`,
      changefreq: 'monthly',
      priority: '0.5',
    },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${staticPages
  .map(page => {
    return `  <url>
    <loc>${page.fa}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <xhtml:link rel="alternate" hreflang="fa" href="${page.fa}" />
    <xhtml:link rel="alternate" hreflang="en" href="${page.en}" />
  </url>
  <url>
    <loc>${page.en}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <xhtml:link rel="alternate" hreflang="fa" href="${page.fa}" />
    <xhtml:link rel="alternate" hreflang="en" href="${page.en}" />
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400', // 24 hours cache
    },
  });
}
