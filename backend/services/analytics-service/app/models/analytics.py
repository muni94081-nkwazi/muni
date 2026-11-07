"""Pydantic models for analytics metrics and dashboard schemas."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict

TimePeriod = Literal["day", "week", "month", "year", "all_time"]


class OrderValueBin(BaseModel):
    rangeLabel: str
    minUGX: float
    maxUGX: Optional[float] = None
    count: int
    percentage: float

    model_config = ConfigDict(populate_by_name=True)


class TopProductMetric(BaseModel):
    productId: str
    name: str
    revenue: float
    unitsSold: int

    model_config = ConfigDict(populate_by_name=True)


class SellerRevenue(BaseModel):
    today: float
    week: float
    month: float
    allTime: float
    currency: str


class SellerOrders(BaseModel):
    totalOrders: int
    totalGmv: float
    averageOrderValue: float


class TopSellingProducts(BaseModel):
    byRevenue: List[TopProductMetric]
    byQuantity: List[TopProductMetric]


class SellerConversion(BaseModel):
    totalViews: int
    totalPurchases: int
    conversionRatePercent: float


class CustomerChannel(BaseModel):
    channel: str
    percentage: float


class RegionalDistribution(BaseModel):
    region: str
    orderCount: int
    percentage: float


class InventoryHealth(BaseModel):
    fastMovingCount: int
    slowMovingCount: int
    outOfStockCount: int


class SellerRefunds(BaseModel):
    totalSubOrders: int
    refundCount: int
    refundRatePercent: float


class SellerDashboardMetrics(BaseModel):
    sellerId: str
    period: TimePeriod
    revenue: SellerRevenue
    orders: SellerOrders
    orderValueDistribution: List[OrderValueBin]
    topSellingProducts: TopSellingProducts
    conversion: SellerConversion
    customerChannels: List[CustomerChannel]
    regionalDistributions: List[RegionalDistribution]
    inventoryHealth: InventoryHealth
    refunds: SellerRefunds
    updatedAt: str

    model_config = ConfigDict(populate_by_name=True)


class GmvTimeSeriesItem(BaseModel):
    date: str
    gmv: float
    orders: int


class AdminGmv(BaseModel):
    daily: float
    weekly: float
    monthly: float
    currency: str
    growthPercent: float
    timeSeries: List[GmvTimeSeriesItem]


class PlatformRevenue(BaseModel):
    commissionCollected: float
    commissionRatePercent: float
    currency: str


class AdminPayouts(BaseModel):
    totalDisbursed: float
    pendingPayouts: float
    currency: str


class SellerGrowth(BaseModel):
    activeSellers: int
    newRegistrations: int
    totalSellers: int


class AdminDisputes(BaseModel):
    totalOrders: int
    disputeCount: int
    disputeRatePercent: float


class TopSellerMetric(BaseModel):
    sellerId: str
    name: str
    gmv: float
    rating: float
    ordersCount: int


class UserGrowth(BaseModel):
    totalSignups: int
    activeBuyers: int
    buyerConversionPercent: float


class UnitEconomics(BaseModel):
    averageOrderValue: float
    customerLifetimeValue: float
    currency: str


class AdminDashboardMetrics(BaseModel):
    period: TimePeriod
    gmv: AdminGmv
    platformRevenue: PlatformRevenue
    payouts: AdminPayouts
    sellerGrowth: SellerGrowth
    disputes: AdminDisputes
    topSellers: List[TopSellerMetric]
    userGrowth: UserGrowth
    unitEconomics: UnitEconomics
    updatedAt: str

    model_config = ConfigDict(populate_by_name=True)
