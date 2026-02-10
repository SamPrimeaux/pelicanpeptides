## Pelican Peptides (Cloudflare Worker + R2)

Your production setup (per routes like `pelicanpeptides.com/*`) is a **Cloudflare Worker** that serves the site from **R2** and exposes `/api/*` endpoints.

## Square checkout (hosted checkout link)

This repo includes a minimal Square integration that runs in the **Workers runtime** (edge-safe, `fetch` only) using **Square Payment Links** (hosted checkout):

- **Endpoint**: `POST /api/square/checkout`
- **What it does**: creates a Square **payment link** using your Square credentials and returns `{ url }`.
- **Frontend behavior**: `index.html` redirects to the returned URL when `PAYMENT_PROVIDER = "square"`.

### Configure Square secrets (Cloudflare)

Set these on your **Worker** (do **not** hardcode them in code):

- `SQUARE_ACCESS_TOKEN` (secret)
- `SQUARE_LOCATION_ID` (secret)
- `SQUARE_ENVIRONMENT` (`sandbox` or `production`)

Using Wrangler:

```bash
npx wrangler secret put SQUARE_ACCESS_TOKEN
npx wrangler secret put SQUARE_LOCATION_ID
# for plaintext vars, set in dashboard or in `wrangler.worker.toml`:
# SQUARE_ENVIRONMENT=sandbox|production
```

Optional:

- `SQUARE_API_VERSION` (Square API version header; if unset, it’s omitted)
- `SQUARE_DEFAULT_CURRENCY` (defaults to `USD`)
- `SITE_ORIGIN` (already present in your Worker vars; used for Square redirect URL)

### API usage

`POST /api/square/checkout`

Body:

```json
{
  "items": [{ "id": "tirz-10", "quantity": 1 }]
}
```

Response:

```json
{ "ok": true, "url": "https://square.link/...", "paymentLinkId": "...", "orderId": "..." }
```

Convenience redirect:

- `GET /api/square/checkout?id=tirz-10&quantity=1` (responds with a `303` redirect to Square checkout)

### Debugging

- `GET /api/square/locations` lists Square locations (useful for confirming `SQUARE_ACCESS_TOKEN` works)

### Return page

After payment, Square redirects back to:

- `/square/return`

Note: this is a landing page only. If you need “paid order confirmation,” add a webhook handler or query Square Orders/Payments server-side.

## Security note (important)

The Worker attempts to read product pricing from **D1** (`products` table, if present). If that lookup fails (schema mismatch), it falls back to an in-code catalog in `src/lib/catalog.ts`.

## Deploy (Worker)

If you deploy from this repo, use the dedicated Worker config:

```bash
npx wrangler deploy --config wrangler.worker.toml
```

