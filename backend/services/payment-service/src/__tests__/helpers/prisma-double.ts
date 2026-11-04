import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/index.js';

// ─── In-memory Prisma double ──────────────────────────────────────────────────
//
// Vendor balances, the ledger and payouts moved from module-level Maps into
// Postgres, which would otherwise mean the unit suite needs a live database to
// assert anything about money. This implements the slice of the Prisma query
// API those services actually use — enough for the split maths, the balance
// reservation and the withdrawal state machine to be exercised for real.
//
// It is deliberately not a general Prisma emulator. Anything outside the
// supported subset throws rather than silently returning a wrong answer: a
// test that passes against a lenient fake is worse than no test.

type Row = Record<string, unknown>;

/** Columns declared `Decimal` in schema.prisma — read back with `.toNumber()`. */
const DECIMAL_FIELDS = new Set([
  'amount',
  'amountUGX',
  'exchangeRate',
  'availableBalance',
  'pendingBalance',
  'grossAmount',
  'platformFee',
  'netVendorAmount',
  'commissionRate',
  'commissionAmount',
]);

function toDecimal(value: unknown): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(Number(value ?? 0));
}

function numeric(value: unknown): number {
  return value instanceof Prisma.Decimal ? value.toNumber() : Number(value ?? 0);
}

function compare(actual: unknown, expected: unknown): boolean {
  if (expected !== null && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof Prisma.Decimal)) {
    const ops = expected as Record<string, unknown>;
    return Object.entries(ops).every(([op, operand]) => {
      switch (op) {
        case 'equals': return compare(actual, operand);
        case 'not':    return !compare(actual, operand);
        case 'in':     return (operand as unknown[]).includes(actual);
        case 'notIn':  return !(operand as unknown[]).includes(actual);
        case 'gte':    return numeric(actual) >= numeric(operand);
        case 'gt':     return numeric(actual) > numeric(operand);
        case 'lte':    return numeric(actual) <= numeric(operand);
        case 'lt':     return numeric(actual) < numeric(operand);
        case 'has':    return Array.isArray(actual) && actual.includes(operand);
        default:
          throw new Error(`prisma-double: unsupported filter operator '${op}'`);
      }
    });
  }
  if (actual instanceof Prisma.Decimal || expected instanceof Prisma.Decimal) {
    return numeric(actual) === numeric(expected);
  }
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();
  }
  return actual === expected;
}

interface TableOptions {
  /** Primary key column. */
  id: string;
  /** Compound unique constraints, keyed by the name Prisma generates for them. */
  compoundUniques?: Record<string, string[]>;
  /** Columns that default to `now()` on insert. */
  timestamps?: string[];
}

class Table {
  readonly rows: Row[] = [];

  constructor(private readonly name: string, private readonly opts: TableOptions) {}

  // ── internals ──

  private expandWhere(where: Row): Row {
    const expanded: Row = {};
    for (const [key, value] of Object.entries(where ?? {})) {
      const compound = this.opts.compoundUniques?.[key];
      if (compound) {
        for (const field of compound) expanded[field] = (value as Row)[field];
      } else {
        expanded[key] = value;
      }
    }
    return expanded;
  }

  private match(row: Row, where: Row | undefined): boolean {
    if (!where) return true;
    return Object.entries(this.expandWhere(where)).every(([key, value]) => compare(row[key], value));
  }

  private assertUnique(candidate: Row, ignore?: Row): void {
    const keys = [[this.opts.id], ...Object.values(this.opts.compoundUniques ?? {})];
    for (const key of keys) {
      const clash = this.rows.find(
        (row) => row !== ignore && key.every((field) => compare(row[field], candidate[field])),
      );
      if (clash) {
        throw new Prisma.PrismaClientKnownRequestError(
          `Unique constraint failed on ${this.name}(${key.join(', ')})`,
          { code: 'P2002', clientVersion: 'prisma-double', meta: { target: key } },
        );
      }
    }
  }

  private normalizeInsert(data: Row): Row {
    const now = new Date();
    const row: Row = { ...data };
    if (row[this.opts.id] === undefined) row[this.opts.id] = randomUUID();
    for (const field of this.opts.timestamps ?? []) {
      if (row[field] === undefined) row[field] = now;
    }
    for (const [key, value] of Object.entries(row)) {
      if (DECIMAL_FIELDS.has(key) && value !== null && value !== undefined) row[key] = toDecimal(value);
    }
    return row;
  }

