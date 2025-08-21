import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay for debugging
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Enhanced debugging in development
  debug: process.env.NODE_ENV === 'development',

  // Ignore certain errors to reduce noise
  ignoreErrors: [
    // Browser extensions
    'Non-Error promise rejection captured',
    'ResizeObserver loop limit exceeded',
    // Network errors
    'NetworkError',
    'Failed to fetch',
    // User agent parsing errors
    'ChunkLoadError',
    'Loading chunk',
  ],

  // Configure which URLs to capture
  allowUrls: [process.env.PUBLIC_APP_BASE || 'http://localhost:3000'],

  // Enhanced context
  initialScope: {
    tags: {
      component: 'client',
    },
  },

  beforeSend(event, hint) {
    // Filter out development errors in production
    if (process.env.NODE_ENV === 'production') {
      // Don't send console errors unless they're actual errors
      if (event.level === 'warning' || event.level === 'info') {
        return null;
      }
    }

    // Add additional context
    if (typeof window !== 'undefined') {
      event.tags = {
        ...event.tags,
        url: window.location.href,
        userAgent: navigator.userAgent,
      };
    }

    return event;
  },
});
