export interface PlatformMetrics {
  totalUsers: number;
  activeSellers: number;
  totalOrders: number;
  pendingDisputes: number;
  platformRevenue: number;
  totalGmv: number;
}

export interface GMVData {
  date: string;
  amount: number;
}

export interface SellerPerformance {
  sellerId: string;
  sellerName: string;
  gmv: number;
  ordersCount: number;
  fulfillmentRate: number;
  rating: number;
}
