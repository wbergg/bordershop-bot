import type { Env } from "./index";

export const validColumns = new Set([
  "ischeapest",
  "price",
  "displayname",
  "brand",
  "image",
  "abv",
  "uom",
  "qtypruom",
  "unitpricetext1",
  "unitpricetext2",
  "discounttext",
  "beforeprice",
  "beforepriceprefix",
  "splashtext",
  "issmileoffer",
  "isshoponly",
  "issoldout",
]);

export interface DBItem {
  id: number;
  ischeapest: number | null;
  price: number | null;
  displayname: string;
  brand: string;
  image: string;
  abv: number | null;
  uom: string;
  qtypruom: string;
  unitpricetext1: string;
  unitpricetext2: string;
  discounttext: string;
  beforeprice: number | null;
  beforepriceprefix: string;
  splashtext: string;
  issmileoffer: number | null;
  isshoponly: number | null;
  issoldout: number | null;
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
      id, ischeapest, price, displayname, brand, image, uom, qtypruom,
      unitpricetext1, unitpricetext2, discounttext, beforeprice, beforepriceprefix,
      splashtext, issmileoffer, isshoponly, issoldout
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    item.id,
    item.ischeapest,
    item.price,
    item.displayname,
    item.brand,
    item.image,
    item.uom,
    item.qtypruom,
    item.unitpricetext1,
    item.unitpricetext2,
    item.discounttext,
    item.beforeprice,
    item.beforepriceprefix,
    item.splashtext,
    item.issmileoffer,
    item.isshoponly,
    item.issoldout,
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
