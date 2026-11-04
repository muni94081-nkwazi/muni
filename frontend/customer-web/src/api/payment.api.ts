import { apiClient } from './axios.config';
import type { ApiEnvelope } from '@/types/api.types';
import type { InitiatePaymentPayload, Order } from '@/types/order.types';

/**
 * payment-service itself has no browser-facing routes — its
 * /payments/initiate|status|refund endpoints are service-to-service
 * only, called directly by order-service inside the Docker network
 * (see InternalServiceMiddleware in payment-service). The frontend's
 * "pay for this order" action is therefore a call to order-service,
 * which internally talks to payment-service and polls/streams the
 * result back via the order's own status.
 */
export const paymentApi = {
  async initiatePayment(orderId: string, payload: InitiatePaymentPayload): Promise<Order> {
    const { data } = await apiClient.post<ApiEnvelope<Order>>(`/orders/${orderId}/payment`, payload);
    return data.data;
  },

  /**
   * Polls the order's current status while a mobile money prompt is
   * outstanding. The frontend doesn't talk to payment-service directly;
   * it just re-fetches the order and watches `status` transition from
   * payment_processing → paid/payment_failed.
   */
  async pollOrderStatus(orderId: string): Promise<Order> {
    const { data } = await apiClient.get<ApiEnvelope<Order>>(`/orders/${orderId}`);
    return data.data;
  },
};
