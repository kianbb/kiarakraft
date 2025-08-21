import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

// Build a CSP string. Start with Report-Only, then enforce after verification.
const makeCsp = () => {
  const PLAUSIBLE = 'https://plausible.io';
  const CLOUDINARY_IMG = 'https://res.cloudinary.com';
  const CLOUDINARY_API = 'https://api.cloudinary.com';
  const UNSPLASH = 'https://images.unsplash.com';
  const PICSUM = 'https://picsum.photos';

  const policy = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' ${PLAUSIBLE};
    connect-src 'self' ${PLAUSIBLE} ${CLOUDINARY_API};
    img-src 'self' data: blob: ${UNSPLASH} ${PICSUM} ${CLOUDINARY_IMG};
    style-src 'self' 'unsafe-inline';
    font-src 'self' data:;
    manifest-src 'self';
    worker-src 'self';
    frame-ancestors 'self';
    base-uri 'self';
    form-action 'self';
    upgrade-insecure-requests;
  `;
  return policy.replace(/\s{2,}/g, ' ').trim();
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  poweredByHeader: false,
  compress: true,
  trailingSlash: false,
  generateEtags: true,
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '127.0.0.1:3000']
    },
    optimizePackageImports: ['lucide-react', '@/components/ui'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-DNS-Prefetch-Control',
          value: 'on'
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY'
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff'
        },
        {
          key: 'Referrer-Policy',
          value: 'origin-when-cross-origin'
        },
        // Enforced CSP (switched from Report-Only after validation)
        {
          key: 'Content-Security-Policy',
          value: makeCsp()
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains'
        }
      ],
    },
    {
      source: '/static/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable'
        }
      ]
    },
    {
      source: '/_next/image/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable'
        }
      ]
    },
    {
      source: '/sw.js',
      headers: [
        {
          key: 'Content-Type',
          value: 'application/javascript'
        },
        {
          key: 'Service-Worker-Allowed',
          value: '/'
        },
        {
          key: 'Cache-Control',
          value: 'no-cache, no-store, must-revalidate'
        }
      ]
    },
    {
      source: '/manifest.webmanifest',
      headers: [
        {
          key: 'Content-Type',
          value: 'application/manifest+json'
        }
      ]
    }
  ],
  eslint: {
    // Enforce ESLint checks during builds for better code quality
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Enforce TypeScript checks during builds to prevent runtime errors
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      // Silence known benign OTel/Sentry dynamic require warnings
      /Critical dependency: the request of a dependency is an expression/,
      /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
    ];
    return config;
  },
};

export default withNextIntl(nextConfig);
