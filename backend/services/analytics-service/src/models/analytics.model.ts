export type TimePeriod = 'day' | 'week' | 'month' | 'year' | 'all_time';

export interface OrderValueBin {
  rangeLabel: string;
  minUGX: number;
  maxUGX: number | null;
  count: number;
  percentage: number;
}

export interface TopProductMetric {
  productId: string;
  name: string;
  revenue: number;
  unitsSold: number;
}

export interface SellerDashboardMetrics {
  sellerId: string;
  period: TimePeriod;
  revenue: {
    today: number;
    week: number;
    month: number;
    allTime: number;
    currency: string;
  };
  orders: {
    totalOrders: number;
    totalGmv: number;
    averageOrderValue: number;
  };
  orderValueDistribution: OrderValueBin[];
  topSellingProducts: {
    byRevenue: TopProductMetric[];
    byQuantity: TopProductMetric[];
  };
  conversion: {
    totalViews: number;
    totalPurchases: number;
    conversionRatePercent: number;
  };
  customerChannels: Array<{ channel: string; percentage: number }>;
  regionalDistributions: Array<{ region: string; orderCount: number; percentage: number }>;
  inventoryHealth: {
    fastMovingCount: number;
    slowMovingCount: number;
    outOfStockCount: number;
  };
  refunds: {
    totalSubOrders: number;
    refundCount: number;
    refundRatePercent: number;
  };
  updatedAt: string;
}

export interface AdminDashboardMetrics {
  period: TimePeriod;
  gmv: {
    daily: number;
    weekly: number;
    monthly: number;
    currency: string;
    growthPercent: number;
    timeSeries: Array<{ date: string; gmv: number; orders: number }>;
  };
  platformRevenue: {
    commissionCollected: number;
    commissionRatePercent: number;
    currency: string;
  };
  payouts: {
    totalDisbursed: number;
    pendingPayouts: number;
    currency: string;
  };
  sellerGrowth: {
    activeSellers: number;
    newRegistrations: number;
    totalSellers: number;
  };
  disputes: {
    totalOrders: number;
    disputeCount: number;
    disputeRatePercent: number;
  };
  topSellers: Array<{
    sellerId: string;
    name: string;
    gmv: number;
    rating: number;
    ordersCount: number;
  }>;
  userGrowth: {
    totalSignups: number;
    activeBuyers: number;
    buyerConversionPercent: number;
  };
  unitEconomics: {
    averageOrderValue: number;
    customerLifetimeValue: number;
    currency: string;
  };
  updatedAt: string;
}
