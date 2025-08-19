import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kiara Kraft - Iranian Handmade Marketplace',
    short_name: 'Kiara Kraft',
    description: 'Online marketplace for authentic Iranian handcrafted products. Quality, authenticity, and traditional artistry in every piece.',
    start_url: '/fa',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicon.ico',
        sizes: '16x16 32x32 48x48',
        type: 'image/x-icon',
        purpose: 'any',
      },
    ],
    lang: 'fa',
    dir: 'rtl',
    orientation: 'portrait',
    categories: ['shopping', 'lifestyle', 'business'],
    shortcuts: [
      {
        name: 'جستجو محصولات',
        short_name: 'جستجو',
        description: 'Search for handcrafted products',
        url: '/fa/explore',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      },
      {
        name: 'سبد خرید',
        short_name: 'سبد',
        description: 'View your shopping cart',
        url: '/fa/cart',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    ],
    // Screenshots will be added in the future for better PWA discovery
    // screenshots: [
    //   {
    //     src: '/screenshot-wide.png',
    //     type: 'image/png',
    //     sizes: '1280x720',
    //     form_factor: 'wide',
    //     label: 'Kiara Kraft homepage showcasing handcrafted products'
    //   },
    //   {
    //     src: '/screenshot-narrow.png', 
    //     type: 'image/png',
    //     sizes: '750x1334',
    //     form_factor: 'narrow',
    //     label: 'Browse products on mobile'
    //   },
    // ],
  }
}