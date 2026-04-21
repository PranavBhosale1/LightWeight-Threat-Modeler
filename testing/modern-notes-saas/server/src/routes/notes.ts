import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { pool, redis } from "../db.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const notesRouter = Router();

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!
  }
});

const BUCKET = process.env.S3_BUCKET!;

const NoteInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(50_000)
});

notesRouter.get("/notes", async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, title, updated_at FROM notes WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 100`,
    [req.user!.tenantId]
  );
  res.json(rows);
});

notesRouter.post("/notes", async (req: AuthedRequest, res) => {
  const parsed = NoteInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "bad_input" });
  const { rows } = await pool.query(
    `INSERT INTO notes (tenant_id, author_id, title, body)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [req.user!.tenantId, req.user!.userId, parsed.data.title, parsed.data.body]
  );
  res.status(201).json({ id: rows[0].id });
});

notesRouter.post("/notes/:id/share", async (req: AuthedRequest, res) => {
  const token = randomBytes(24).toString("base64url");
  await pool.query(
    `INSERT INTO share_links (token, note_id, tenant_id) VALUES ($1, $2, $3)`,
    [token, req.params.id, req.user!.tenantId]
  );
  res.json({ url: `https://notes.example.com/s/${token}` });
});

notesRouter.get("/s/:token", async (req, res) => {
  const cached = await redis.get(`share:${req.params.token}`);
  if (cached) return res.json(JSON.parse(cached));

  const { rows } = await pool.query(
    `SELECT n.id, n.title, n.body FROM notes n
     JOIN share_links s ON s.note_id = n.id
     WHERE s.token = $1 AND s.revoked = false`,
    [req.params.token]
  );
  if (!rows[0]) return res.status(404).json({ error: "not_found" });

  await redis.set(`share:${req.params.token}`, JSON.stringify(rows[0]), "EX", 60);
  res.json(rows[0]);
});

notesRouter.post("/notes/:id/attachments", async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM notes WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.user!.tenantId]
  );
  if (!rows[0]) return res.status(404).json({ error: "not_found" });

  const key = `${req.user!.tenantId}/${req.params.id}/${randomBytes(16).toString("hex")}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 300 }
  );
  res.json({ uploadUrl: url, key });
});

notesRouter.get("/attachments/:key(*)", async (req: AuthedRequest, res) => {
  if (!req.params.key.startsWith(`${req.user!.tenantId}/`)) {
    return res.status(403).json({ error: "forbidden" });
  }
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: req.params.key }),
    { expiresIn: 120 }
  );
  res.json({ downloadUrl: url });
});
