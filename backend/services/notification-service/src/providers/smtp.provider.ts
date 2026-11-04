import nodemailer, { type Transporter } from 'nodemailer';
import env from '../config/env.js';
import logger from '../config/logger.js';
import type { NotificationProvider, SendRequest, SendResult } from './types.js';

// ─── Email (SMTP) ───────────────────────────────────────────────────────────
//
// Included because the user preference model already has per-category email
// switches; without a driver those switches would be dead configuration.
// Deliberately plain-text-with-a-minimal-HTML-wrapper — a templating engine
// belongs behind a design review, not in the transport.

export class SmtpProvider implements NotificationProvider {
  readonly name = 'smtp';
  readonly channel = 'EMAIL' as const;

  private transporter: Transporter | null = null;

  isConfigured(): boolean {
    return env.smtp.enabled && Boolean(env.smtp.host);
  }

  private getTransporter(): Transporter {
    // Created lazily and reused: nodemailer pools connections per transport,
    // and building one per send defeats that.
    this.transporter ??= nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
      pool: true,
    });
    return this.transporter;
  }

  async send(request: SendRequest): Promise<SendResult> {
    try {
      const info = await this.getTransporter().sendMail({
        from: env.smtp.from,
        to: request.destination,
        subject: request.title,
        text: request.body,
        html: `<p>${escapeHtml(request.body).replace(/\n/g, '<br>')}</p>`,
      });

      return { ok: true, providerMessageId: info.messageId };
    } catch (err) {
      const message = (err as Error).message;
      logger.warn('smtp send failed', { error: message });

      // 5xx SMTP replies are permanent rejections (bad mailbox, blocked);
      // 4xx are transient (greylisting, rate limit) and worth another attempt.
      const permanent = /\b5\d{2}\b/.test(message);
      return { ok: false, error: message, retryable: !permanent };
    }
  }

  async close(): Promise<void> {
    this.transporter?.close();
    this.transporter = null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const smtpProvider = new SmtpProvider();
