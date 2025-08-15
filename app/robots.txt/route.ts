import { NextResponse } from 'next/server'

export async function GET() {
  const robotsTxt = `User-agent: *
Allow: /
Sitemap: https://www.kiarakraft.com/sitemap.xml`

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400', // Cache for 1 day with CDN
      'X-Robots-Tag': 'noindex', // Don't index the robots.txt file itself
    },
  })
}