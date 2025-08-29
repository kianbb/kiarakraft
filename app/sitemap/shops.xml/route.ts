import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Get all verified sellers with products
    const sellers = await db.sellerProfile.findMany({
      where: {
        verified: true,
        products: {
          some: {
            active: true,
            isTest: false,
          },
        },
      },
      select: {
        handle: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const baseUrl = 'https://www.kiarakraft.com';

    // Generate XML for shops sitemap
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sellers
  .map(seller => {
    const lastmod = seller.updatedAt.toISOString();
    return `  <url>
    <loc>${baseUrl}/fa/shop/${seller.handle}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
    <xhtml:link rel="alternate" hreflang="fa" href="${baseUrl}/fa/shop/${seller.handle}" />
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/en/shop/${seller.handle}" />
  </url>
  <url>
    <loc>${baseUrl}/en/shop/${seller.handle}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
    <xhtml:link rel="alternate" hreflang="fa" href="${baseUrl}/fa/shop/${seller.handle}" />
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/en/shop/${seller.handle}" />
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
    console.error('Error generating shops sitemap:', error);

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
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  }
}
