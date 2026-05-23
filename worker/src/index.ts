import { Hono } from "hono";
import { authMiddleware } from "./auth";
import { getAllItems } from "./db";
import { runPoll, seedIfEmpty } from "./poll";
import { sendTelegram } from "./telegram";

export interface Env {
  DB: D1Database;
  TG_API_KEY: string;
  TG_CHANNEL: string;
  AUTH_TOKEN: string;
  CATEGORIES: string;
}

function parseCategories(raw: string): number[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === "number")) {
    throw new Error("CATEGORIES must be a JSON array of numbers");
  }
  return parsed;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));

app.use("/trigger", authMiddleware);
app.use("/telegram-test", authMiddleware);
app.use("/items", authMiddleware);

app.post("/trigger", async (c) => {
  const dry = c.req.query("dry") === "1";
  const categories = parseCategories(c.env.CATEGORIES);
  try {
    const seeded = await seedIfEmpty(c.env, categories);
    if (seeded !== null) {
      return c.json({ status: "seeded", inserted: seeded });
    }
    const result = await runPoll(c.env, categories, dry);
    return c.json({ status: "ok", dry, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("trigger failed:", msg);
    if (!dry) {
      try {
        await sendTelegram(c.env, `⚠ bordershop-bot error: ${msg}`);
      } catch (sendErr) {
        console.error("failed to send error alert:", sendErr);
      }
    }
    return c.json({ status: "error", error: msg }, 500);
  }
});

app.post("/telegram-test", async (c) => {
  await sendTelegram(c.env, "DEBUG: bordershop-bot test message");
  return c.json({ status: "sent" });
});

app.get("/items", async (c) => {
  const items = await getAllItems(c.env);
  return c.json(items);
});

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const categories = parseCategories(env.CATEGORIES);
          const seeded = await seedIfEmpty(env, categories);
          if (seeded !== null) {
            console.log(`seeded ${seeded} items`);
            return;
          }
          const result = await runPoll(env, categories, false);
          console.log("poll ok:", result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("scheduled poll failed:", msg);
          try {
            await sendTelegram(env, `⚠ bordershop-bot error: ${msg}`);
          } catch (sendErr) {
            console.error("failed to send error alert:", sendErr);
          }
        }
      })(),
    );
  },
};
