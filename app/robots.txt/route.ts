import { NextResponse } from 'next/server'

export async function GET() {
  const robotsTxt = `User-agent: *
Allow: /

# Sitemaps
Sitemap: https://kiarakraft.com/sitemap.xml

# Block access to admin areas (if any)
Disallow: /api/
Disallow: /_next/
Disallow: /admin/

# Allow crawling of both locales
Allow: /fa/
Allow: /en/

# Crawl delay
Crawl-delay: 1
`

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400', // Cache for 1 day
    },
  })
}