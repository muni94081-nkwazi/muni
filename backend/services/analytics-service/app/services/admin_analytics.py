"""Platform executive admin analytics business logic matching TypeScript admin-analytics.service.ts."""
from __future__ import annotations

from datetime import datetime, timezone
from app.models.analytics import (
    AdminDashboardMetrics,
    TimePeriod,
    AdminGmv,
    GmvTimeSeriesItem,
    PlatformRevenue,
    AdminPayouts,
    SellerGrowth,
    AdminDisputes,
    TopSellerMetric,
    UserGrowth,
    UnitEconomics,
)


class AdminAnalyticsService:
    """Compute Platform-Wide Executive Admin Dashboard Metrics."""

    async def get_admin_dashboard(self, period: TimePeriod = "month") -> AdminDashboardMetrics:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"

        monthly_gmv = 385400000
        weekly_gmv = 92500000
        daily_gmv = 14800000
        commission_rate_percent = 12.5  # 12.5% platform commission
        commission_collected = round(monthly_gmv * (commission_rate_percent / 100))  # 48,175,000 UGX

        total_orders = 3850
        dispute_count = 38  # 1.0% dispute rate
        dispute_rate_percent = round((dispute_count / total_orders) * 1000) / 10

        total_signups = 15400
        active_buyers = 8920
        buyer_conversion_percent = round((active_buyers / total_signups) * 1000) / 10

        average_order_value = round(monthly_gmv / total_orders)  # ~100,103 UGX AOV
        # CLV formula: AOV * avg purchases per year (4.2) * avg lifespan (2.5 years)
        customer_lifetime_value = round(average_order_value * 4.2 * 2.5)  # ~1,051,080 UGX CLV

        time_series = [
            GmvTimeSeriesItem(date="2026-08-05", gmv=11200000, orders=115),
            GmvTimeSeriesItem(date="2026-08-06", gmv=12500000, orders=128),
            GmvTimeSeriesItem(date="2026-08-07", gmv=13100000, orders=134),
            GmvTimeSeriesItem(date="2026-08-08", gmv=14200000, orders=142),
            GmvTimeSeriesItem(date="2026-08-09", gmv=13800000, orders=138),
            GmvTimeSeriesItem(date="2026-08-10", gmv=15400000, orders=155),
            GmvTimeSeriesItem(date="2026-08-11", gmv=14800000, orders=148),
        ]

        top_sellers = [
            TopSellerMetric(sellerId="seller-001", name="Kampala Electronics Hub", gmv=68500000, rating=4.9, ordersCount=680),
            TopSellerMetric(sellerId="seller-002", name="Fresh Groceries Direct", gmv=42100000, rating=4.8, ordersCount=1420),
            TopSellerMetric(sellerId="seller-003", name="East Africa Fashion", gmv=31800000, rating=4.7, ordersCount=890),
        ]

        return AdminDashboardMetrics(
            period=period,
            gmv=AdminGmv(
                daily=daily_gmv,
                weekly=weekly_gmv,
                monthly=monthly_gmv,
                currency="UGX",
                growthPercent=22.4,  # +22.4% MoM
                timeSeries=time_series,
            ),
            platformRevenue=PlatformRevenue(
                commissionCollected=commission_collected,
                commissionRatePercent=commission_rate_percent,
                currency="UGX",
            ),
            payouts=AdminPayouts(
                totalDisbursed=337225000,  # 385,400,000 - 48,175,000
                pendingPayouts=18450000,
                currency="UGX",
            ),
            sellerGrowth=SellerGrowth(
                activeSellers=342,
                newRegistrations=28,
                totalSellers=370,
            ),
            disputes=AdminDisputes(
                totalOrders=total_orders,
                disputeCount=dispute_count,
                disputeRatePercent=dispute_rate_percent,
            ),
            topSellers=top_sellers,
            userGrowth=UserGrowth(
                totalSignups=total_signups,
                activeBuyers=active_buyers,
                buyerConversionPercent=buyer_conversion_percent,
            ),
            unitEconomics=UnitEconomics(
                averageOrderValue=average_order_value,
                customerLifetimeValue=customer_lifetime_value,
                currency="UGX",
            ),
            updatedAt=now,
        )


admin_analytics_service = AdminAnalyticsService()
