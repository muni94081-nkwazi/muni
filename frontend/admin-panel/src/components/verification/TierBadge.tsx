import React from 'react';
import { Badge } from '@/components/common/Badge/Badge';
import type { SellerTier } from '@/types/kyc.types';

interface TierBadgeProps {
  tier: SellerTier;
}

export const TierBadge: React.FC<TierBadgeProps> = ({ tier }) => (
  <Badge variant={tier}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</Badge>
);
