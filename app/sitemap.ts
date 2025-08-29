import { MetadataRoute } from 'next';

/**
 * Sitemap index - points to segmented sitemaps for better performance
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.kiarakraft.com';

  return [
    {
      url: `${baseUrl}/sitemap/static.xml`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/sitemap/products.xml`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sitemap/shops.xml`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];
}
