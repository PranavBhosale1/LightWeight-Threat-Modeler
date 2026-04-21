import express from "express";
import helmet from "helmet";
import cors from "cors";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { notesRouter } from "./routes/notes.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { redis } from "./db.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN ?? "https://notes.example.com", credentials: true }));
app.use(express.json({ limit: "128kb" }));

async function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = `rl:${req.ip}:${req.path}`;
  const hits = await redis.incr(key);
  if (hits === 1) await redis.expire(key, 60);
  if (hits > 120) return res.status(429).json({ error: "rate_limited" });
  next();
}

app.use("/auth", rateLimit, authRouter);
app.use("/api", rateLimit, requireAuth, notesRouter);
app.use("/api/webhooks", rateLimit, requireAuth, webhooksRouter);

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => console.log(`notes-api listening on ${port}`));
