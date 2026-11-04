import { useCallback, useEffect, useState } from 'react';
import { recommendationsApi, type RecommendedProduct } from '@/api/recommendations.api';

export function useRecommendations(context: 'home' | 'cart' | 'pdp' = 'home', productId?: string) {
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = productId
        ? await recommendationsApi.getSimilar(productId)
        : await recommendationsApi.getForUser(undefined, 10, context);
      setRecommendations(data);
    } catch {
      setRecommendations([]);
    } finally {
      setIsLoading(false);
    }
  }, [context, productId]);

  useEffect(() => { void fetch(); }, [fetch]);

  return { recommendations, isLoading, refetch: fetch };
}
