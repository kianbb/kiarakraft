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
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    lang: 'fa',
    dir: 'rtl',
    orientation: 'portrait',
    categories: ['shopping', 'lifestyle', 'business'],
    screenshots: [
      {
        src: '/screenshot-wide.png',
        type: 'image/png',
        sizes: '1280x720',
        form_factor: 'wide',
      },
      {
        src: '/screenshot-narrow.png',
        type: 'image/png',
        sizes: '750x1334',
        form_factor: 'narrow',
      },
    ],
  }
}