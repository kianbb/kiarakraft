import type { MetadataRoute } from 'next';
import { isStagingDeployment } from '@/lib/deployment-policy';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: isStagingDeployment()
      ? { userAgent: '*', disallow: '/' }
      : { userAgent: '*', allow: '/' },
  };
}