  private applyUpdate(row: Row, data: Row): void {
    for (const [key, value] of Object.entries(data ?? {})) {
      if (value !== null && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Prisma.Decimal)) {
        const ops = value as Record<string, unknown>;
        if ('increment' in ops) { row[key] = toDecimal(numeric(row[key]) + numeric(ops.increment)); continue; }
        if ('decrement' in ops) { row[key] = toDecimal(numeric(row[key]) - numeric(ops.decrement)); continue; }
        if ('set' in ops)       { row[key] = ops.set; continue; }
      }
      row[key] = DECIMAL_FIELDS.has(key) && value !== null && value !== undefined ? toDecimal(value) : value;
    }
    if ((this.opts.timestamps ?? []).includes('updatedAt')) row.updatedAt = new Date();
  }

  private order(rows: Row[], orderBy: Row | undefined): Row[] {
    if (!orderBy) return rows;
    const [field, direction] = Object.entries(orderBy)[0] as [string, 'asc' | 'desc'];
    return [...rows].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      // Nulls sort last regardless of direction — a row with no processedAt is
      // not "the oldest", it simply has not been processed.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av instanceof Date && bv instanceof Date
        ? av.getTime() - bv.getTime()
        : typeof av === 'number' || av instanceof Prisma.Decimal
          ? numeric(av) - numeric(bv)
          : String(av).localeCompare(String(bv));
      return direction === 'desc' ? -cmp : cmp;
    });
  }

  private select(args: { where?: Row; orderBy?: Row; skip?: number; take?: number } = {}): Row[] {
    let found = this.rows.filter((row) => this.match(row, args.where));
    found = this.order(found, args.orderBy);
    if (args.skip) found = found.slice(args.skip);
    if (args.take !== undefined) found = found.slice(0, args.take);
    return found;
  }

  // ── Prisma-shaped API ──

  create = (args: { data: Row }): Promise<Row> => {
    const row = this.normalizeInsert(args.data);
    this.assertUnique(row);
    this.rows.push(row);
    return Promise.resolve({ ...row });
  };

  findUnique = (args: { where: Row }): Promise<Row | null> => {
    const row = this.rows.find((r) => this.match(r, args.where));
    return Promise.resolve(row ? { ...row } : null);
  };

  findUniqueOrThrow = async (args: { where: Row }): Promise<Row> => {
    const row = await this.findUnique(args);
    if (!row) throw new Error(`prisma-double: no ${this.name} matching ${JSON.stringify(args.where)}`);
    return row;
  };

  findFirst = (args: { where?: Row; orderBy?: Row } = {}): Promise<Row | null> => {
    const [row] = this.select({ ...args, take: 1 });
    return Promise.resolve(row ? { ...row } : null);
  };

  findMany = (args: { where?: Row; orderBy?: Row; skip?: number; take?: number } = {}): Promise<Row[]> =>
    Promise.resolve(this.select(args).map((row) => ({ ...row })));

  count = (args: { where?: Row } = {}): Promise<number> =>
    Promise.resolve(this.rows.filter((row) => this.match(row, args.where)).length);

  update = (args: { where: Row; data: Row }): Promise<Row> => {
    const row = this.rows.find((r) => this.match(r, args.where));
    if (!row) throw new Error(`prisma-double: no ${this.name} matching ${JSON.stringify(args.where)}`);
    this.applyUpdate(row, args.data);
    return Promise.resolve({ ...row });
  };

  updateMany = (args: { where?: Row; data: Row }): Promise<{ count: number }> => {
    const matched = this.rows.filter((row) => this.match(row, args.where));
    for (const row of matched) this.applyUpdate(row, args.data);
    return Promise.resolve({ count: matched.length });
  };

  upsert = (args: { where: Row; create: Row; update: Row }): Promise<Row> => {
    const row = this.rows.find((r) => this.match(r, args.where));
    if (row) {
      this.applyUpdate(row, args.update);
      return Promise.resolve({ ...row });
    }
    return this.create({ data: { ...this.expandWhere(args.where), ...args.create } });
  };

  aggregate = (args: {
    where?: Row;
    _sum?: Record<string, boolean>;
    _count?: Record<string, boolean>;
  } = {}): Promise<Row> => {
    const matched = this.rows.filter((row) => this.match(row, args.where));
    const result: Row = {};

    if (args._sum) {
      result._sum = Object.fromEntries(
        Object.keys(args._sum).map((field) => [
          field,
          // Prisma returns null for a sum over zero rows, not 0 — callers
          // coalesce it, so the double has to reproduce that.
          matched.length ? toDecimal(matched.reduce((sum, row) => sum + numeric(row[field]), 0)) : null,
        ]),
      );
    }
    if (args._count) {
      result._count = Object.fromEntries(Object.keys(args._count).map((field) => [field, matched.length]));
    }
    return Promise.resolve(result);
  };

  groupBy = (args: { by: string[]; _sum?: Record<string, boolean>; _count?: Record<string, boolean> }): Promise<Row[]> => {
    const buckets = new Map<string, Row[]>();
    for (const row of this.rows) {
      const key = args.by.map((field) => String(row[field])).join(' ');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    }

    return Promise.resolve(
      [...buckets.values()].map((rows) => {
        const entry: Row = Object.fromEntries(args.by.map((field) => [field, rows[0][field]]));
        if (args._sum) {
          entry._sum = Object.fromEntries(
            Object.keys(args._sum).map((field) => [field, toDecimal(rows.reduce((s, r) => s + numeric(r[field]), 0))]),
          );
        }
        if (args._count) {
          entry._count = Object.fromEntries(Object.keys(args._count).map((field) => [field, rows.length]));
        }
        return entry;
      }),
    );
  };

  deleteMany = (args: { where?: Row } = {}): Promise<{ count: number }> => {
    const keep = this.rows.filter((row) => !this.match(row, args.where));
    const removed = this.rows.length - keep.length;
    this.rows.length = 0;
    this.rows.push(...keep);
    return Promise.resolve({ count: removed });
  };

  reset(): void {
    this.rows.length = 0;
  }
}

