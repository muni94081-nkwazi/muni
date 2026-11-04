export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'closed';
export type DisputeType = 'item_not_received' | 'not_as_described' | 'damaged' | 'other';

export interface Dispute {
  id: string;
  orderId: string;
  type: DisputeType;
  status: DisputeStatus;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  evidence: string[];
}
