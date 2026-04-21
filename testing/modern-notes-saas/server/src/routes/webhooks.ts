import { Router } from "express";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { pool } from "../db.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const webhooksRouter = Router();

const SubInput = z.object({
  url: z.string().url(),
  events: z.array(z.enum(["note.created", "note.updated"])).min(1)
});

webhooksRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = SubInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "bad_input" });

  const secret = randomBytes(32).toString("hex");
  const { rows } = await pool.query(
    `INSERT INTO webhooks (tenant_id, url, secret, events)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [req.user!.tenantId, parsed.data.url, secret, parsed.data.events]
  );
  res.status(201).json({ id: rows[0].id, secret });
});

export async function deliver(tenantId: string, event: string, payload: object) {
  const { rows } = await pool.query(
    `SELECT id, url, secret, events FROM webhooks WHERE tenant_id = $1`,
    [tenantId]
  );

  const body = JSON.stringify({ event, data: payload });
  const timestamp = Date.now().toString();

  for (const sub of rows) {
    if (!sub.events.includes(event)) continue;

    const signature = createHmac("sha256", sub.secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    try {
      await fetch(sub.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-timestamp": timestamp,
          "x-signature": `sha256=${signature}`
        },
        body,
        signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 5000))
      });
    } catch (err) {
      console.warn("webhook_delivery_failed", { sub: sub.id, err: String(err) });
    }
  }
}
