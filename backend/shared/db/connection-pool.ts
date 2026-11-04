export interface PoolConfig {
  maxConnections: number; // default 20
  idleTimeoutMs: number;  // default 30000ms
  connectionTimeoutMs: number; // default 5000ms
  readReplicaUrls?: string[];
}

export class DatabasePoolManager {
  private static config: PoolConfig = {
    maxConnections: 20,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 5_000,
    readReplicaUrls: process.env.DATABASE_READ_REPLICA_URLS?.split(',') || [],
  };

  /** Get connection pool configuration */
  static getConfig(): PoolConfig {
    return { ...this.config };
  }

  /**
   * Route read-only analytics/reporting queries to read replicas if available,
   * otherwise fallback to primary database URL.
   */
  static getReadReplicaUrl(primaryUrl: string): string {
    const replicas = this.config.readReplicaUrls;
    if (replicas && replicas.length > 0) {
      // Round-robin selection
      const index = Math.floor(Math.random() * replicas.length);
      return replicas[index].trim();
    }
    return primaryUrl;
  }

  /**
   * Returns SQL snippet for monthly partition creation for high-volume order tables
   */
  static getMonthlyPartitionSql(tableName: string, year: number, month: number): string {
    const monthStr = month.toString().padStart(2, '0');
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthStr = nextMonth.toString().padStart(2, '0');

    const partitionName = `${tableName}_y${year}m${monthStr}`;
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${nextYear}-${nextMonthStr}-01`;

    return `CREATE TABLE IF NOT EXISTS "${partitionName}" PARTITION OF "${tableName}" FOR VALUES FROM ('${startDate}') TO ('${endDate}');`;
  }
}
