import type { DBItem } from "./db";
import type { BordershopProduct } from "./bordershop";

export interface Change {
  path: string;
  from: unknown;
  to: unknown;
}

type FieldExtractor = {
  name: string;
  fromDB: (row: DBItem) => unknown;
  fromAPI: (p: BordershopProduct) => unknown;
};

function boolish(v: number | null): boolean | null {
  if (v === null) return null;
  return v === 1;
}

const trackedFields: FieldExtractor[] = [
  { name: "IsCheapest",     fromDB: r => boolish(r.ischeapest),    fromAPI: p => p.isCheapest },
  { name: "Price",          fromDB: r => r.price,                  fromAPI: p => p.price.amountAsDecimal },
  { name: "DisplayName",    fromDB: r => r.displayname,            fromAPI: p => p.displayName },
  { name: "Image",          fromDB: r => r.image,                  fromAPI: p => p.image },
  { name: "UnitPriceText2", fromDB: r => r.unitpricetext2,         fromAPI: p => p.unitPriceText2 },
  { name: "DiscountText",   fromDB: r => r.discounttext,           fromAPI: p => p.discount.discountText },
  { name: "IsSmileOffer",   fromDB: r => boolish(r.issmileoffer),  fromAPI: p => p.discount.isSmileOffer },
  { name: "IsShopOnly",     fromDB: r => boolish(r.isshoponly),    fromAPI: p => p.addToBasket.isShopOnly },
  { name: "IsSoldOut",      fromDB: r => boolish(r.issoldout),     fromAPI: p => p.addToBasket.isSoldOut },
];

export function diffProduct(row: DBItem, product: BordershopProduct): Change[] {
  const changes: Change[] = [];
  for (const f of trackedFields) {
    const from = f.fromDB(row);
    const to = f.fromAPI(product);
    if (from !== to) {
      changes.push({ path: f.name, from, to });
    }
  }
  return changes;
}

const strDefinitions: Record<string, string> = {
  "Price":              "Price of #NAME has changed from #FROM to #TO SEK\n\n",
  "DiscountText-true":  "#NAME is now on discount!\n\n#TO!",
  "DiscountText-false": "#NAME is no longer on discount!\n\n",
  "IsShopOnly-false":   "#NAME can now be bought online!\n\n",
  "IsShopOnly-true":    "#NAME can now only be bought in shop!\n\n",
  "IsSoldOut-false":    "#NAME is back in stock!\n\n",
  "IsSoldOut-true":     "#NAME is sold out!\n\n",
  "UnitPriceText2":     "#NAME has changed price!\n\n#TO",
  "Image":              "#NAME has a new image!\n\n",
  "DisplayName":        "#NAME has changed name from #FROM to #TO!\n\n",
  "IsCheapest-true":    "#NAME is now classified as cheapest!\n\n",
  "IsCheapest-false":   "#NAME is no longer classified as cheapest.\n\n",
  "IsSmileOffer-true":  "#NAME is now a SMILE :) offer!\n\n",
  "IsSmileOffer-false": "#NAME is no longer a SMILE :) offer.\n\n",
};

export interface FormatState {
  priceChange: boolean;
}

export function format(
  event: string,
  item: string,
  from: unknown,
  to: unknown,
  state: FormatState,
): string {
  const toStr = String(to);
  const fromStr = String(from);

  let key = event;
  if (toStr === "true") key = `${event}-true`;
  if (toStr === "false") key = `${event}-false`;
  if (event === "DiscountText") {
    key = toStr === "" ? `${event}-false` : `${event}-true`;
  }

  if (event === "Price") state.priceChange = true;
  if (state.priceChange && event === "UnitPriceText2") {
    state.priceChange = false;
    return "";
  }

  const tmpl = strDefinitions[key];
  if (!tmpl) return "";
  return tmpl
    .replaceAll("#NAME", item)
    .replaceAll("#FROM", fromStr)
    .replaceAll("#TO", toStr);
}