// ─── The double itself ────────────────────────────────────────────────────────

const TIMESTAMPS = ['createdAt', 'updatedAt'];

export const paymentTransaction = new Table('PaymentTransaction', { id: 'paymentId', timestamps: TIMESTAMPS });
export const processedWebhook   = new Table('ProcessedWebhook',   { id: 'eventId', timestamps: ['receivedAt'] });
export const escrowHold         = new Table('EscrowHold',         {
  id: 'id',
  timestamps: TIMESTAMPS,
  // Mirrors `@@unique([orderId, vendorId])`. orderId alone used to be unique,
  // which is exactly what made a multi-vendor basket unrepresentable — the
  // double has to allow several holds per order now, but still refuse two for
  // the same vendor so the upsert stays idempotent.
  compoundUniques: { orderId_vendorId: ['orderId', 'vendorId'] },
});
export const vendorBalance      = new Table('VendorBalance',      { id: 'vendorId', timestamps: ['updatedAt'] });
export const platformCommissionEntry = new Table('PlatformCommissionEntry', { id: 'id', timestamps: ['createdAt'] });
export const vendorPayout       = new Table('VendorPayout',       { id: 'id', timestamps: TIMESTAMPS });
export const vendorLedgerEntry  = new Table('VendorLedgerEntry', {
  id: 'id',
  timestamps: TIMESTAMPS,
  // Mirrors `@@unique([subOrderId, vendorId])` — the constraint that makes a
  // replayed payment webhook safe, so the double has to enforce it too.
  compoundUniques: { subOrderId_vendorId: ['subOrderId', 'vendorId'] },
});

const tables = [
  paymentTransaction,
  processedWebhook,
  escrowHold,
  vendorBalance,
  vendorLedgerEntry,
  platformCommissionEntry,
  vendorPayout,
];

const models = {
  paymentTransaction,
  processedWebhook,
  escrowHold,
  vendorBalance,
  vendorLedgerEntry,
  platformCommissionEntry,
  vendorPayout,
};

export const prisma = {
  ...models,
  /**
   * Both call shapes the services use.
   *
   * Array form: each table method runs its work synchronously before resolving,
   * so evaluating the array literal already executed the operations in order.
   *
   * Interactive form: the callback receives the same tables. There is no
   * rollback here — the double runs everything against one in-memory store, so
   * a test asserting rollback behaviour would be asserting against a fake. What
   * it does reproduce faithfully is the part the code depends on: `updateMany`
   * returning a real `count`, which is how releaseSubOrderVendorFunds decides
   * whether it won the claim.
   */
  $transaction: (arg: Array<Promise<unknown>> | ((tx: typeof models) => Promise<unknown>)) =>
    typeof arg === 'function' ? arg(models) : Promise.all(arg),
  $connect: () => Promise.resolve(),
  $disconnect: () => Promise.resolve(),
};

export function resetDatabase(): void {
  for (const table of tables) table.reset();
}

/** Seed a vendor's cleared balance directly, standing in for delivered orders. */
export async function seedAvailableBalance(vendorId: string, amount: number): Promise<void> {
  await vendorBalance.upsert({
    where: { vendorId },
    create: { vendorId, availableBalance: amount, pendingBalance: 0, currency: 'UGX' },
    update: { availableBalance: { set: toDecimal(amount) } },
  });
}
