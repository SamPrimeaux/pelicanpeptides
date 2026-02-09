/**
 * Minimal server-side product catalog used to prevent client-side price tampering.
 *
 * Preferred: read products from D1 (see `getProductById()`), but this fallback keeps
 * checkout working even if DB schema differs or is unavailable.
 */
export type CatalogItem = {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  squareCatalogObjectId?: string; // optional Square item variation id
};

const USD = "USD";

export const FALLBACK_CATALOG: Record<string, CatalogItem> = {
  // Metabolic
  "tirz-10": { id: "tirz-10", name: "Tirzepatide 10mg", amountCents: 12000, currency: USD },
  "tirz-20": { id: "tirz-20", name: "Tirzepatide 20mg", amountCents: 14000, currency: USD },
  "tirz-30": { id: "tirz-30", name: "Tirzepatide 30mg", amountCents: 16000, currency: USD },
  "reta-20": { id: "reta-20", name: "Retatrutide 20mg", amountCents: 14000, currency: USD },
  "reta-30": { id: "reta-30", name: "Retatrutide 30mg", amountCents: 16000, currency: USD },
  "cagri-5": { id: "cagri-5", name: "Cagrilintide 5mg", amountCents: 5000, currency: USD },
  "glp-2": { id: "glp-2", name: "GLP-2", amountCents: 5500, currency: USD },
  "glp-3": { id: "glp-3", name: "GLP-3 10mg", amountCents: 6000, currency: USD },

  // Performance
  "ipa-5": { id: "ipa-5", name: "Ipamorelin 5mg", amountCents: 3000, currency: USD },
  "serm-10": { id: "serm-10", name: "Sermorelin 10mg", amountCents: 5000, currency: USD },
  "tesa-10": { id: "tesa-10", name: "Tesamorelin 10mg", amountCents: 6500, currency: USD },

  // Cognitive / Support
  "nad-500": { id: "nad-500", name: "NAD+ 500mg", amountCents: 6000, currency: USD },
  "ghk-100": { id: "ghk-100", name: "GHK-CU 100mg", amountCents: 5000, currency: USD },
  "b12-10ml": { id: "b12-10ml", name: "B-12 10ml", amountCents: 5000, currency: USD },
  "lipo-c-10ml": { id: "lipo-c-10ml", name: "Lipo-C 10ml", amountCents: 8000, currency: USD },
  "superhuman-10ml": { id: "superhuman-10ml", name: "Superhuman Blend 10ml", amountCents: 9000, currency: USD },
  "glow-70mg": { id: "glow-70mg", name: "GLOW 70mg", amountCents: 9000, currency: USD },

  // Recovery
  "bpc-10": { id: "bpc-10", name: "BPC-157 10mg", amountCents: 4500, currency: USD },
  "tb-10": { id: "tb-10", name: "TB-500 10mg", amountCents: 4500, currency: USD },
  "bpc-tb": { id: "bpc-tb", name: "BPC-157 / TB-500 10mg / 10mg", amountCents: 8000, currency: USD },

  // Supplies
  "bac-3ml": { id: "bac-3ml", name: "Bac Water 3ml", amountCents: 600, currency: USD },
};

export function getFallbackCatalogItem(id: string): CatalogItem | null {
  return FALLBACK_CATALOG[id] || null;
}

