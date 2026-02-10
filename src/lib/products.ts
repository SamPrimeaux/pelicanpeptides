import type { CatalogItem } from "./catalog";
import { getFallbackCatalogItemByKey, normalizeProductKey } from "./catalog";

type D1Like = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
    };
  };
};

function centsFromUnknown(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    // If it looks like dollars (e.g., 120.00), convert. If it looks like cents (12000), keep.
    if (v > 0 && v < 1000) return Math.round(v * 100);
    return Math.round(v);
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n > 0 && n < 1000) return Math.round(n * 100);
    return Math.round(n);
  }
  return null;
}

function pickString(row: Record<string, unknown> | null, keys: string[]): string | null {
  if (!row) return null;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

function pickCents(row: Record<string, unknown> | null, keys: string[]): number | null {
  if (!row) return null;
  for (const k of keys) {
    const c = centsFromUnknown(row[k]);
    if (typeof c === "number" && c > 0) return c;
  }
  return null;
}

/**
 * Attempts to read product data from D1 using a few common schema variants.
 * Falls back to `FALLBACK_CATALOG` if D1 is missing/unexpected.
 */
export async function getProductById(opts: {
  id: string;
  db?: D1Like;
  defaultCurrency?: string;
}): Promise<CatalogItem | null> {
  // Backwards compatible wrapper
  return getProductByKey({ key: opts.id, db: opts.db, defaultCurrency: opts.defaultCurrency });
}

/**
 * Lookup by id OR slug/handle (best-effort across schema variants).
 */
export async function getProductByKey(opts: {
  key: string;
  db?: D1Like;
  defaultCurrency?: string;
}): Promise<CatalogItem | null> {
  const { key, db, defaultCurrency = "USD" } = opts;
  const normalizedKey = normalizeProductKey(key);
  if (!normalizedKey) return null;

  if (db) {
    const queries = [
      // common "price_cents"
      `SELECT id, name, price_cents, currency, square_catalog_object_id, square_variation_id
       FROM products WHERE id = ?1 LIMIT 1`,
      // slug lookup
      `SELECT id, name, price_cents, currency, square_catalog_object_id, square_variation_id
       FROM products WHERE slug = ?1 LIMIT 1`,
      // handle lookup
      `SELECT id, name, price_cents, currency, square_catalog_object_id, square_variation_id
       FROM products WHERE handle = ?1 LIMIT 1`,
      // common "price" (dollars) with optional currency
      `SELECT id, name, price, currency, square_catalog_object_id, square_variation_id
       FROM products WHERE id = ?1 LIMIT 1`,
      `SELECT id, name, price, currency, square_catalog_object_id, square_variation_id
       FROM products WHERE slug = ?1 LIMIT 1`,
      `SELECT id, name, price, currency, square_catalog_object_id, square_variation_id
       FROM products WHERE handle = ?1 LIMIT 1`,
      // alternate column names
      `SELECT id, title as name, price_cents, currency, square_id as square_catalog_object_id
       FROM products WHERE id = ?1 LIMIT 1`,
      `SELECT id, title as name, price_cents, currency, square_id as square_catalog_object_id
       FROM products WHERE slug = ?1 LIMIT 1`,
    ];

    for (const q of queries) {
      try {
        const row = (await db.prepare(q).bind(normalizedKey).first()) as Record<string, unknown> | null;
        if (!row) continue;

        const name = pickString(row, ["name", "title"]) || normalizedKey;
        const currency = pickString(row, ["currency"]) || defaultCurrency;
        const amountCents =
          pickCents(row, ["price_cents", "amount_cents"]) ?? pickCents(row, ["price", "amount"]) ?? null;

        const squareCatalogObjectId =
          pickString(row, ["square_catalog_object_id", "square_variation_id", "square_id"]) || undefined;

        if (!amountCents || amountCents <= 0) continue;

        return { id: normalizedKey, name, amountCents, currency, squareCatalogObjectId };
      } catch (err) {
        // Schema mismatch is expected during rollout; do not fail checkout entirely.
        console.log("[products] D1 lookup failed (falling back)", { message: (err as any)?.message || String(err) });
        break;
      }
    }
  }

  const fallback = getFallbackCatalogItemByKey(normalizedKey);
  if (!fallback) return null;
  return {
    ...fallback,
    currency: fallback.currency || defaultCurrency,
  };
}

