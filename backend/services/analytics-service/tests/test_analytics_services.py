"""Unit tests for seller_analytics and admin_analytics services."""
from __future__ import annotations

import pytest
from app.services.seller_analytics import seller_analytics_service
from app.services.admin_analytics import admin_analytics_service


@pytest.mark.anyio
async def test_seller_analytics_service_metrics():
    dashboard = await seller_analytics_service.get_seller_dashboard("seller-001", "month")
    assert dashboard.sellerId == "seller-001"
    assert dashboard.period == "month"

    # Revenue
    assert dashboard.revenue.month > 0
    assert dashboard.revenue.currency == "UGX"

    # Order value distribution bins (< 50k, 50k-150k, 150k-500k, > 500k UGX)
    assert len(dashboard.orderValueDistribution) == 4
    assert "< 50,000" in dashboard.orderValueDistribution[0].rangeLabel

    # Top selling products
    assert len(dashboard.topSellingProducts.byRevenue) > 0
    assert len(dashboard.topSellingProducts.byQuantity) > 0

    # Conversion rate & refund rate
    assert dashboard.conversion.conversionRatePercent > 0
    assert dashboard.refunds.refundRatePercent >= 0

    # Inventory health
    assert dashboard.inventoryHealth.fastMovingCount == 14
    assert dashboard.inventoryHealth.slowMovingCount == 3
    assert dashboard.inventoryHealth.outOfStockCount == 2


@pytest.mark.anyio
async def test_admin_analytics_service_metrics():
    dashboard = await admin_analytics_service.get_admin_dashboard("month")
    assert dashboard.period == "month"

    # GMV & Commission
    assert dashboard.gmv.monthly == 385400000
    assert dashboard.platformRevenue.commissionRatePercent == 12.5
    assert dashboard.platformRevenue.commissionCollected == round(385400000 * 0.125)

    # Disbursals & Disputes
    assert dashboard.payouts.totalDisbursed > 0
    assert dashboard.disputes.disputeRatePercent == 1.0

    # Top sellers ranking
    assert len(dashboard.topSellers) == 3
    assert dashboard.topSellers[0].gmv > 0

    # Unit Economics: AOV & CLV
    assert dashboard.unitEconomics.averageOrderValue > 0
    assert dashboard.unitEconomics.customerLifetimeValue > dashboard.unitEconomics.averageOrderValue
