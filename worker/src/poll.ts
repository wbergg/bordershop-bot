import { getCategory, type BordershopProduct } from "./bordershop";
import {
  countItems,
  getItemByPid,
  insertItemStmt,
  updateColumnStmt,
  type DBItem,
} from "./db";
import { diffProduct, format } from "./diff";
import { sendTelegram } from "./telegram";
import type { Env } from "./index";

// Product codes are zero-padded strings (e.g. "000000000001772127"); the
// numeric value is used as the primary key.
function productPid(p: BordershopProduct): number {
  return parseInt(p.code, 10);
}

function productToDBItem(p: BordershopProduct): DBItem {
  return {
    id: productPid(p),
    name: p.name,
    price: p.price, // DKK (tracked)
    pricesek: p.priceSek, // SEK (display)
    stockstatus: p.stockStatus,
    image: p.image,
    url: p.url,
    purchasable: p.purchasable ? 1 : 0,
    promotion: p.promotion,
  };
}

function newItemMessage(p: BordershopProduct): string {
  let msg = "";
  msg += "*New item added to BORDERSHOP!*\n\n";
  msg += p.name.replaceAll("\n", " ") + "\n\n";
  msg += "Price: " + p.priceSek + " SEK\n";
  if (p.promotion) msg += "Offer: " + p.promotion.replaceAll("\n", " ") + "\n";
  if (p.stockStatus === "outOfStock") msg += "\n*ITEM IS SOLD OUT!*\n";
  else if (!p.purchasable) msg += "\n*CANNOT BE BOUGHT ONLINE!*\n";
  if (p.url) msg += "\n" + p.url + "\n";
  return msg;
}

export async function seedIfEmpty(
  env: Env,
  categories: string[],
): Promise<number | null> {
  const existing = await countItems(env);
  if (existing > 0) return null;

  let total = 0;
  for (const cat of categories) {
    const result = await getCategory(cat);
    const stmts: D1PreparedStatement[] = [];
    for (const product of result.products) {
      const pid = productPid(product);
      if (Number.isNaN(pid)) {
        console.error("failed to parse product code, skipping:", product.code);
        continue;
      }
      stmts.push(insertItemStmt(env, productToDBItem(product)));
    }
    if (stmts.length > 0) {
      await env.DB.batch(stmts);
      total += stmts.length;
    }
  }
  return total;
}

export interface PollResult {
  inserted: number;
  updated: number;
  messages: number;
}

export async function runPoll(
  env: Env,
  categories: string[],
  dry: boolean,
): Promise<PollResult> {
  let inserted = 0;
  let updated = 0;
  let messages = 0;

  for (const cat of categories) {
    const result = await getCategory(cat);
    const writes: D1PreparedStatement[] = [];
    const outgoing: string[] = [];

    for (const product of result.products) {
      const pid = productPid(product);
      if (Number.isNaN(pid)) {
        console.error("failed to parse product code, skipping:", product.code);
        continue;
      }

      const existing = await getItemByPid(env, pid);

      if (!existing) {
        writes.push(insertItemStmt(env, productToDBItem(product)));
        outgoing.push(newItemMessage(product));
        inserted++;
        continue;
      }

      const changes = diffProduct(existing, product);
      if (changes.length === 0) continue;

      let msg = "*UPDATE ON BORDERSHOP!*\n\n";
      const name = existing.name.replaceAll("\n", " ");

      for (const change of changes) {
        writes.push(
          updateColumnStmt(env, change.path.toLowerCase(), change.to, pid),
        );
        if (change.path === "Price") {
          writes.push(updateColumnStmt(env, "pricesek", product.priceSek, pid));
          msg += format("Price", name, existing.pricesek, product.priceSek);
        } else {
          msg += format(change.path, name, change.from, change.to);
        }
      }

      if (product.url) msg += product.url + "\n";

      outgoing.push(msg);
      updated++;
    }

    if (writes.length > 0) {
      await env.DB.batch(writes);
    }

    for (const m of outgoing) {
      await sendTelegram(env, m, { dry });
      messages++;
    }
  }

  return { inserted, updated, messages };
}
