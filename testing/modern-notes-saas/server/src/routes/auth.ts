import { Router } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, redis } from "../db.js";

export const authRouter = Router();

const Creds = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200)
});

authRouter.post("/signup", async (req, res) => {
  const parsed = Creds.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "bad_input" });

  const { email, password } = parsed.data;
  const hash = await argon2.hash(password, { type: argon2.argon2id });

  const { rows } = await pool.query(
    `INSERT INTO tenants (name) VALUES ($1) RETURNING id`,
    [email.split("@")[1]]
  );
  const tenantId = rows[0].id;

  await pool.query(
    `INSERT INTO users (email, password_hash, tenant_id) VALUES ($1, $2, $3)`,
    [email, hash, tenantId]
  );

  res.status(201).json({ ok: true });
});

authRouter.post("/login", async (req, res) => {
  const parsed = Creds.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "bad_input" });

  const { email, password } = parsed.data;
  const { rows } = await pool.query(
    `SELECT id, tenant_id, password_hash FROM users WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await argon2.verify(user.password_hash, password);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const jti = randomUUID();
  const access = jwt.sign(
    { sub: user.id, tid: user.tenant_id, jti },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: "15m" }
  );

  const refresh = randomBytes(48).toString("base64url");
  await redis.set(`refresh:${refresh}`, `${user.id}:${user.tenant_id}`, "EX", 60 * 60 * 24 * 14);

  res.json({ access, refresh });
});

authRouter.post("/refresh", async (req, res) => {
  const token = String(req.body?.refresh ?? "");
  if (!token) return res.status(400).json({ error: "missing_refresh" });

  const value = await redis.get(`refresh:${token}`);
  if (!value) return res.status(401).json({ error: "invalid_refresh" });

  await redis.del(`refresh:${token}`);
  const [userId, tenantId] = value.split(":");

  const jti = randomUUID();
  const access = jwt.sign(
    { sub: userId, tid: tenantId, jti },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: "15m" }
  );
  const refresh = randomBytes(48).toString("base64url");
  await redis.set(`refresh:${refresh}`, `${userId}:${tenantId}`, "EX", 60 * 60 * 24 * 14);

  res.json({ access, refresh });
});

authRouter.post("/logout", async (req, res) => {
  const token = String(req.body?.refresh ?? "");
  if (token) await redis.del(`refresh:${token}`);
  res.json({ ok: true });
});
