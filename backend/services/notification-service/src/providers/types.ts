export type ProviderChannel = 'SMS' | 'WHATSAPP' | 'PUSH' | 'EMAIL';

export interface SendRequest {
  /** msisdn in E.164, email address, or FCM device token. */
  destination: string;
  title: string;
  body: string;
  /** Deep-link payload; only push and email carry it. */
  data?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  /** Provider's message id, for reconciling delivery receipts later. */
  providerMessageId?: string;
  error?: string;
  /**
   * Whether retrying could plausibly succeed. A malformed number or an
   * unregistered device token is permanent — retrying it four times just
   * burns the queue and delays everything behind it.
   */
  retryable?: boolean;
}

export interface NotificationProvider {
  readonly name: string;
  readonly channel: ProviderChannel;
  /** False when credentials are missing, so the dispatcher can skip it. */
  isConfigured(): boolean;
  send(request: SendRequest): Promise<SendResult>;
}
