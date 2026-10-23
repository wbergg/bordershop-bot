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
// Runaway guard for storefront pagination; ~40 cards/page, so far above any
// real category size.
const STOREFRONT_MAX_PAGES = 20;

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
  // True when `name` is the English OCC fallback rather than the Swedish
  // storefront name (the storefront card was missing, or its name did not
  // parse). Lets the diff avoid downgrading a stored Swedish name to English,
  // which would fire a bogus rename notification.
  nameIsFallback: boolean;
  // True when the storefront search had no card for this product at all, so we
  // have no idea whether it carries a promotion. Distinct from promotion === "",
  // which means the card was present and had no deal. The diff must not read
  // absence as "the offer ended" — that flip-flops as the storefront re-ranks.
  promotionIsUnknown: boolean;
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
  sf: StorefrontInfo | undefined,
): BordershopProduct {
  return {
    code: s(raw.code),
    // Prefer the Swedish storefront name ("...burk"); the OCC API only has the
    // English name ("...DS") and leaves the Swedish locale empty.
    name: sf?.name || s(raw.name),
    price: n(raw.price?.value),
    priceSek,
    stockStatus: s(raw.stock?.stockLevelStatus),
    image: primaryImage(raw.images),
    url: productUrl(raw.url),
    purchasable: b(raw.purchasable),
    promotion: sf?.promotion ?? "",
    nameIsFallback: !sf?.name,
    promotionIsUnknown: sf === undefined,
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

async function fetchStorefrontPage(
  categoryCode: string,
  page: number,
): Promise<string> {
  const query = `:relevance:allCategories:${categoryCode}`;
  const url = `${BASE}${STOREFRONT_PREFIX}/search/?q=${encodeURIComponent(query)}&page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `bordershop storefront ${categoryCode} page ${page} failed: ${res.status} ${res.statusText}`,
    );
  }
  return await res.text();
}

// Parse the product cards out of one storefront search page into `info`.
// Returns the number of cards seen, which is how pagination detects the end.
function parseStorefrontCards(
  html: string,
  info: Map<string, StorefrontInfo>,
): number {
  const cards = html.split("c-product-card js-wishlist-anchor");
  let seen = 0;
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    const codeMatch = card.match(/data-track-id="0*(\d+)"/);
    if (!codeMatch) continue;
    seen++;

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
  return seen;
}

// The OCC API only populates the English product name (Swedish/Danish come back
// empty) and exposes no promotions, so we read both from the storefront search
// HTML. Returns, keyed by numeric product code: the Swedish name (itemprop) and
// the multi-buy promotion text.
//
// The storefront ignores `pageSize` and renders at most 40 cards per page, so we
// walk `&page=N` until a page yields no cards (a past-the-end page renders an
// empty result list, not an error). Fetching only the first page used to leave
// every product past card 40 with no storefront data — and because the
// storefront's relevance ranking differs from OCC's and re-ranks over time,
// products drifted across the 40-card cut and their promotions appeared to come
// and go on every poll.
async function fetchStorefront(
  categoryCode: string,
): Promise<Map<string, StorefrontInfo>> {
  const info = new Map<string, StorefrontInfo>();
  let page = 0;
  for (; page < STOREFRONT_MAX_PAGES; page++) {
    const html = await fetchStorefrontPage(categoryCode, page);
    if (parseStorefrontCards(html, info) === 0) break;
  }
  if (page === STOREFRONT_MAX_PAGES) {
    console.warn(
      `bordershop storefront ${categoryCode} hit the ${STOREFRONT_MAX_PAGES}-page cap; some products may be missing storefront data`,
    );
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
  return fetchOccJson<OccSearchResponse>(url, `category ${categoryCode}`);
}

async function fetchOccJson<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `bordershop ${label} failed: ${res.status} ${res.statusText}`,
    );
  }
  // During maintenance the platform serves an HTML page with HTTP 200, which
  // would otherwise blow up in res.json() with a cryptic parse error. Detect
  // it and throw a concise message instead.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `bordershop ${label} returned non-JSON (status ${res.status}, content-type: ${contentType || "unknown"}) — likely maintenance`,
    );
  }
  return (await res.json()) as T;
}

// The search index is served by replicas that occasionally disagree on a
// product's price (e.g. 74.99 vs 74.48 DKK on alternating requests), which
// fires a phantom price change every few polls. The single-product endpoint is
// consistent, so a price change seen in search is confirmed against it.
export async function getProductPrice(
  code: string,
): Promise<{ price: number; priceSek: number }> {
  const fetchPrice = async (currency: string) => {
    const params = new URLSearchParams({ curr: currency, lang: LANG, fields: "BASIC" });
    const url = `${OCC}/products/${encodeURIComponent(code)}?${params.toString()}`;
    const body = await fetchOccJson<OccProduct>(url, `product ${code}`);
    return n(body.price?.value);
  };
  const [price, priceSek] = await Promise.all([
    fetchPrice(PRICE_CURRENCY),
    fetchPrice(DISPLAY_CURRENCY),
  ]);
  return { price, priceSek };
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
    return normalizeProduct(
      p,
      sekByCode.get(code) ?? 0,
      storefront.get(numericCode),
    );
  });
  return { products };
}
