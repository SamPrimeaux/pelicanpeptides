import { getCatalogItem } from "../../_lib/catalog.js";

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function withCors(resp, request) {
  const origin = request.headers.get("Origin");
  // Same-origin requests don't need CORS headers, but adding them helps local tooling.
  if (!origin) return resp;
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

function requireEnv(env, key) {
  const v = env?.[key];
  if (!v || typeof v !== "string") throw new Error(`Missing ${key}`);
  return v;
}

function squareBaseUrl(env) {
  const name = String(env?.SQUARE_ENVIRONMENT || "production").toLowerCase();
  return name === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}

function squareHeaders(env) {
  const h = new Headers();
  h.set("Authorization", `Bearer ${requireEnv(env, "SQUARE_ACCESS_TOKEN")}`);
  h.set("Content-Type", "application/json");
  const version = env?.SQUARE_API_VERSION;
  if (version && typeof version === "string") h.set("Square-Version", version);
  return h;
}

function parsePositiveInt(n, { min = 1, max = 999 } = {}) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < min || v > max) return null;
  return v;
}

async function createPaymentLink({ env, request, items }) {
  const locationId = requireEnv(env, "SQUARE_LOCATION_ID");

  const normalized = [];
  for (const it of items || []) {
    const id = it?.id;
    const quantity = parsePositiveInt(it?.quantity, { min: 1, max: 99 });
    if (!id || typeof id !== "string" || !quantity) {
      throw new Error("Invalid items payload (expected { id, quantity }).");
    }
    const catalogItem = getCatalogItem(id);
    if (!catalogItem) {
      throw new Error(`Unknown item id: ${id}`);
    }
    normalized.push({ id, quantity, catalogItem });
  }

  if (normalized.length === 0) throw new Error("No items provided.");

  const currency =
    normalized[0].catalogItem.currency ||
    (typeof env?.SQUARE_DEFAULT_CURRENCY === "string" ? env.SQUARE_DEFAULT_CURRENCY : "USD");

  const lineItems = normalized.map(({ catalogItem, quantity }) => ({
    name: catalogItem.name,
    quantity: String(quantity),
    base_price_money: {
      amount: catalogItem.amountCents,
      currency,
    },
  }));

  const idempotencyKey = crypto.randomUUID();
  const origin = new URL(request.url).origin;

  const body = {
    idempotency_key: idempotencyKey,
    order: {
      location_id: locationId,
      line_items: lineItems,
    },
    checkout_options: {
      // Static success/return page hosted by Pages (we add it in this branch).
      redirect_url: new URL("/square/return", origin).toString(),
    },
  };

  const url = `${squareBaseUrl(env)}/v2/online-checkout/payment-links`;

  const totalCents = normalized.reduce((sum, x) => sum + x.catalogItem.amountCents * x.quantity, 0);
  console.log("[square] creating payment link", {
    itemCount: normalized.length,
    totalCents,
    environment: String(env?.SQUARE_ENVIRONMENT || "production"),
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: squareHeaders(env),
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    console.log("[square] create payment link failed", {
      status: resp.status,
      errors: data?.errors?.map((e) => ({ code: e?.code, category: e?.category })) || null,
    });
    return {
      ok: false,
      status: resp.status,
      data,
    };
  }

  return {
    ok: true,
    status: 200,
    data,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return withCors(
      new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Max-Age": "86400",
        },
      }),
      request,
    );
  }

  try {
    // GET convenience: /api/square/checkout?id=tirz-10&quantity=1 -> redirects to Square checkout
    if (request.method === "GET") {
      const u = new URL(request.url);
      const id = u.searchParams.get("id");
      const quantity = parsePositiveInt(u.searchParams.get("quantity") || "1", { min: 1, max: 99 });

      if (!id) {
        const help = json(
          {
            ok: true,
            usage: {
              post: {
                path: "/api/square/checkout",
                body: { items: [{ id: "tirz-10", quantity: 1 }] },
              },
              get: {
                example: "/api/square/checkout?id=tirz-10&quantity=1",
              },
            },
          },
          { status: 200 },
        );
        return withCors(help, request);
      }

      if (!quantity) {
        return withCors(json({ ok: false, error: "Invalid quantity" }, { status: 400 }), request);
      }

      const result = await createPaymentLink({ env, request, items: [{ id, quantity }] });
      if (!result.ok) {
        return withCors(
          json(
            {
              ok: false,
              error: "Square payment link creation failed.",
              square: result.data,
            },
            { status: result.status || 502 },
          ),
          request,
        );
      }

      const checkoutUrl = result.data?.payment_link?.url;
      if (!checkoutUrl) {
        return withCors(json({ ok: false, error: "Square did not return a checkout URL." }, { status: 502 }), request);
      }

      return Response.redirect(checkoutUrl, 303);
    }

    if (request.method !== "POST") {
      return withCors(json({ ok: false, error: "Method not allowed" }, { status: 405 }), request);
    }

    const ct = request.headers.get("Content-Type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      return withCors(json({ ok: false, error: "Expected application/json" }, { status: 415 }), request);
    }

    const body = await request.json().catch(() => null);
    const items = body?.items;

    const result = await createPaymentLink({ env, request, items });
    if (!result.ok) {
      return withCors(
        json(
          {
            ok: false,
            error: "Square payment link creation failed.",
            square: result.data,
          },
          { status: result.status || 502 },
        ),
        request,
      );
    }

    const checkoutUrl = result.data?.payment_link?.url;
    const paymentLinkId = result.data?.payment_link?.id;
    const orderId = result.data?.payment_link?.order_id || result.data?.order?.id;

    if (!checkoutUrl) {
      return withCors(json({ ok: false, error: "Square did not return a checkout URL." }, { status: 502 }), request);
    }

    return withCors(
      json(
        {
          ok: true,
          url: checkoutUrl,
          paymentLinkId,
          orderId,
        },
        { status: 200 },
      ),
      request,
    );
  } catch (err) {
    console.log("[square] checkout handler error", {
      message: err?.message || String(err),
    });
    return withCors(json({ ok: false, error: err?.message || "Unexpected error" }, { status: 500 }), request);
  }
}

