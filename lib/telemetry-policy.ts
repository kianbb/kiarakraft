import type { Event } from '@sentry/nextjs';

type SentryOptions = Parameters<typeof import('@sentry/nextjs').init>[0];

// Sentry 11 enables broader collection by default. Keep it explicitly restricted.
export const telemetryPrivacyOptions = {
  traceLifecycle: 'static',
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    mcp: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    graphQL: { document: false, variables: false },
    stackFrameVariables: false,
    frameContextLines: 0,
  },
} satisfies Pick<SentryOptions, 'traceLifecycle' | 'dataCollection'>;

// Automatic collection options do not remove manually supplied context.
// Retain trace correlation and operational tags; omit unrestricted account data.
export function redactTelemetryEvent<T extends Event>(event: T): T {
  delete event.user;
  delete event.request;
  delete event.extra;
  delete event.breadcrumbs;
  if (event.contexts) {
    const trace = event.contexts.trace;
    event.contexts = trace
      ? { trace: { trace_id: trace.trace_id, span_id: trace.span_id } }
      : {};
  }
  if (event.tags) {
    event.tags = Object.fromEntries(
      Object.entries(event.tags).filter(([key]) =>
        [
          'component',
          'runtime',
          'platform',
          'nodeVersion',
          'memoryUsage',
        ].includes(key)
      )
    );
  }
  return event;
}
