import { html, json, text, withCors } from "./lib/http";
import { isNonEmptyString, parsePositiveInt } from "./lib/validation";
import { createSquarePaymentLink, listSquareLocations } from "./lib/square";
import { getProductByKey } from "./lib/products";

type Env = {
  // Existing bindings (from your Worker settings)
  DB?: any;
  R2_ASSETS?: R2Bucket;
  SITE_ORIGIN?: string;

  // Square
  SQUARE_ACCESS_TOKEN?: string;
  SQUARE_LOCATION_ID?: string;
  SQUARE_ENVIRONMENT?: string;
  SQUARE_API_VERSION?: string;
  SQUARE_DEFAULT_CURRENCY?: string;
};

function contentTypeForKey(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

async function serveFromR2(request: Request, env: Env) {
  if (!env.R2_ASSETS) return text("R2_ASSETS binding not configured", { status: 500 });

  const url = new URL(request.url);
  const path = decodeURIComponent(url.pathname);

  // Prevent path traversal
  if (path.includes("..")) return text("Bad path", { status: 400 });

  let key = path.replace(/^\/+/, "");
  if (key === "") key = "index.html";

  const tryKeys: string[] = [];
  if (key.endsWith("/")) {
    tryKeys.push(key + "index.html");
  } else {
    tryKeys.push(key);
    // SPA-ish routes: /products -> /products/index.html
    const last = key.split("/").pop() || "";
    if (!last.includes(".")) tryKeys.push(key + "/index.html");
  }

  for (const k of tryKeys) {
    const obj = await env.R2_ASSETS.get(k);
    if (!obj) continue;

    const headers = new Headers();
    headers.set("Content-Type", contentTypeForKey(k));
    headers.set("ETag", obj.httpEtag);
    // Safe defaults: cache static assets longer; keep HTML shorter.
    if (k.endsWith(".html")) headers.set("Cache-Control", "public, max-age=60");
    else headers.set("Cache-Control", "public, max-age=86400, immutable");

    return new Response(obj.body, { status: 200, headers });
  }

  return text("Not found", { status: 404 });
}

function returnPage() {
  // Lightweight return page rendered by the Worker (no dependency on R2 content).
  return html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Checkout Return</title>
    <style>
      :root { --bg:#f8f9fa; --card:#fff; --border:#e9ecef; --text:#0A1F44; --muted:#6C757D; }
      body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:grid;place-items:center;padding:24px}
      .card{width:min(720px,100%);background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px}
      h1{margin:0 0 8px;font-size:1.35rem}
      p{margin:0 0 12px;color:var(--muted);line-height:1.6}
      a{display:inline-block;margin-top:8px;text-decoration:none;font-weight:800}
    </style>
  </head>
  <body>
    <main class="card" role="main">
      <h1>You're back from checkout</h1>
      <p>This page confirms the redirect from Square. If you need to verify payment status, add a webhook or server-side payment lookup.</p>
      <a href="/">Back to site</a>
    </main>
  </body>
</html>`);
}

async function handleSquareCheckout(request: Request, env: Env) {
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }), request);
  }

  // Debug endpoint: list locations (safe: no secrets returned)
  if (request.method === "GET" && new URL(request.url).pathname === "/api/square/locations") {
    try {
      const data = await listSquareLocations({ env });
      return withCors(json({ ok: true, data }, { status: 200 }), request);
    } catch (err: any) {
      console.log("[square] locations error", { message: err?.message || String(err) });
      return withCors(json({ ok: false, error: err?.message || "Failed to list locations" }, { status: 500 }), request);
    }
  }

  // Convenience GET: redirect directly to hosted checkout
  if (request.method === "GET") {
    const u = new URL(request.url);
    const id = u.searchParams.get("id") || u.searchParams.get("slug") || u.searchParams.get("product");
    const quantity = parsePositiveInt(u.searchParams.get("quantity") || "1", { min: 1, max: 99 });

    if (!id) {
      return withCors(
        json(
          {
            ok: true,
            usage: {
              post: { path: "/api/square/checkout", body: { items: [{ id: "tirz-10", quantity: 1 }] } },
              get: { example: "/api/square/checkout?id=tirz-10&quantity=1" },
            },
          },
          { status: 200 },
        ),
        request,
      );
    }

    if (!quantity) return withCors(json({ ok: false, error: "Invalid quantity" }, { status: 400 }), request);

    try {
      const product = await getProductByKey({
        key: id,
        db: env.DB,
        defaultCurrency: env.SQUARE_DEFAULT_CURRENCY || "USD",
      });
      if (!product) return withCors(json({ ok: false, error: `Unknown item id: ${id}` }, { status: 400 }), request);

      const result = await createSquarePaymentLink({
        request,
        env,
        items: [{ item: product, quantity }],
      });

      return Response.redirect(result.url, 303);
    } catch (err: any) {
      console.log("[square] checkout error", { message: err?.message || String(err) });
      return withCors(json({ ok: false, error: err?.message || "Checkout failed" }, { status: 500 }), request);
    }
  }

  if (request.method !== "POST") {
    return withCors(json({ ok: false, error: "Method not allowed" }, { status: 405 }), request);
  }

  const ct = request.headers.get("Content-Type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return withCors(json({ ok: false, error: "Expected application/json" }, { status: 415 }), request);
  }

  const body = await request.json().catch(() => null) as any;
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || items.length === 0) return withCors(json({ ok: false, error: "No items provided" }, { status: 400 }), request);

  try {
    // Optional: where Square redirects after payment. Only allow same-origin relative paths.
    const origin =
      typeof env.SITE_ORIGIN === "string" && env.SITE_ORIGIN.startsWith("http")
        ? env.SITE_ORIGIN
        : new URL(request.url).origin;
    let redirectUrl: string | undefined = undefined;
    if (typeof body?.return_path === "string" && body.return_path.startsWith("/")) {
      redirectUrl = new URL(body.return_path, origin).toString();
    } else if (typeof body?.return_url === "string") {
      try {
        const u = new URL(body.return_url);
        if (u.origin === new URL(origin).origin) redirectUrl = u.toString();
      } catch {
        // ignore
      }
    }

    const resolved: { item: any; quantity: number }[] = [];

    for (const it of items) {
      const id = it?.id || it?.slug || it?.productId || it?.product || it?.handle;
      const quantity = parsePositiveInt(it?.quantity, { min: 1, max: 99 });
      if (!isNonEmptyString(id) || !quantity) {
        return withCors(json({ ok: false, error: "Invalid items payload" }, { status: 400 }), request);
      }

      const product = await getProductByKey({
        key: id,
        db: env.DB,
        defaultCurrency: env.SQUARE_DEFAULT_CURRENCY || "USD",
      });
      if (!product) return withCors(json({ ok: false, error: `Unknown item id: ${id}` }, { status: 400 }), request);
      resolved.push({ item: product, quantity });
    }

    const result = await createSquarePaymentLink({ request, env, items: resolved, redirectUrl });

    return withCors(
      json(
        {
          ok: true,
          url: result.url,
          paymentLinkId: result.paymentLinkId,
          orderId: result.orderId,
        },
        { status: 200 },
      ),
      request,
    );
  } catch (err: any) {
    console.log("[square] checkout error", { message: err?.message || String(err) });
    return withCors(json({ ok: false, error: err?.message || "Checkout failed" }, { status: 500 }), request);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Square endpoints
    if (url.pathname === "/api/square/checkout" || url.pathname === "/api/square/locations") {
      return handleSquareCheckout(request, env);
    }

    if (url.pathname === "/square/return") {
      return returnPage();
    }

    // Default: serve the website from R2
    if (request.method === "GET" || request.method === "HEAD") {
      return serveFromR2(request, env);
    }

    return text("Not found", { status: 404 });
  },
};

