export const env = {
  port: Number(process.env.PORT ?? 4021),

  buyerProtectionService: {
    baseUrl: process.env.BUYER_PROTECTION_SERVICE_URL ?? 'http://localhost:4026',
    timeoutMs: Number(process.env.BUYER_PROTECTION_SERVICE_TIMEOUT_MS ?? 5000),
  },

  // The authoritative source for order ownership and seller association.
  // 4003 matches order-service's own default port, the gateway's target map,
  // and every ORDER_SERVICE_URL in docker-compose.
  orderService: {
    baseUrl: process.env.ORDER_SERVICE_URL ?? 'http://localhost:4003',
    timeoutMs: Number(process.env.ORDER_SERVICE_TIMEOUT_MS ?? 5000),
  },

  userService: {
    baseUrl: process.env.USER_SERVICE_URL ?? 'http://localhost:3001',
    timeoutMs: Number(process.env.USER_SERVICE_TIMEOUT_MS ?? 5000),
  },

  /** How often the SLA-escalation sweep checks for disputes past their 72h resolution deadline. */
  slaSweepIntervalMs: Number(process.env.DISPUTE_SLA_SWEEP_INTERVAL_MS ?? 60_000),
} as const;
