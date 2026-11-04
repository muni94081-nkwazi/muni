export const env = {
  port: Number(process.env.PORT ?? 4026),

  paymentService: {
    baseUrl: process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:4005',
    timeoutMs: Number(process.env.PAYMENT_SERVICE_TIMEOUT_MS ?? 5000),
  },

  // The authoritative source for order ownership. A claim is a request to
  // reverse someone's payment, so the order it names has to be the claimant's
  // own — the same check dispute-service and return-service already make.
  orderService: {
    baseUrl: process.env.ORDER_SERVICE_URL ?? 'http://localhost:4003',
    timeoutMs: Number(process.env.ORDER_SERVICE_TIMEOUT_MS ?? 5000),
  },

  userService: {
    baseUrl: process.env.USER_SERVICE_URL ?? 'http://localhost:3001',
    timeoutMs: Number(process.env.USER_SERVICE_TIMEOUT_MS ?? 5000),
  },

  escrow: {
    /** Days after verified delivery before a dispute-free hold auto-releases to the seller. */
    autoReleaseDays: Number(process.env.ESCROW_AUTO_RELEASE_DAYS ?? 7),
    /** How often the auto-release sweep checks for past-due holds. */
    sweepIntervalMs: Number(process.env.ESCROW_SWEEP_INTERVAL_MS ?? 60_000),
  },
} as const;
