import { OrderModel, nextOrderSeq } from '../models/order.schema.js';
import type { Order, SubOrder, SubOrderStatus, MasterOrderStatus } from '../models/order.model.js';

// ─── Repository Interface ─────────────────────────────────────────────────────
// The service layer depends on this interface — NOT on Mongoose directly.

export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

/** Filters the admin order console can apply. Every field is optional. */
export interface AdminOrderFilters {
  status?:   MasterOrderStatus;
  /** Narrows to orders containing a sub-order for this seller. */
  sellerId?: string;
  /** Order number or buyer id, matched exactly on orderNumber or userId. */
  q?:        string;
}

/** Platform-wide totals for the admin dashboard. */
export interface AdminOrderStats {
  /** Sum of totalAmount over completed orders only — money that actually settled. */
  gmv: number;
  /** Sum of every sub-order's platformCommission across those same completed orders. */
  platformCommission: number;
  totalOrders: number;
  /** Order count keyed by master status, e.g. `{ completed: 12, pending: 3 }`. */
  ordersByStatus: Record<string, number>;
  /** Completed-order GMV per calendar month, oldest first, for the dashboard trend. */
  gmvByMonth: Array<{ month: string; gmv: number; orders: number }>;
  currency: string;
}

export interface IOrderRepository {
  nextOrderNumber(): Promise<string>;
  create(order: Order): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findByUserId(id: string, userId: string): Promise<Order | null>;
  findOrderContainingSubOrder(subOrderId: string): Promise<Order | null>;
  /** Idempotency lookup: the order already created for a checkout session. */
  findByCheckoutSessionId(checkoutSessionId: string): Promise<Order | null>;
  listByUser(userId: string, page: number, perPage: number): Promise<PaginatedResult<Order>>;
  /** Platform-wide listing for the admin console. No user or seller scoping. */
  listAll(filters: AdminOrderFilters, page: number, perPage: number): Promise<PaginatedResult<Order>>;
  listSubOrdersBySeller(
    sellerId: string,
    status: SubOrderStatus | undefined,
    page: number,
    perPage: number,
  ): Promise<PaginatedResult<SubOrder>>;
  /** Persists the full order document — used after in-place mutation of a fetched Order. */
  replace(order: Order): Promise<Order>;
  /** Aggregate totals for the admin dashboard. No user or seller scoping. */
  adminStats(): Promise<AdminOrderStats>;
  /** The newest master orders platform-wide, for the dashboard's activity feed. */
  listRecent(limit: number): Promise<Order[]>;
}

// ─── Mapping (Mongoose lean doc <-> domain Order) ──────────────────────────────
// Schema fields mirror the domain types field-for-field except `_id` <-> `id`,
// so mapping is a straight rename with no date/shape conversion needed.

function toDomainOrder(doc: Record<string, unknown>): Order {
  const { _id, ...rest } = doc;
  return { id: _id as string, ...(rest as Omit<Order, 'id'>) };
}

// ─── Dashboard trend window ────────────────────────────────────────────────────

const GMV_TREND_MONTHS = 12;

type MonthlyGmv = { month: string; gmv: number; orders: number };

