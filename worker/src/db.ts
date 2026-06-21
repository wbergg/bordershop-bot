import type { Env } from "./index";

export const validColumns = new Set([
  "name",
  "price",
  "pricesek",
  "stockstatus",
  "image",
  "url",
  "purchasable",
  "promotion",
]);

export interface DBItem {
  id: number;
  name: string;
  price: number | null; // DKK — tracked
  pricesek: number | null; // SEK — display only
  stockstatus: string;
  image: string;
  url: string;
  purchasable: number | null;
  promotion: string;
}

export async function getState(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM state WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setState(
  env: Env,
  key: string,
  value: string,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(key, value)
    .run();
}

export async function deleteState(env: Env, key: string): Promise<void> {
  await env.DB.prepare("DELETE FROM state WHERE key = ?").bind(key).run();
}

export async function countItems(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM items").first<{
    c: number;
  }>();
  return row?.c ?? 0;
}

export async function getItemByPid(
  env: Env,
  pid: number,
): Promise<DBItem | null> {
  return await env.DB.prepare("SELECT * FROM items WHERE id = ?")
    .bind(pid)
    .first<DBItem>();
}

export async function getAllItems(env: Env): Promise<DBItem[]> {
  const { results } = await env.DB.prepare("SELECT * FROM items").all<DBItem>();
  return results;
}

export function insertItemStmt(env: Env, item: DBItem): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO items (
      id, name, price, pricesek, stockstatus, image, url, purchasable, promotion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    item.id,
    item.name,
    item.price,
    item.pricesek,
    item.stockstatus,
    item.image,
    item.url,
    item.purchasable,
    item.promotion,
  );
}

export function updateColumnStmt(
  env: Env,
  column: string,
  value: unknown,
  pid: number,
): D1PreparedStatement {
  if (!validColumns.has(column)) {
    throw new Error(`invalid column: ${column}`);
  }
  const bound =
    typeof value === "boolean" ? (value ? 1 : 0) : (value as D1Bindable);
  return env.DB.prepare(`UPDATE items SET ${column} = ? WHERE id = ?`).bind(
    bound,
    pid,
  );
}

type D1Bindable = string | number | null | ArrayBuffer;
