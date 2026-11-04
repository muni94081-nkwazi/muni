/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CHAT_SERVICE_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_DEFAULT_CURRENCY: string;
  /** Dev-only opt-in: serve mock data instead of failing when :8080 is unreachable. See src/api/devMocks.ts. */
  readonly VITE_USE_MOCK_API?: string;
  /** Error tracking. Unset disables Sentry entirely — see src/observability/sentry.ts. */
  readonly VITE_SENTRY_DSN?: string;
  /** 0-1. Defaults to 0.1; traces are billed per event, so this is deployment-tunable. */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  /** Tags events with a build, so a regression can be tied to a release. */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
