import { getCategory, type BordershopProduct } from "./bordershop";
import {
  countItems,
  getItemByPid,
  insertItemStmt,
  updateColumnStmt,
  type DBItem,
} from "./db";
import { diffProduct, format, type FormatState } from "./diff";
import { sendTelegram } from "./telegram";
import type { Env } from "./index";

function productToDBItem(p: BordershopProduct): DBItem {
  return {
    id: parseInt(p.id, 10),
    ischeapest: p.isCheapest ? 1 : 0,
    price: p.price.amountAsDecimal,
    displayname: p.displayName,
    brand: p.brand,
    image: p.image,
    abv: null,
    uom: p.uom,
    qtypruom: p.qtyPrUom,
    unitpricetext1: p.unitPriceText1,
    unitpricetext2: p.unitPriceText2,
    discounttext: p.discount.discountText,
    beforeprice: p.discount.beforePrice.amountAsDecimal,
    beforepriceprefix: p.discount.beforePricePrefix,
    splashtext: p.discount.splashText,
    issmileoffer: p.discount.isSmileOffer ? 1 : 0,
    isshoponly: p.addToBasket.isShopOnly ? 1 : 0,
    issoldout: p.addToBasket.isSoldOut ? 1 : 0,
  };
}

function newItemMessage(p: BordershopProduct): string {
  let msg = "";
  msg += "*New item added to BORDERSHOP!*\n";
  msg +=
    "https://cmxsapnc.cloudimg.io/fit/220x220/fbright5/\\_img\\_/" +
    p.image +
    "\n";
  msg += "\n" + p.displayName.replaceAll("\n", " ") + "\n";
  msg += "\n" + "Type: " + p.uom.replaceAll("\n", " ") + "\n";
  msg += "Amount: " + p.unitPriceText1.replaceAll("\n", " ") + "\n";
  msg += p.unitPriceText2.replaceAll("\n", " ") + "\n";
  if (p.addToBasket.isShopOnly) msg += "\n*CAN ONLY BE BOUGHT IN SHOP!*\n";
  if (p.addToBasket.isSoldOut) msg += "\n*ITEM IS SOLD OUT!*\n";
  return msg;
}

export async function seedIfEmpty(
  env: Env,
  categories: number[],
): Promise<number | null> {
  const existing = await countItems(env);
  if (existing > 0) return null;

  let total = 0;
  for (const cat of categories) {
    const result = await getCategory(cat);
    const stmts: D1PreparedStatement[] = [];
    for (const product of result.products) {
      const pid = parseInt(product.id, 10);
      if (Number.isNaN(pid)) {
        console.error("failed to parse product id, skipping:", product.id);
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
  categories: number[],
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
      const pid = parseInt(product.id, 10);
      if (Number.isNaN(pid)) {
        console.error("failed to parse product id, skipping:", product.id);
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

      const state: FormatState = { priceChange: false };
      let msg = "";
      msg += "*UPDATE ON BORDERSHOP!*\n";
      msg +=
        "https://cmxsapnc.cloudimg.io/fit/220x220/fbright5/\\_img\\_/" +
        product.image +
        "\n\n";

      for (const change of changes) {
        writes.push(
          updateColumnStmt(env, change.path.toLowerCase(), change.to, pid),
        );
        msg += format(
          change.path,
          existing.displayname.replaceAll("\n", " "),
          change.from,
          change.to,
          state,
        );
      }

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
