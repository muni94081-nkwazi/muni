import type { Order } from './order.types';

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
//
// Mirrors the gateway's /api/v1/admin/dashboard/* responses. The stats endpoint
// is a server-side fan-out across order-service, auth-service and
// product-service (backend/api-gateway/src/routes/admin.routes.ts) rather than
// a proxy to any one of them.

export interface MonthlyGmv {
  /** Calendar month as `YYYY-MM`. */
  month: string;
  gmv: number;
  orders: number;
}

export interface DashboardStats {
  /** Sum of completed order totals. Pending orders are not merchandise that moved. */
  gmv: number;
  /** The platform's cut of that GMV, summed from each sub-order's commission. */
  platformCommission: number;
  totalOrders: number;
  /** Order counts keyed by master status — `{ completed: 12, pending: 3, … }`. */
  ordersByStatus: Record<string, number>;
  /**
   * Completed-order GMV for each of the last 12 calendar months, oldest first.
   * Months with no sales are present with `gmv: 0` rather than omitted, so a
   * quiet month reads as a trough instead of disappearing from the timeline.
   */
  gmvByMonth: MonthlyGmv[];
  currency: string;

  totalUsers: number;
  /** Users holding ROLE_CUSTOMER, not simply "every account". */
  totalCustomers: number;
  /** Sellers whose KYC has been approved. Applicants are not sellers yet. */
  totalSellers: number;

  pendingSellerVerifications: number;
  pendingProductApprovals: number;
  productsByStatus: Record<string, number>;
}

export interface DashboardStatsMeta {
  generatedAt: string;
  /**
   * Services whose slice could not be fetched. Their figures come back as 0, so
   * the UI must say the number is unavailable rather than render a confident 0.
   */
  degraded: string[];
}

export interface DashboardStatsResult {
  stats: DashboardStats;
  meta: DashboardStatsMeta;
}

/** A row in the dashboard's recent-seller feed. Mirrors auth-service's PublicSellerProfile. */
export interface RecentSeller {
  id: string;
  userId: string;
  businessName: string;
  businessEmail: string | null;
  businessPhone: string | null;
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'suspended';
  storeName: string | null;
  totalProducts: number;
  createdAt: string;
}

export type RecentOrder = Order;
