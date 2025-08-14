import { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://kiarakraft.com';
  
  try {
    // Get all products with their slugs and last modified dates
    const products = await prisma.product.findMany({
      where: { active: true },
      select: {
        slug: true,
        updatedAt: true,
      },
    });

    // Static pages
    const staticPages: MetadataRoute.Sitemap = [
      // Homepage
      {
        url: `${baseUrl}/fa`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1,
        alternates: {
          languages: {
            fa: `${baseUrl}/fa`,
            en: `${baseUrl}/en`,
          },
        },
      },
      {
        url: `${baseUrl}/en`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1,
      },
      // Explore pages  
      {
        url: `${baseUrl}/fa/explore`,
        lastModified: new Date(),
        changeFrequency: 'hourly',
        priority: 0.9,
        alternates: {
          languages: {
            fa: `${baseUrl}/fa/explore`,
            en: `${baseUrl}/en/explore`,
          },
        },
      },
      {
        url: `${baseUrl}/en/explore`,
        lastModified: new Date(),
        changeFrequency: 'hourly',
        priority: 0.9,
      },
    ];

    // Product pages
    const productPages: MetadataRoute.Sitemap = products.flatMap((product) => [
      {
        url: `${baseUrl}/fa/product/${product.slug}`,
        lastModified: product.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
        alternates: {
          languages: {
            fa: `${baseUrl}/fa/product/${product.slug}`,
            en: `${baseUrl}/en/product/${product.slug}`,
          },
        },
      },
      {
        url: `${baseUrl}/en/product/${product.slug}`,
        lastModified: product.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      },
    ]);

    return [...staticPages, ...productPages];

  } catch (error) {
    console.error('Error generating sitemap:', error);
    
    // Return minimal sitemap if database fails
    return [
      {
        url: `${baseUrl}/fa`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1,
      },
      {
        url: `${baseUrl}/en`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1,
      },
    ];
  }
}