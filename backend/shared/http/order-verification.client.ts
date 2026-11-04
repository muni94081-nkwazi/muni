import { signServiceIdentity, INTERNAL_IDENTITY_HEADER } from '../utils/internal-identity.js';

export interface VerifiableOrder {
  id: string;
  userId: string;
  status?: string;
  deliveredAt?: string | null;
  items?: Array<{ id?: string; sellerId?: string; productId?: string; variantId?: string; quantity?: number }>;
  subOrders?: Array<{
    id?: string;
    sellerId?: string;
    status?: string;
    deliveredAt?: string | null;
    items?: Array<{ id?: string; sellerId?: string; productId?: string; variantId?: string; quantity?: number }>;
  }>;
}

export class OrderVerificationError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason: 'not_found' | 'unavailable',
  ) {
    super(message);
    this.name = 'OrderVerificationError';
  }
}

export interface OrderVerificationConfig {
  serviceName: string;
  baseUrl: string;
  timeoutMs: number;
  logger: { error: (msg: string, meta?: Record<string, unknown>) => void };
}

export function createOrderVerificationClient(config: OrderVerificationConfig) {
  async function fetchOrderForBuyer(orderId: string, buyerId: string): Promise<VerifiableOrder> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-user-id': buyerId,
    };
    const assertion = signServiceIdentity(buyerId, [], config.serviceName);
    if (assertion) headers[INTERNAL_IDENTITY_HEADER] = assertion;

    let response: Response;
    try {
      response = await fetch(
        `${config.baseUrl}/api/v1/orders/${encodeURIComponent(orderId)}`,
        { method: 'GET', headers, signal: controller.signal },
      );
    } catch (err) {
      const reason =
        (err as Error).name === 'AbortError'
          ? `timed out after ${config.timeoutMs}ms`
          : (err as Error).message;
      config.logger.error('[order-client] order verification call failed', { orderId, reason });
      throw new OrderVerificationError(
        503,
        'Could not verify the order right now. Please try again shortly.',
        'unavailable',
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404 || response.status === 403) {
      throw new OrderVerificationError(404, 'Order not found', 'not_found');
    }

    if (!response.ok) {
      config.logger.error('[order-client] unexpected status verifying order', {
        orderId,
        status: response.status,
      });
      throw new OrderVerificationError(
        503,
        'Could not verify the order right now. Please try again shortly.',
        'unavailable',
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const order = (body as { data?: VerifiableOrder } | null)?.data;

    if (!order || typeof order.userId !== 'string') {
      config.logger.error('[order-client] order verification response was malformed', { orderId });
      throw new OrderVerificationError(
        503,
        'Could not verify the order right now. Please try again shortly.',
        'unavailable',
      );
    }

    if (order.userId !== buyerId) {
      throw new OrderVerificationError(404, 'Order not found', 'not_found');
    }

    return order;
  }

  return { fetchOrderForBuyer };
}
