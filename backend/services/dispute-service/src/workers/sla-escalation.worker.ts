import { env } from '../config/env.js';
import { disputeService } from '../services/dispute.service.js';
import { logger } from '../utils/logger.js';

// ─── SLA Auto-Escalation Worker ─────────────────────────────────────────────
//
// Periodically checks every open dispute against its 72-hour seller
// resolution deadline and escalates anything that's expired straight to
// the admin panel (UNDER_MEDIATION + a `dispute.auto_escalated` event),
// rather than waiting for a human to happen to load the dispute and trigger
// the lazy check in `disputeService.getDisputeById`.

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startSlaEscalationWorker(): void {
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    void disputeService.runSlaEscalationSweep().then(({ checked, escalated }) => {
      if (escalated > 0) {
        logger.info(`[sla-escalation-worker] Sweep: ${escalated}/${checked} disputes auto-escalated`);
      }
    });
  }, env.slaSweepIntervalMs);

  intervalHandle.unref?.();

  logger.info(`[sla-escalation-worker] Started — sweeping every ${env.slaSweepIntervalMs}ms`);
}

export function stopSlaEscalationWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
