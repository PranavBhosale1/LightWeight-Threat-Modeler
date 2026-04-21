import { Pool } from "pg";
import Redis from "ioredis";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
  max: 10
});

export const redis = new Redis(process.env.REDIS_URL ?? "redis://redis:6379", {
  enableAutoPipelining: true
});
