import { describe, it, expect, beforeAll, jest } from '@jest/globals';

// ─── A seller's scorecard is not public to every signed-in account ────────────
//
// The route was `authenticate` only, with no check tying the caller to the
// `:sellerId` in the path. Any account that could log in — including a
// competing seller, or a customer — could read any seller's order defect rate,
// late shipment rate, cancellation rate, standing and the reason behind it.
// That is the enforcement record the platform acts on, and a direct read on a
// rival's health.
//
// It is now the seller themselves or an admin. The separate public
// `/:sellerId/trust-score` route is unchanged: score and badges are what the
// storefront already shows shoppers.

process.env.DATABASE_URL ??= 'postgresql://muni:muni@localhost:5432/muni_user_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const getTrustProfile = jest.fn<(id: string) => Promise<unknown>>();

jest.unstable_mockModule('../services/sellerTrust.service.js', () => ({
  getTrustProfile,
  recordEvent: jest.fn(),
  setVerifiedMerchant: jest.fn(),
  applyStanding: jest.fn(),
}));

type Controller = typeof import('../controllers/sellerTrust.controller.js');
let controller: Controller;

beforeAll(async () => {
  controller = await import('../controllers/sellerTrust.controller.js');
});

const profile = {
  sellerId: 'seller-1',
  scorecard: { minimumSampleSize: 10 },
  standing: 'AT_RISK',
  standingReason: 'Above target: late shipment rate 6.0% (target 4.0%)',
  recommendedStanding: 'AT_RISK',
  lastCalculatedAt: '2026-09-01T00:00:00.000Z',
};

interface Captured { status: number; body: unknown }

/** What ApiError puts on the wire; `statusCode`, not `status`. */
interface ThrownError { statusCode?: number; message?: string }

/** Runs the handler and reports what reached the response, or what was thrown. */
async function call(
  viewer: { id: string; role: string } | undefined,
  sellerId: string,
): Promise<{ captured: Captured; thrown: ThrownError | null; fetched: boolean }> {
  getTrustProfile.mockResolvedValue(profile);

  const captured: Captured = { status: 200, body: undefined };
  const res = {
    status(code: number) { captured.status = code; return this; },
    json(payload: unknown) { captured.body = payload; return this; },
  };
  const req = { params: { sellerId }, user: viewer };

  // asyncHandler returns void and routes failures to next(err), so the
  // settled state is whichever of next()/res.json() ran by the time the
  // microtask queue drains.
  // Annotated through the return type rather than inferred: TS narrows a
  // `let` initialised to null and only reassigned inside the callback below
  // down to `never`, which makes every property access on it an error.
  let thrown: ThrownError | null = null;
  const handler = controller.getScorecard as unknown as (
    q: unknown, s: unknown, n: (e?: unknown) => void,
  ) => void;

  handler(req, res, (err?: unknown) => {
    if (err) thrown = err as ThrownError;
  });
  await new Promise((resolve) => setImmediate(resolve));

  return { captured, thrown, fetched: getTrustProfile.mock.calls.length > 0 };
}

describe('who may read a seller scorecard', () => {
  it('serves the seller their own', async () => {
    const { captured, thrown } = await call({ id: 'seller-1', role: 'SELLER' }, 'seller-1');

    expect(thrown).toBeNull();
    expect(captured.status).toBe(200);
    expect((captured.body as { data: { standing: string } }).data.standing).toBe('AT_RISK');
  });

  it('serves an admin, who needs it for enforcement', async () => {
    const { captured, thrown } = await call({ id: 'admin-9', role: 'ADMIN' }, 'seller-1');

    expect(thrown).toBeNull();
    expect(captured.status).toBe(200);
  });

  it('refuses a different seller', async () => {
    const { thrown } = await call({ id: 'seller-2', role: 'SELLER' }, 'seller-1');

    expect(thrown).not.toBeNull();
    expect(thrown!.statusCode).toBe(403);
  });

  it('refuses a signed-in customer', async () => {
    const { thrown } = await call({ id: 'cust-3', role: 'CUSTOMER' }, 'seller-1');

    expect(thrown).not.toBeNull();
    expect(thrown!.statusCode).toBe(403);
  });

  it('does not read the profile at all for a caller it refuses', async () => {
    // The refusal has to come before the lookup, or a 403 still costs a query
    // and still confirms whether that seller exists.
    getTrustProfile.mockClear();
    await call({ id: 'seller-2', role: 'SELLER' }, 'seller-1');

    expect(getTrustProfile).not.toHaveBeenCalled();
  });
});
