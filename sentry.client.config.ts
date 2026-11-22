import * as Sentry from '@sentry/nextjs';
import {
  telemetryPrivacyOptions,
  redactTelemetryEvent,
} from './lib/telemetry-policy';

// The deployment build supplies this public boolean; no credentials are exposed.
if (process.env.NEXT_PUBLIC_KK_STAGING !== 'true')
  Sentry.init({
    ...telemetryPrivacyOptions,
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session Replay for debugging
    replaysSessionSampleRate:
      process.env.NODE_ENV === 'production' ? 0.01 : 0.1,
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

    beforeSend(event) {
      // Filter out development errors in production
      if (process.env.NODE_ENV === 'production') {
        // Don't send console errors unless they're actual errors
        if (event.level === 'warning' || event.level === 'info') {
          return null;
        }
      }

      return redactTelemetryEvent(event);
    },
  });
