/**
 * sentry.pipeline.test.ts
 *
 * "Trigger a test error and confirm it appears in Sentry" — done locally, and
 * repeatably, instead of once by hand against a live project.
 *
 * sentry.scrubbing.test.ts covers the redaction helpers as pure functions.
 * That is necessary and not sufficient: it proves the scrubber works, not that
 * it is WIRED. A `beforeSend` that was never attached, or attached to a config
 * the SDK ignored, would pass every one of those assertions while shipping
 * bearer tokens to a third party.
 *
 * So this initialises the real @sentry/node with a stub transport and captures
 * a real exception, then asserts on the envelope the SDK would have put on the
 * wire. Nothing leaves the process — which is also why this is safe to run in
 * CI, where sending to a real DSN would be both unavailable and unwanted.
 */
import { jest, describe, it, expect, beforeAll } from '@jest/globals';

/** Envelopes the stub transport intercepted, newest last. */
const sent: unknown[] = [];

/**
 * Pull the event payload out of a Sentry envelope.
 *
 * An envelope is [header, [[itemHeader, itemPayload], ...]]; the event is the
 * first item whose header type is 'event'.
 */
function eventFrom(envelope: unknown): Record<string, unknown> | null {
  const [, items] = envelope as [unknown, Array<[{ type?: string }, unknown]>];
  for (const [header, payload] of items ?? []) {
    if (header?.type === 'event') return payload as Record<string, unknown>;
  }
  return null;
}

let Sentry: typeof import('@sentry/node');
let sentryModule: typeof import('../../../../shared/observability/sentry.js');

beforeAll(async () => {
  process.env.SENTRY_DSN = 'https://publickey@o0.ingest.sentry.io/0';
  process.env.NODE_ENV = 'test';

  Sentry = await import('@sentry/node');
  sentryModule = await import('../../../../shared/observability/sentry.js');

  sentryModule.initSentry('auth-service');

  // Replace the network transport AFTER init, so the real initSentry config —
  // including its beforeSend — is what runs. Swapping the client would test a
  // different pipeline than production uses.
  const client = Sentry.getClient();
  if (!client) throw new Error('Sentry did not initialise — the rest of this file would be vacuous');

  const transport = client.getTransport();
  if (!transport) throw new Error('Sentry client has no transport');

  transport.send = async (envelope: unknown) => {
    sent.push(envelope);
    return {};
  };
});

/** Capture, flush, and hand back the event that would have been transmitted. */
async function captureAndRead(fn: () => void): Promise<Record<string, unknown>> {
  sent.length = 0;
  fn();
  await Sentry.flush(2000);
  expect(sent.length).toBeGreaterThan(0);
  const event = eventFrom(sent[sent.length - 1]);
  if (!event) throw new Error('No event item in the captured envelope');
  return event;
}

describe('the SDK is actually wired', () => {
  it('reports enabled once a DSN is configured', () => {
    expect(sentryModule.sentryEnabled()).toBe(true);
  });

  it('transmits an envelope when an exception is captured', async () => {
    const event = await captureAndRead(() => {
      sentryModule.captureError(new Error('deliberate test error'));
    });

    expect(event.exception).toBeDefined();
    expect(JSON.stringify(event.exception)).toContain('deliberate test error');
  });

  it('tags the event with the service, so 34 services are separable', async () => {
    const event = await captureAndRead(() => {
      sentryModule.captureError(new Error('tagged'));
    });

    expect((event.tags as Record<string, string>)?.service).toBe('auth-service');
  });

  it('carries the route context a caller attaches', async () => {
    const event = await captureAndRead(() => {
      sentryModule.captureError(new Error('with context'), {
        route: '/api/v1/auth/login',
        method: 'POST',
        status: 500,
        userId: 'user-1',
      });
    });

    const tags = event.tags as Record<string, string>;
    expect(tags.route).toBe('/api/v1/auth/login');
    expect(tags.method).toBe('POST');
    // The user id is an opaque UUID, not PII on its own, and it is the single
    // most useful thing for correlating an error with a support report.
    expect((event.user as Record<string, string>)?.id).toBe('user-1');
  });
});

