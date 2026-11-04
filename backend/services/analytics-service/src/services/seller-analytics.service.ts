import type { SellerDashboardMetrics, TimePeriod, OrderValueBin } from '../models/analytics.model.js';

export class SellerAnalyticsService {
  /**
   * Compute multi-dimensional Seller BI Dashboard Metrics
   */
  async getSellerDashboard(sellerId: string, period: TimePeriod = 'month'): Promise<SellerDashboardMetrics> {
    const now = new Date().toISOString();

    // Order Value Bins (< 50k, 50k-150k, 150k-500k, > 500k UGX)
    const orderValueDistribution: OrderValueBin[] = [
      { rangeLabel: '< 50,000 UGX',           minUGX: 0,      maxUGX: 50000,  count: 145, percentage: 38.5 },
      { rangeLabel: '50,000 - 150,000 UGX',   minUGX: 50000,  maxUGX: 150000, count: 160, percentage: 42.5 },
      { rangeLabel: '150,000 - 500,000 UGX',  minUGX: 150000, maxUGX: 500000, count: 52,  percentage: 13.8 },
      { rangeLabel: '> 500,000 UGX',          minUGX: 500000, maxUGX: null,   count: 19,  percentage: 5.2 },
    ];

    const topSellingByRevenue = [
      { productId: 'phone-001', name: 'Samsung Galaxy S24 Ultra', revenue: 25200000, unitsSold: 6 },
      { productId: 'buds-001',  name: 'Wireless Earbuds Pro',     revenue:  4200000, unitsSold: 12 },
      { productId: 'charger-001', name: '45W Fast Wall Charger',  revenue:  1700000, unitsSold: 20 },
    ];

    const topSellingByQuantity = [
      { productId: 'case-001',   name: 'Silicone Protective Case', revenue:  1575000, unitsSold: 35 },
      { productId: 'charger-001', name: '45W Fast Wall Charger',  revenue:  1700000, unitsSold: 20 },
      { productId: 'buds-001',   name: 'Wireless Earbuds Pro',     revenue:  4200000, unitsSold: 12 },
    ];

    const totalViews = 4520;
    const totalPurchases = 376;
    const conversionRatePercent = Math.round((totalPurchases / totalViews) * 1000) / 10;

    const totalSubOrders = 376;
    const refundCount = 7;
    const refundRatePercent = Math.round((refundCount / totalSubOrders) * 1000) / 10;

    const totalRevenueMonth = 32875000;
    const totalGmvMonth = 37571400;
    const aov = Math.round(totalGmvMonth / totalSubOrders);

    return {
      sellerId,
      period,
      revenue: {
        today:   1450000,
        week:    8200000,
        month:   totalRevenueMonth,
        allTime: 185400000,
        currency: 'UGX',
      },
      orders: {
        totalOrders: totalSubOrders,
        totalGmv: totalGmvMonth,
        averageOrderValue: aov,
      },
      orderValueDistribution,
      topSellingProducts: {
        byRevenue:  topSellingByRevenue,
        byQuantity: topSellingByQuantity,
      },
      conversion: {
        totalViews,
        totalPurchases,
        conversionRatePercent,
      },
      customerChannels: [
        { channel: 'Direct / Organic Search', percentage: 48.0 },
        { channel: 'Marketplace Search',     percentage: 35.5 },
        { channel: 'Social Media & Referrals',percentage: 16.5 },
      ],
      regionalDistributions: [
        { region: 'Kampala', orderCount: 220, percentage: 58.5 },
        { region: 'Wakiso / Entebbe', orderCount: 95, percentage: 25.3 },
        { region: 'Upcountry Uganda', orderCount: 61, percentage: 16.2 },
      ],
      inventoryHealth: {
        fastMovingCount: 14,
        slowMovingCount: 3,
        outOfStockCount: 2,
      },
      refunds: {
        totalSubOrders,
        refundCount,
        refundRatePercent,
      },
      updatedAt: now,
    };
  }
}

export const sellerAnalyticsService = new SellerAnalyticsService();
