import { isStagingDeployment } from '@/lib/deployment-policy';

export const dynamic = 'force-static';

export async function GET() {
  const robotsTxt = isStagingDeployment()
    ? 'User-agent: *\nDisallow: /'
    : `User-agent: *
Allow: /
Sitemap: https://www.kiarakraft.com/sitemap.xml`;

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400', // Cache for 1 day with CDN
      'X-Robots-Tag': 'noindex', // Don't index the robots.txt file itself
    },
  });
}