describe('beforeSend actually runs on a real event', () => {
  it('redacts credentials from `extra` before transmission', async () => {
    // The assertion that the pure-function tests cannot make: that the
    // scrubber is attached to the config the SDK is using.
    const event = await captureAndRead(() => {
      Sentry.withScope((scope) => {
        scope.setExtras({
          authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.real-token',
          password: 'hunter2-but-longer!',
          refreshToken: 'live-refresh-token',
          email: 'shopper@example.com',
        });
        Sentry.captureException(new Error('carrying credentials'));
      });
    });

    const extra = event.extra as Record<string, unknown>;
    expect(extra.authorization).toBe('[redacted]');
    expect(extra.password).toBe('[redacted]');
    expect(extra.refreshToken).toBe('[redacted]');
    // The address is what makes the event actionable and is not a credential.
    expect(extra.email).toBe('shopper@example.com');
  });

  it('redacts a token nested arbitrarily deep in extra', async () => {
    // Built at runtime rather than written as a literal. Sentry's ContextLines
    // integration attaches the SOURCE of every stack frame, so a literal in
    // this file would appear in the envelope as source code — which looked like
    // a scrubber failure the first time this was written, and is not one.
    const secret = ['eyJ', 'A-VERY-DISTINCTIVE', 'TOKEN'].join('-');

    const event = await captureAndRead(() => {
      Sentry.withScope((scope) => {
        scope.setExtras({ accessToken: secret, nested: { refresh_token: secret } });
        Sentry.captureException(new Error('token hunt'));
      });
    });

    const extra = event.extra as Record<string, unknown>;
    expect(extra.accessToken).toBe('[redacted]');
    expect((extra.nested as Record<string, unknown>).refresh_token).toBe('[redacted]');
    expect(JSON.stringify(event.extra)).not.toContain(secret);
  });

  it('does NOT attach local variable values to stack frames', async () => {
    // @sentry/node enables `LocalVariables` by default. It attaches the VALUES
    // of locals to each frame — which on this service means input.password in
    // login(), rawToken in refresh(), otp in resetPassword(). beforeSend cannot
    // reach those: they sit inside the stacktrace frame structure, not in
    // request or extra, so the integration has to be off.
    //
    // Asserted on `vars` — the key the integration adds — rather than on a
    // sentinel string, because ContextLines legitimately echoes the SOURCE of
    // every frame, and a sentinel written in this file would appear there as
    // source code rather than as a leaked value.
    const event = await captureAndRead(() => {
      sentryModule.captureError(new Error('locals check'));
    });

    expect(JSON.stringify(event.exception)).not.toContain('"vars"');
  });

  it('drops console breadcrumbs entirely', async () => {
    // The Console integration turns every console.* call into a breadcrumb,
    // arguments included, and auth.service logs a password-reset OTP in
    // non-production.
    //
    // The first attempt at this regex-scrubbed the breadcrumb text. This test
    // caught it redacting the WORD "OTP" while leaving the six digits that
    // followed the email address — scrubbing arbitrary prose is guesswork.
    // Dropping the breadcrumb is not.
    const otp = '918273';

    const event = await captureAndRead(() => {
      console.warn(`[auth-service][dev] Password reset OTP for a@b.com: ${otp}`);
      sentryModule.captureError(new Error('breadcrumb check'));
    });

    const breadcrumbs = JSON.stringify(event.breadcrumbs ?? []);
    expect(breadcrumbs).not.toContain(otp);
    expect(breadcrumbs).not.toContain('"category":"console"');
  });

  it('strips the OAuth exchange code from a request URL', async () => {
    // The whole point of moving tokens out of the redirect was to keep
    // credentials out of URLs. Sentry records the request URL on every event,
    // so without this the code would come straight back via the error tracker.
    const code = ['abc', '123', 'def'].join('-');

    const event = await captureAndRead(() => {
      Sentry.withScope((scope) => {
        scope.setContext('request', { url: `https://muni.ug/auth/callback?code=${code}` });
        Sentry.captureException(new Error('oauth failure'));
      });
    });

    expect(JSON.stringify(event.contexts)).not.toContain(code);
  });

  it('does not send PII by default', async () => {
    const event = await captureAndRead(() => {
      sentryModule.captureError(new Error('no pii'));
    });

    // sendDefaultPii would attach the client IP as {{auto}}.
    expect((event.user as Record<string, string>)?.ip_address).toBeUndefined();
  });
});

describe('flush', () => {
  it('resolves, so a crashing process can drain its buffer before exit', async () => {
    // process.exit drops whatever is still buffered — including the error that
    // caused the exit. The shutdown handlers await this first.
    await expect(sentryModule.flushSentry(1000)).resolves.toBeUndefined();
  });
});
