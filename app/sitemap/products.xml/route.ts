import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Get all active products
    const products = await db.product.findMany({
      where: { active: true, isTest: false },
      select: {
        slug: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const baseUrl = 'https://www.kiarakraft.com';

    // Generate XML for products sitemap
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${products
  .map(product => {
    const lastmod = product.updatedAt.toISOString();
    return `  <url>
    <loc>${baseUrl}/fa/product/${product.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="fa" href="${baseUrl}/fa/product/${product.slug}" />
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/en/product/${product.slug}" />
  </url>
  <url>
    <loc>${baseUrl}/en/product/${product.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="fa" href="${baseUrl}/fa/product/${product.slug}" />
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/en/product/${product.slug}" />
  </url>`;
  })
  .join('\n')}
</urlset>`;

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // 1 hour cache
      },
    });
  } catch (error) {
    console.error('Error generating products sitemap:', error);

    // Return minimal sitemap on error
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.kiarakraft.com/fa/explore</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`;

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minutes cache on error
      },
    });
  }
}
