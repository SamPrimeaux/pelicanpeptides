import type { CatalogItem } from "./catalog";

export type SquareEnv = {
  SQUARE_ACCESS_TOKEN?: string;
  SQUARE_LOCATION_ID?: string;
  SQUARE_ENVIRONMENT?: string; // "sandbox" | "production"
  SQUARE_API_VERSION?: string;
  SQUARE_DEFAULT_CURRENCY?: string;
  SITE_ORIGIN?: string;
};

function requireEnv(env: SquareEnv, key: keyof SquareEnv): string {
  const v = env[key];
  if (!v || typeof v !== "string" || v.trim() === "") throw new Error(`Missing ${String(key)}`);
  return v;
}

export function squareBaseUrl(env: SquareEnv) {
  const name = String(env.SQUARE_ENVIRONMENT || "production").toLowerCase();
  return name === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}

export function squareHeaders(env: SquareEnv) {
  const h = new Headers();
  h.set("Authorization", `Bearer ${requireEnv(env, "SQUARE_ACCESS_TOKEN")}`);
  h.set("Content-Type", "application/json");
  if (env.SQUARE_API_VERSION && typeof env.SQUARE_API_VERSION === "string") {
    h.set("Square-Version", env.SQUARE_API_VERSION);
  }
  return h;
}

export type SquareLineItemInput = {
  item: CatalogItem;
  quantity: number;
};

export async function createSquarePaymentLink(opts: {
  request: Request;
  env: SquareEnv;
  items: SquareLineItemInput[];
  redirectUrl?: string;
}): Promise<{ url: string; paymentLinkId?: string; orderId?: string; raw: unknown }> {
  const { request, env, items, redirectUrl } = opts;
  const locationId = requireEnv(env, "SQUARE_LOCATION_ID");

  if (!items.length) throw new Error("No items provided.");

  const defaultCurrency = typeof env.SQUARE_DEFAULT_CURRENCY === "string" ? env.SQUARE_DEFAULT_CURRENCY : "USD";
  const currency = items[0].item.currency || defaultCurrency;

  const lineItems = items.map(({ item, quantity }) => {
    if (item.squareCatalogObjectId) {
      return {
        quantity: String(quantity),
        catalog_object_id: item.squareCatalogObjectId,
      };
    }

    return {
      name: item.name,
      quantity: String(quantity),
      base_price_money: {
        amount: item.amountCents,
        currency,
      },
    };
  });

  const idempotencyKey = crypto.randomUUID();
  const origin =
    typeof env.SITE_ORIGIN === "string" && env.SITE_ORIGIN.startsWith("http")
      ? env.SITE_ORIGIN
      : new URL(request.url).origin;

  const body = {
    idempotency_key: idempotencyKey,
    order: {
      location_id: locationId,
      line_items: lineItems,
    },
    checkout_options: {
      redirect_url: redirectUrl || new URL("/square/return", origin).toString(),
    },
  };

  const endpoint = `${squareBaseUrl(env)}/v2/online-checkout/payment-links`;

  const totalCents = items.reduce((sum, x) => sum + x.item.amountCents * x.quantity, 0);
  console.log("[square] create payment link", {
    itemCount: items.length,
    totalCents,
    environment: String(env.SQUARE_ENVIRONMENT || "production"),
  });

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: squareHeaders(env),
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    console.log("[square] create payment link failed", {
      status: resp.status,
      errors: (data as any)?.errors?.map((e: any) => ({ code: e?.code, category: e?.category })) || null,
    });
    throw new Error(`Square error (${resp.status}) creating payment link`);
  }

  const url = (data as any)?.payment_link?.url;
  if (!url || typeof url !== "string") throw new Error("Square did not return a checkout URL.");

  return {
    url,
    paymentLinkId: (data as any)?.payment_link?.id,
    orderId: (data as any)?.payment_link?.order_id || (data as any)?.order?.id,
    raw: data,
  };
}

export async function listSquareLocations(opts: { env: SquareEnv }) {
  const { env } = opts;
  const endpoint = `${squareBaseUrl(env)}/v2/locations`;
  const resp = await fetch(endpoint, { headers: squareHeaders(env) });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(`Square error (${resp.status}) listing locations`);
  return data;
}

