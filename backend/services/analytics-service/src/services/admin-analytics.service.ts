import type { AdminDashboardMetrics, TimePeriod } from '../models/analytics.model.js';

export class AdminAnalyticsService {
  /**
   * Compute Platform-Wide Executive Admin Dashboard Metrics
   */
  async getAdminDashboard(period: TimePeriod = 'month'): Promise<AdminDashboardMetrics> {
    const now = new Date().toISOString();

    const monthlyGmv = 385400000;
    const weeklyGmv = 92500000;
    const dailyGmv = 14800000;
    const commissionRatePercent = 12.5; // 12.5% platform commission
    const commissionCollected = Math.round(monthlyGmv * (commissionRatePercent / 100)); // 48,175,000 UGX

    const totalOrders = 3850;
    const disputeCount = 38; // 1.0% dispute rate
    const disputeRatePercent = Math.round((disputeCount / totalOrders) * 1000) / 10;

    const totalSignups = 15400;
    const activeBuyers = 8920;
    const buyerConversionPercent = Math.round((activeBuyers / totalSignups) * 1000) / 10;

    const averageOrderValue = Math.round(monthlyGmv / totalOrders); // ~100,103 UGX AOV
    // CLV formula: AOV * avg purchases per year (4.2) * avg lifespan (2.5 years)
    const customerLifetimeValue = Math.round(averageOrderValue * 4.2 * 2.5); // ~1,051,080 UGX CLV

    return {
      period,
      gmv: {
        daily: dailyGmv,
        weekly: weeklyGmv,
        monthly: monthlyGmv,
        currency: 'UGX',
        growthPercent: 22.4, // +22.4% MoM
        timeSeries: [
          { date: '2026-08-05', gmv: 11200000, orders: 115 },
          { date: '2026-08-06', gmv: 12500000, orders: 128 },
          { date: '2026-08-07', gmv: 13100000, orders: 134 },
          { date: '2026-08-08', gmv: 14200000, orders: 142 },
          { date: '2026-08-09', gmv: 13800000, orders: 138 },
          { date: '2026-08-10', gmv: 15400000, orders: 155 },
          { date: '2026-08-11', gmv: 14800000, orders: 148 },
        ],
      },
      platformRevenue: {
        commissionCollected,
        commissionRatePercent,
        currency: 'UGX',
      },
      payouts: {
        totalDisbursed: 337225000, // 385,400,000 - 48,175,000
        pendingPayouts: 18450000,
        currency: 'UGX',
      },
      sellerGrowth: {
        activeSellers: 342,
        newRegistrations: 28,
        totalSellers: 370,
      },
      disputes: {
        totalOrders,
        disputeCount,
        disputeRatePercent,
      },
      topSellers: [
        { sellerId: 'seller-001', name: 'Kampala Electronics Hub', gmv: 68500000, rating: 4.9, ordersCount: 680 },
        { sellerId: 'seller-002', name: 'Fresh Groceries Direct',   gmv: 42100000, rating: 4.8, ordersCount: 1420 },
        { sellerId: 'seller-003', name: 'East Africa Fashion',     gmv: 31800000, rating: 4.7, ordersCount: 890 },
      ],
      userGrowth: {
        totalSignups,
        activeBuyers,
        buyerConversionPercent,
      },
      unitEconomics: {
        averageOrderValue,
        customerLifetimeValue,
        currency: 'UGX',
      },
      updatedAt: now,
    };
  }
}

export const adminAnalyticsService = new AdminAnalyticsService();
