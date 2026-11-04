export interface SalesMetric {
  date: string;
  revenue: number;
  orders: number;
}

export interface RevenueData {
  totalRevenue: number;
  growthPercentage: number;
  history: SalesMetric[];
}

export interface AnalyticsOverview {
  totalRevenue: number;
  ordersToday: number;
  activeProducts: number;
  lowStockItems: number;
}
