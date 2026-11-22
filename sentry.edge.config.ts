import * as Sentry from '@sentry/nextjs';
import {
  telemetryPrivacyOptions,
  redactTelemetryEvent,
} from './lib/telemetry-policy';
import { isStagingDeployment } from './lib/deployment-policy';

if (!isStagingDeployment())
  Sentry.init({
    ...telemetryPrivacyOptions,
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',

    // Performance Monitoring for Edge Runtime
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

    // Edge-specific configuration
    debug: process.env.NODE_ENV === 'development',

    // Enhanced context for edge runtime
    initialScope: {
      tags: {
        component: 'edge',
        runtime: 'edge',
      },
    },

    beforeSend(event) {
      // Add edge-specific context
      event.tags = {
        ...event.tags,
        runtime: 'edge',
      };

      return redactTelemetryEvent(event);
    },
  });
