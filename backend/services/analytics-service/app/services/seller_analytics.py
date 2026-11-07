"""Seller analytics business logic matching TypeScript seller-analytics.service.ts."""
from __future__ import annotations

from datetime import datetime, timezone
from app.models.analytics import (
    SellerDashboardMetrics,
    TimePeriod,
    OrderValueBin,
    TopProductMetric,
    SellerRevenue,
    SellerOrders,
    TopSellingProducts,
    SellerConversion,
    CustomerChannel,
    RegionalDistribution,
    InventoryHealth,
    SellerRefunds,
)


class SellerAnalyticsService:
    """Compute multi-dimensional Seller BI Dashboard Metrics."""

    async def get_seller_dashboard(
        self, seller_id: str, period: TimePeriod = "month"
    ) -> SellerDashboardMetrics:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"

        # Order Value Bins (< 50k, 50k-150k, 150k-500k, > 500k UGX)
        order_value_distribution = [
            OrderValueBin(rangeLabel="< 50,000 UGX", minUGX=0, maxUGX=50000, count=145, percentage=38.5),
            OrderValueBin(rangeLabel="50,000 - 150,000 UGX", minUGX=50000, maxUGX=150000, count=160, percentage=42.5),
            OrderValueBin(rangeLabel="150,000 - 500,000 UGX", minUGX=150000, maxUGX=500000, count=52, percentage=13.8),
            OrderValueBin(rangeLabel="> 500,000 UGX", minUGX=500000, maxUGX=None, count=19, percentage=5.2),
        ]

        top_selling_by_revenue = [
            TopProductMetric(productId="phone-001", name="Samsung Galaxy S24 Ultra", revenue=25200000, unitsSold=6),
            TopProductMetric(productId="buds-001", name="Wireless Earbuds Pro", revenue=4200000, unitsSold=12),
            TopProductMetric(productId="charger-001", name="45W Fast Wall Charger", revenue=1700000, unitsSold=20),
        ]

        top_selling_by_quantity = [
            TopProductMetric(productId="case-001", name="Silicone Protective Case", revenue=1575000, unitsSold=35),
            TopProductMetric(productId="charger-001", name="45W Fast Wall Charger", revenue=1700000, unitsSold=20),
            TopProductMetric(productId="buds-001", name="Wireless Earbuds Pro", revenue=4200000, unitsSold=12),
        ]

        total_views = 4520
        total_purchases = 376
        conversion_rate_percent = round((total_purchases / total_views) * 1000) / 10

        total_sub_orders = 376
        refund_count = 7
        refund_rate_percent = round((refund_count / total_sub_orders) * 1000) / 10

        total_revenue_month = 32875000
        total_gmv_month = 37571400
        aov = round(total_gmv_month / total_sub_orders)

        return SellerDashboardMetrics(
            sellerId=seller_id,
            period=period,
            revenue=SellerRevenue(
                today=1450000,
                week=8200000,
                month=total_revenue_month,
                allTime=185400000,
                currency="UGX",
            ),
            orders=SellerOrders(
                totalOrders=total_sub_orders,
                totalGmv=total_gmv_month,
                averageOrderValue=aov,
            ),
            orderValueDistribution=order_value_distribution,
            topSellingProducts=TopSellingProducts(
                byRevenue=top_selling_by_revenue,
                byQuantity=top_selling_by_quantity,
            ),
            conversion=SellerConversion(
                totalViews=total_views,
                totalPurchases=total_purchases,
                conversionRatePercent=conversion_rate_percent,
            ),
            customerChannels=[
                CustomerChannel(channel="Direct / Organic Search", percentage=48.0),
                CustomerChannel(channel="Marketplace Search", percentage=35.5),
                CustomerChannel(channel="Social Media & Referrals", percentage=16.5),
            ],
            regionalDistributions=[
                RegionalDistribution(region="Kampala", orderCount=220, percentage=58.5),
                RegionalDistribution(region="Wakiso / Entebbe", orderCount=95, percentage=25.3),
                RegionalDistribution(region="Upcountry Uganda", orderCount=61, percentage=16.2),
            ],
            inventoryHealth=InventoryHealth(
                fastMovingCount=14,
                slowMovingCount=3,
                outOfStockCount=2,
            ),
            refunds=SellerRefunds(
                totalSubOrders=total_sub_orders,
                refundCount=refund_count,
                refundRatePercent=refund_rate_percent,
            ),
            updatedAt=now,
        )


seller_analytics_service = SellerAnalyticsService()
