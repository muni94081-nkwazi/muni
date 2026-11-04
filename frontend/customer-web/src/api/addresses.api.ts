import { apiClient } from './axios.config';
import type { ApiEnvelope } from '@/types/api.types';
import type {
  CreateAddressInput,
  SavedAddress,
  UpdateAddressInput,
} from '@/types/address.types';

/**
 * The saved address book — user-service, mounted by the gateway at
 * `auth('/addresses', targets.user)`.
 *
 * Every route is scoped to the authenticated user server-side, which is why
 * none of these take a userId: a caller cannot read or mutate anyone else's
 * book even by guessing an id.
 */
export const addressesApi = {
  list: async (): Promise<SavedAddress[]> => {
    const { data } = await apiClient.get<ApiEnvelope<SavedAddress[]>>('/addresses');
    return data.data;
  },

  create: async (input: CreateAddressInput): Promise<SavedAddress> => {
    const { data } = await apiClient.post<ApiEnvelope<SavedAddress>>('/addresses', input);
    return data.data;
  },

  update: async (id: string, input: UpdateAddressInput): Promise<SavedAddress> => {
    const { data } = await apiClient.patch<ApiEnvelope<SavedAddress>>(`/addresses/${id}`, input);
    return data.data;
  },

  /**
   * POST, not PATCH — user-service exposes this as its own route so the
   * "exactly one default" invariant is applied in a transaction rather than
   * being assembled from two independent updates.
   */
  setDefault: async (id: string): Promise<SavedAddress> => {
    const { data } = await apiClient.post<ApiEnvelope<SavedAddress>>(`/addresses/${id}/default`);
    return data.data;
  },

  /** 204, no body. Soft-deleted server-side — orders keep their own snapshot. */
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/addresses/${id}`);
  },
};
