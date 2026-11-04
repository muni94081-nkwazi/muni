import type { Request, Response } from 'express';

// ─── Shared Deep Health Check ──────────────────────────────────────────────────
//
// Each service registers its dependency checks (DB, Redis, Kafka) and then
// mounts the two standard endpoints:
//
//   GET /health/live   → always 200 if the process is alive (liveness probe)
//   GET /health/ready  → 200 only if all critical checks pass (readiness probe)
//
// Usage in service app.ts:
//   import { createHealthRouter } from '../../../shared/health/health-check.js';
//
//   const health = createHealthRouter('product-service', [
//     { name: 'mongodb', critical: true,  check: () => mongoose.connection.readyState === 1 },
//     { name: 'redis',   critical: false, check: () => isCacheReady() },
//   ]);
//   app.use(health);

export interface HealthCheckDep {
  /** Human-readable name of the dependency (e.g. 'postgres', 'redis', 'kafka'). */
  name:     string;
  /** If true and this check fails, the /ready endpoint returns 503. */
  critical: boolean;
  /** Returns true when the dependency is healthy. Must not throw. */
  check:    () => boolean | Promise<boolean>;
}

export interface HealthStatus {
  service:  string;
  ready:    boolean;
  ts:       string;
  checks:   Array<{ name: string; status: 'up' | 'down'; critical: boolean }>;
}

export function createHealthRouter(
  serviceName: string,
  deps:        HealthCheckDep[] = [],
) {
  return {
    /** Attach to an Express app: app.use(createHealthRouter(...)); */
    async handleLive(_req: Request, res: Response): Promise<void> {
      res.json({ service: serviceName, status: 'up', ts: new Date().toISOString() });
    },

    async handleReady(_req: Request, res: Response): Promise<void> {
      const results = await Promise.all(
        deps.map(async (dep) => {
          let up = false;
          try { up = await dep.check(); } catch { up = false; }
          return { name: dep.name, status: (up ? 'up' : 'down') as 'up' | 'down', critical: dep.critical };
        }),
      );

      const criticalDown = results.some((r) => r.critical && r.status === 'down');
      const status: HealthStatus = {
        service: serviceName,
        ready:   !criticalDown,
        ts:      new Date().toISOString(),
        checks:  results,
      };

      res.status(criticalDown ? 503 : 200).json(status);
    },
  };
}

// ─── Convenience: mount both endpoints directly onto an Express Router ─────────

import { Router } from 'express';

export function mountHealthRoutes(
  serviceName: string,
  deps:        HealthCheckDep[] = [],
): Router {
  const router  = Router();
  const handler = createHealthRouter(serviceName, deps);

  router.get('/health/live',  (req, res) => handler.handleLive(req, res));
  router.get('/health/ready', (req, res) => handler.handleReady(req, res));
  router.get('/health',       (_req, res) => res.redirect('/health/live'));

  return router;
}
