import { env } from '../config/env.js';
import { escrowHoldService } from '../services/escrow-hold.service.js';

// ─── Auto-Release Sweep Worker ──────────────────────────────────────────────
//
// Periodically releases any escrow hold whose 7-day-post-delivery,
// no-dispute window has passed. This is what actually enforces "release
// automatically after 7 days" — `EscrowHold.autoReleaseAt` is inert data
// until something checks it, which is what this worker does.

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startEscrowReleaseWorker(): void {
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    void escrowHoldService.runAutoReleaseSweep().then(({ checked, released, failed }) => {
      if (checked > 0) {
        console.log(`[escrow-release-worker] Sweep: ${released}/${checked} holds released${failed ? `, ${failed} failed (will retry)` : ''}`);
      }
    });
  }, env.escrow.sweepIntervalMs);

  // Don't keep the process alive solely for this timer during shutdown.
  intervalHandle.unref?.();

  console.log(`[escrow-release-worker] Started — sweeping every ${env.escrow.sweepIntervalMs}ms`);
}

export function stopEscrowReleaseWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
