// Utility for safe Plausible analytics calls (no-op in development)

declare global {
  interface Window {
    plausible?: (
      eventName: string,
      options?: { props?: Record<string, string | number> }
    ) => void;
  }
}

export function trackEvent(
  eventName: string,
  props?: Record<string, string | number>
) {
  if (
    typeof window !== 'undefined' &&
    window.plausible &&
    process.env.NODE_ENV === 'production'
  ) {
    window.plausible(eventName, props ? { props } : undefined);
  }
}

export function trackProductView(slug: string, locale: string) {
  trackEvent('Product View', { slug, locale });
}
