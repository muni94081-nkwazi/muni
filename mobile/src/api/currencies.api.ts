import { apiClient, type ApiEnvelope } from './client';
import type { Currency } from '@/types';

export interface ConversionResult {
  converted: number;
  rate: number;
}

export const currenciesApi = {
  getSupportedCurrencies: async (): Promise<Currency[]> => {
    const { data } = await apiClient.get<ApiEnvelope<Currency[]>>('/api/v1/currencies');
    return data.data;
  },

  convertAmount: async (from: string, to: string, amount: number): Promise<ConversionResult> => {
    const { data } = await apiClient.get<ApiEnvelope<ConversionResult>>(
      '/api/v1/currencies/convert',
      { params: { from, to, amount } }
    );
    return data.data;
  },
};
