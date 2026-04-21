import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { redis } from "../db.js";

export interface AuthedRequest extends Request {
  user?: { userId: string; tenantId: string; tokenId: string };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing_token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as {
      sub: string;
      tid: string;
      jti: string;
    };

    const revoked = await redis.get(`revoked:${payload.jti}`);
    if (revoked) return res.status(401).json({ error: "revoked" });

    req.user = { userId: payload.sub, tenantId: payload.tid, tokenId: payload.jti };
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}
