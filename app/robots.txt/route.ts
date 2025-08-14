import { NextResponse } from 'next/server'

export async function GET() {
  const robotsTxt = `User-agent: *
Allow: /

# Sitemaps
Sitemap: https://www.kiarakraft.com/sitemap.xml

# Block access to admin areas and API routes
Disallow: /api/
Disallow: /_next/
Disallow: /admin/
Disallow: /private/
Disallow: /temp/

# Block dynamic routes that shouldn't be indexed
Disallow: /*?*utm_*
Disallow: /*?*ref=*
Disallow: /*?*fbclid=*
Disallow: /*?*gclid=*

# Allow important static assets
Allow: /_next/static/
Allow: /favicon.ico
Allow: /robots.txt
Allow: /sitemap.xml

# Allow crawling of both locales and main pages
Allow: /fa/
Allow: /en/
Allow: /fa/explore
Allow: /en/explore
Allow: /fa/product/
Allow: /en/product/

# Crawl delay to be respectful
Crawl-delay: 1

# Special rules for different crawlers
User-agent: Googlebot
Crawl-delay: 0

User-agent: Bingbot
Crawl-delay: 2
`

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400', // Cache for 1 day with CDN
      'X-Robots-Tag': 'noindex', // Don't index the robots.txt file itself
    },
  })
}