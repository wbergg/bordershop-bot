// Bordershop migrated onto SAP Commerce Cloud (Gebr. Heinemann B2C platform).

const BASE = "https://www.bordershop.com";
const OCC = `${BASE}/occ/v2/SCA`;
// Storefront URL prefix: OCC returns product urls without the locale/POS path.
const STOREFRONT_PREFIX = "/sv/puttgarden";

// lang=en is used because the Swedish locale leaves product `name` empty in the
// catalog; the English name is the populated one.
const LANG = "en";
const PRICE_CURRENCY = "DKK";
const DISPLAY_CURRENCY = "SEK";
const PAGE_SIZE = 100;
const FETCH_TIMEOUT_MS = 15000;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export interface BordershopProduct {
  code: string;
  name: string;
  price: number;
  priceSek: number;
  stockStatus: string;
  image: string;
  url: string;
  purchasable: boolean;
  promotion: string;
}

export interface BordershopCategoryResponse {
  products: BordershopProduct[];
}

interface OccImage {
  format?: string;
  imageType?: string;
  url?: string;
}

interface OccProduct {
  code?: string;
  name?: string;
  price?: { value?: number; currencyIso?: string };
  stock?: { stockLevelStatus?: string };
  images?: OccImage[];
  url?: string;
  purchasable?: boolean;
}

interface OccSearchResponse {
  products?: OccProduct[];
  pagination?: { currentPage?: number; totalPages?: number; totalResults?: number };
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

// Pick the largest PRIMARY image and turn the relative /medias path into an
// absolute URL so it can be linked directly in Telegram.
function primaryImage(images: OccImage[] | undefined): string {
  if (!images || images.length === 0) return "";
  const pick =
    images.find((i) => i.format === "product" && i.imageType === "PRIMARY") ??
    images.find((i) => i.imageType === "PRIMARY") ??
    images[0];
  const url = pick?.url;
  if (!url) return "";
  return url.startsWith("http") ? url : BASE + url;
}

function productUrl(url: string | undefined): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return BASE + STOREFRONT_PREFIX + url;
}

function normalizeProduct(
  raw: OccProduct,
  priceSek: number,
  promotion: string,
  nameOverride: string,
): BordershopProduct {
  return {
    code: s(raw.code),
    // Prefer the Swedish storefront name ("...burk"); the OCC API only has the
    // English name ("...DS") and leaves the Swedish locale empty.
    name: nameOverride || s(raw.name),
    price: n(raw.price?.value),
    priceSek,
    stockStatus: s(raw.stock?.stockLevelStatus),
    image: primaryImage(raw.images),
    url: productUrl(raw.url),
    purchasable: b(raw.purchasable),
    promotion,
  };
}

interface StorefrontInfo {
  name: string; // localized Swedish name, e.g. "...24 x 33 cl burk"
  promotion: string; // multi-buy deal text, e.g. "FAXE-BUY 3 FOR 184.95"
}

// Decode the handful of HTML entities / non-breaking spaces that appear in
// storefront names and collapse whitespace.
function cleanText(raw: string): string {
  return raw
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/ /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// The OCC API only populates the English product name (Swedish/Danish come back
// empty) and exposes no promotions, so we read both from the storefront search
// HTML. Returns, keyed by numeric product code: the Swedish name (itemprop) and
// the multi-buy promotion text.
async function fetchStorefront(
  categoryCode: string,
): Promise<Map<string, StorefrontInfo>> {
  const query = `:relevance:allCategories:${categoryCode}`;
  const url = `${BASE}${STOREFRONT_PREFIX}/search/?q=${encodeURIComponent(query)}&pageSize=100`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `bordershop storefront ${categoryCode} failed: ${res.status} ${res.statusText}`,
    );
  }
  const html = await res.text();

  const info = new Map<string, StorefrontInfo>();
  const cards = html.split("c-product-card js-wishlist-anchor");
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    const codeMatch = card.match(/data-track-id="0*(\d+)"/);
    if (!codeMatch) continue;

    const nameMatch = card.match(/id="articleName-\d+"\s*>([^<]+)</);
    const name = nameMatch ? cleanText(nameMatch[1]) : "";

    const promoMatch = card.match(
      /c-product-card__promotion-section\s*"\s*>\s*([^<]+?)\s*<\/div>/,
    );
    const promotion = promoMatch
      ? promoMatch[1].trim().replace(/\s+/g, " ")
      : "";

    info.set(codeMatch[1], { name, promotion });
  }
  return info;
}

async function fetchSearchPage(
  categoryCode: string,
  currency: string,
  page: number,
): Promise<OccSearchResponse> {
  const params = new URLSearchParams({
    query: `:relevance:allCategories:${categoryCode}`,
    curr: currency,
    lang: LANG,
    fields: "FULL",
    pageSize: String(PAGE_SIZE),
    currentPage: String(page),
  });
  const url = `${OCC}/products/search?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `bordershop category ${categoryCode} failed: ${res.status} ${res.statusText}`,
    );
  }
  // During maintenance the platform serves an HTML page with HTTP 200, which
  // would otherwise blow up in res.json() with a cryptic parse error. Detect
  // it and throw a concise message instead.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `bordershop category ${categoryCode} returned non-JSON (status ${res.status}, content-type: ${contentType || "unknown"}) — likely maintenance`,
    );
  }
  return (await res.json()) as OccSearchResponse;
}

async function fetchAllPages(
  categoryCode: string,
  currency: string,
): Promise<OccProduct[]> {
  const products: OccProduct[] = [];
  let page = 0;
  let totalPages = 1;
  do {
    const body = await fetchSearchPage(categoryCode, currency, page);
    for (const p of body.products ?? []) products.push(p);
    totalPages = body.pagination?.totalPages ?? 1;
    page++;
  } while (page < totalPages);
  return products;
}

export async function getCategory(
  categoryCode: string,
): Promise<BordershopCategoryResponse> {
  // Fetch the same category in the tracked currency (DKK), the display currency
  // (SEK), and the storefront (Swedish names + promotions); join on product code.
  const [priced, display, storefront] = await Promise.all([
    fetchAllPages(categoryCode, PRICE_CURRENCY),
    fetchAllPages(categoryCode, DISPLAY_CURRENCY),
    fetchStorefront(categoryCode),
  ]);

  const sekByCode = new Map<string, number>();
  for (const p of display) sekByCode.set(s(p.code), n(p.price?.value));

  const products = priced.map((p) => {
    const code = s(p.code);
    // storefront info is keyed by the numeric code (leading zeros stripped)
    const numericCode = String(parseInt(code, 10));
    const sf = storefront.get(numericCode);
    return normalizeProduct(
      p,
      sekByCode.get(code) ?? 0,
      sf?.promotion ?? "",
      sf?.name ?? "",
    );
  });
  return { products };
}