/** Expands a sparse aggregation result into one entry per month in the window. */
function fillMonthlyGaps(rows: MonthlyGmv[], windowStart: Date): MonthlyGmv[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  const filled: MonthlyGmv[] = [];

  const cursor = new Date(windowStart);
  for (let i = 0; i < GMV_TREND_MONTHS; i++) {
    const month = cursor.toISOString().slice(0, 7);
    filled.push(byMonth.get(month) ?? { month, gmv: 0, orders: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return filled;
}

// ─── Mongoose Implementation ───────────────────────────────────────────────────

export class MongoOrderRepository implements IOrderRepository {
  async nextOrderNumber(): Promise<string> {
    const seq = await nextOrderSeq();
    return `MUNI-${seq}`;
  }

  async create(order: Order): Promise<Order> {
    const { id, ...rest } = order;
    const created = await OrderModel.create({ _id: id, ...rest });
    return toDomainOrder(created.toObject());
  }

  async findById(id: string): Promise<Order | null> {
    const doc = await OrderModel.findById(id).lean();
    return doc ? toDomainOrder(doc as Record<string, unknown>) : null;
  }

  async findByUserId(id: string, userId: string): Promise<Order | null> {
    const doc = await OrderModel.findOne({ _id: id, userId }).lean();
    return doc ? toDomainOrder(doc as Record<string, unknown>) : null;
  }

  async findByCheckoutSessionId(checkoutSessionId: string): Promise<Order | null> {
    const doc = await OrderModel.findOne({ checkoutSessionId }).lean();
    return doc ? toDomainOrder(doc as Record<string, unknown>) : null;
  }

  async findOrderContainingSubOrder(subOrderId: string): Promise<Order | null> {
    const doc = await OrderModel.findOne({ 'subOrders.id': subOrderId }).lean();
    return doc ? toDomainOrder(doc as Record<string, unknown>) : null;
  }

  async listByUser(userId: string, page: number, perPage: number): Promise<PaginatedResult<Order>> {
    const skip = (page - 1) * perPage;
    const [docs, total] = await Promise.all([
      OrderModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      OrderModel.countDocuments({ userId }),
    ]);
    return { data: docs.map((d) => toDomainOrder(d as Record<string, unknown>)), total };
  }

  async listAll(
    filters: AdminOrderFilters,
    page: number,
    perPage: number,
  ): Promise<PaginatedResult<Order>> {
    const query: Record<string, unknown> = {};
    if (filters.status)   query.status = filters.status;
    // A master order has no sellerId of its own — a seller appears only inside
    // its sub-orders, so the filter has to reach into that array.
    if (filters.sellerId) query['subOrders.sellerId'] = filters.sellerId;

    // Exact match on either identifier rather than a regex: an unanchored regex
    // over an unindexed field is a collection scan on every admin keystroke.
    if (filters.q) query.$or = [{ orderNumber: filters.q }, { userId: filters.q }];

    const skip = (page - 1) * perPage;
    const [docs, total] = await Promise.all([
      OrderModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      OrderModel.countDocuments(query),
    ]);
    return { data: docs.map((d) => toDomainOrder(d as Record<string, unknown>)), total };
  }

  async listSubOrdersBySeller(
    sellerId: string,
    status: SubOrderStatus | undefined,
    page: number,
    perPage: number,
  ): Promise<PaginatedResult<SubOrder>> {
    const matchStage: Record<string, unknown> = { 'subOrders.sellerId': sellerId };
    const subOrderMatch: Record<string, unknown> = { 'subOrders.sellerId': sellerId };
    if (status) {
      matchStage['subOrders.status'] = status;
      subOrderMatch['subOrders.status'] = status;
    }

    const pipeline = [
      { $match: matchStage },
      { $unwind: '$subOrders' },
      { $match: subOrderMatch },
      { $sort: { 'subOrders.placedAt': -1 as const } },
      {
        $facet: {
          data: [{ $skip: (page - 1) * perPage }, { $limit: perPage }, { $replaceRoot: { newRoot: '$subOrders' } }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await OrderModel.aggregate(pipeline);
    const data: SubOrder[] = (result?.data ?? []) as SubOrder[];
    const total: number = result?.totalCount?.[0]?.count ?? 0;
    return { data, total };
  }

  /**
   * Two aggregations rather than one: GMV is deliberately scoped to completed
   * orders (a pending order is not merchandise that has moved), while the
   * status breakdown has to see every order or the dashboard cannot show what
   * is still in flight.
   *
   * `$sum` over `$subOrders.platformCommission` sums the array inside each
   * document; the outer `$sum` then accumulates across documents.
   */
  async adminStats(): Promise<AdminOrderStats> {
    // createdAt is stored as an ISO-8601 string, so lexicographic comparison is
    // chronological and a plain `$gte` on the string works as a date range.
    //
    // The day is normalised to the 1st *before* subtracting months: on the 31st,
    // stepping back into a 30-day month overflows into the following one, which
    // would silently shift the whole window forward by a month.
    const windowStart = new Date();
    windowStart.setUTCDate(1);
    windowStart.setUTCHours(0, 0, 0, 0);
    windowStart.setUTCMonth(windowStart.getUTCMonth() - (GMV_TREND_MONTHS - 1));

    const [settledRows, statusRows, totalOrders, monthRows] = await Promise.all([
      OrderModel.aggregate<{ gmv: number; platformCommission: number }>([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: null,
            gmv: { $sum: '$totalAmount' },
            platformCommission: { $sum: { $sum: '$subOrders.platformCommission' } },
          },
        },
      ]),
      OrderModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      OrderModel.countDocuments({}),
      OrderModel.aggregate<{ _id: string; gmv: number; orders: number }>([
        { $match: { status: 'completed', createdAt: { $gte: windowStart.toISOString() } } },
        {
          $group: {
            // 'YYYY-MM' from the leading characters of the ISO string.
            _id: { $substrBytes: ['$createdAt', 0, 7] },
            gmv: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 as const } },
      ]),
    ]);

    return {
      gmv: settledRows[0]?.gmv ?? 0,
      platformCommission: settledRows[0]?.platformCommission ?? 0,
      totalOrders,
      ordersByStatus: Object.fromEntries(statusRows.map((r) => [r._id, r.count])),
      // Months with no completed orders are absent from the aggregation; they
      // are filled in as zero so the chart shows a continuous timeline instead
      // of silently closing the gap and implying sales were flat.
      gmvByMonth: fillMonthlyGaps(
        monthRows.map((r) => ({ month: r._id, gmv: r.gmv, orders: r.orders })),
        windowStart,
      ),
      // Every order in this service is written with currency 'UGX'; there is no
      // per-order currency to aggregate over yet.
      currency: 'UGX',
    };
  }

  async listRecent(limit: number): Promise<Order[]> {
    const docs = await OrderModel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map((d) => toDomainOrder(d as Record<string, unknown>));
  }

  async replace(order: Order): Promise<Order> {
    const { id, ...rest } = order;
    const doc = await OrderModel.findOneAndReplace({ _id: id }, { _id: id, ...rest }, { new: true, upsert: false }).lean();
    if (!doc) throw Object.assign(new Error('Order not found'), { status: 404 });
    return toDomainOrder(doc as Record<string, unknown>);
  }
}

// ─── Default Export ───────────────────────────────────────────────────────────

export const orderRepository: IOrderRepository = new MongoOrderRepository();
