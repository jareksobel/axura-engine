import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  release:     process.env.SENTRY_RELEASE,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Only enable when DSN is configured — prevents noise in local dev
  enabled: Boolean(process.env.SENTRY_DSN),
});
