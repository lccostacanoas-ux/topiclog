import { Pool, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (connectionString) {
      pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } else {
      const defaultHost =
        process.env.NODE_ENV === "production" ? "45.180.218.247" : "127.0.0.1";
      pool = new Pool({
        host: process.env.TOPICLOG_DB_HOST || defaultHost,
        port: Number(process.env.TOPICLOG_DB_PORT || 54322),
        database: process.env.TOPICLOG_DB_NAME || "postgres",
        user: process.env.TOPICLOG_DB_USER || "postgres",
        password: process.env.TOPICLOG_DB_PASSWORD || "postgres",
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }

    pool.on("error", (err) => {
      console.error("[Database Pool Error]", err);
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const p = getDbPool();
  return p.query<T>(text, params);
}
