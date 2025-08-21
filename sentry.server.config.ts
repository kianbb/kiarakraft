import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Enhanced debugging in development
  debug: process.env.NODE_ENV === 'development',

  // Server-specific configuration
  integrations: [Sentry.httpIntegration()],

  // Enhanced context for server
  initialScope: {
    tags: {
      component: 'server',
      runtime: 'nodejs',
    },
  },

  beforeSend(event, hint) {
    // Add server-specific context
    event.tags = {
      ...event.tags,
      platform: process.platform,
      nodeVersion: process.version,
    };

    // Don't send certain development errors in production
    if (process.env.NODE_ENV === 'production') {
      // Filter out verbose Prisma logs
      if (event.exception?.values?.[0]?.value?.includes('Prisma')) {
        const error = event.exception.values[0].value;
        if (error.includes('Query engine')) {
          return null; // Skip query engine verbose logs
        }
      }
    }

    return event;
  },

  // Capture additional server context
  beforeSendTransaction(event) {
    // Add performance context
    event.tags = {
      ...event.tags,
      memoryUsage:
        Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    };

    return event;
  },
});
