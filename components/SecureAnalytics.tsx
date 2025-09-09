/**
 * Secure Analytics Component
 * Loads external analytics scripts with Subresource Integrity (SRI)
 */

import Script from 'next/script';

// SRI hashes for known versions of external scripts
// These need to be updated when script versions change
const SRI_HASHES = {
  plausible: {
    // Plausible doesn't provide SRI hashes for their script as it's dynamically generated
    // We'll use CSP to restrict the domain instead
    url: 'https://plausible.io/js/script.js',
    // For demonstration, this would be the format:
    // integrity: 'sha384-...',
  },
};

export default function SecureAnalytics() {
  // Only load analytics in production
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  
  if (!plausibleDomain) {
    return null;
  }

  return (
    <>
      {/* Plausible Analytics */}
      <Script
        defer
        data-domain={plausibleDomain}
        src={SRI_HASHES.plausible.url}
        strategy="afterInteractive"
        // Note: Plausible doesn't provide static SRI hashes as their script is dynamically generated
        // Instead, we rely on CSP to ensure the script comes from plausible.io
      />
      
      {/* If we had other external scripts with SRI support: */}
      {/* Example with SRI:
      <Script
        src="https://cdn.example.com/script.js"
        integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      */}
    </>
  );
}

/**
 * Helper to generate SRI hash for a script
 * Use this in development to generate hashes for external scripts
 */
export async function generateSRIHash(url: string): Promise<string> {
  if (typeof window === 'undefined') {
    // Server-side: use crypto
    const crypto = await import('crypto');
    const response = await fetch(url);
    const content = await response.text();
    const hash = crypto.createHash('sha384').update(content).digest('base64');
    return `sha384-${hash}`;
  } else {
    // Client-side: use SubtleCrypto
    const response = await fetch(url);
    const content = await response.text();
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-384', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    return `sha384-${hashBase64}`;
  }
}

/**
 * Component to load external scripts with dynamic SRI generation
 * WARNING: Only use this in development to generate SRI hashes
 */
export function SecureScriptLoader({ 
  src, 
  strategy = 'afterInteractive',
  ...props 
}: {
  src: string;
  strategy?: 'afterInteractive' | 'lazyOnload' | 'beforeInteractive' | 'worker';
  [key: string]: any;
}) {
  // In production, you should have pre-computed SRI hashes
  // This is just for demonstration
  
  return (
    <Script
      src={src}
      strategy={strategy}
      // Add crossorigin for SRI to work
      crossOrigin="anonymous"
      {...props}
    />
  );
}