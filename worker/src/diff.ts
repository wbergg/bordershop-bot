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
  { name: "Name",        fromDB: r => r.name,                 fromAPI: p => p.name },
  { name: "Price",       fromDB: r => r.price,                fromAPI: p => p.price },
  { name: "StockStatus", fromDB: r => r.stockstatus,          fromAPI: p => p.stockStatus },
  { name: "Image",       fromDB: r => r.image,                fromAPI: p => p.image },
  { name: "Purchasable", fromDB: r => boolish(r.purchasable), fromAPI: p => p.purchasable },
  { name: "Promotion",   fromDB: r => r.promotion,            fromAPI: p => p.promotion },
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
  "Price":                  "Price of #NAME has changed from #FROM to #TO SEK\n\n",
  "Name":                   "#FROM has changed name to #TO!\n\n",
  "Image":                  "#NAME has a new image!\n\n",
  "StockStatus-inStock":    "#NAME is back in stock!\n\n",
  "StockStatus-lowStock":   "#NAME is running low in stock!\n\n",
  "StockStatus-outOfStock": "#NAME is sold out!\n\n",
  "Purchasable-true":       "#NAME can now be bought online!\n\n",
  "Purchasable-false":      "#NAME can no longer be bought online!\n\n",
  "Promotion-set":          "#NAME has a new offer:\n\n#TO\n\n",
  "Promotion-cleared":      "#NAME's offer has ended.\n\n",
};

// Maps a change to a key in strDefinitions. Boolean fields and the enum-valued
// StockStatus get a value suffix; everything else keys on the field name alone.
function templateKey(event: string, toStr: string): string {
  if (event === "StockStatus") return `${event}-${toStr}`;
  if (event === "Promotion") return toStr === "" ? "Promotion-cleared" : "Promotion-set";
  if (toStr === "true" || toStr === "false") return `${event}-${toStr}`;
  return event;
}

export function format(
  event: string,
  item: string,
  from: unknown,
  to: unknown,
): string {
  const toStr = String(to);
  const fromStr = String(from);

  const tmpl = strDefinitions[templateKey(event, toStr)];
  if (!tmpl) return "";
  return tmpl
    .replaceAll("#NAME", item)
    .replaceAll("#FROM", fromStr)
    .replaceAll("#TO", toStr);
}
