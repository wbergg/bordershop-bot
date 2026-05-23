export interface BordershopProduct {
  id: string;
  isCheapest: boolean;
  price: { amountAsDecimal: number };
  displayName: string;
  brand: string;
  uom: string;
  qtyPrUom: string;
  image: string;
  unitPriceText1: string;
  unitPriceText2: string;
  discount: {
    discountText: string;
    beforePrice: { amountAsDecimal: number };
    beforePricePrefix: string;
    splashText: string;
    isSmileOffer: boolean;
  };
  addToBasket: {
    isShopOnly: boolean;
    isSoldOut: boolean;
  };
}

export interface BordershopCategoryResponse {
  products: BordershopProduct[];
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36";

export async function getCategory(
  categoryId: number,
): Promise<BordershopCategoryResponse> {
  const url = `https://www.bordershop.com/se/bordershop/api/catalogsearchapi/productsearch?categoryId=${encodeURIComponent(
    String(categoryId),
  )}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(
      `bordershop category ${categoryId} failed: ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as { products?: unknown[] };
  return { products: (body.products ?? []).map(normalizeProduct) };
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function n(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function b(v: unknown): boolean {
  return typeof v === "boolean" ? v : false;
}

function normalizeProduct(raw: unknown): BordershopProduct {
  const p = (raw ?? {}) as Record<string, unknown>;
  const price = (p.price ?? {}) as Record<string, unknown>;
  const discount = (p.discount ?? {}) as Record<string, unknown>;
  const beforePrice = (discount.beforePrice ?? {}) as Record<string, unknown>;
  const addToBasket = (p.addToBasket ?? {}) as Record<string, unknown>;
  return {
    id: s(p.id),
    isCheapest: b(p.isCheapest),
    price: { amountAsDecimal: n(price.amountAsDecimal) },
    displayName: s(p.displayName),
    brand: s(p.brand),
    uom: s(p.uom),
    qtyPrUom: s(p.qtyPrUom),
    image: s(p.image),
    unitPriceText1: s(p.unitPriceText1),
    unitPriceText2: s(p.unitPriceText2),
    discount: {
      discountText: s(discount.discountText),
      beforePrice: { amountAsDecimal: n(beforePrice.amountAsDecimal) },
      beforePricePrefix: s(discount.beforePricePrefix),
      splashText: s(discount.splashText),
      isSmileOffer: b(discount.isSmileOffer),
    },
    addToBasket: {
      isShopOnly: b(addToBasket.isShopOnly),
      isSoldOut: b(addToBasket.isSoldOut),
    },
  };
}
