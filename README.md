## Pelican Peptides (Cloudflare Pages)

This project is deployed as a **Cloudflare Pages** site (static HTML + **Pages Functions**).

## Square checkout (hosted checkout link)

This repo includes a minimal Square integration that runs in the **Workers runtime** (edge-safe, `fetch` only):

- **Endpoint**: `POST /api/square/checkout`
- **What it does**: creates a Square **payment link** using your Square credentials and returns `{ url }`.
- **Frontend behavior**: `index.html` redirects to the returned URL when `PAYMENT_PROVIDER = "square"`.

### Configure Square secrets (Cloudflare)

Set these on your Pages project (do **not** hardcode them in code):

- `SQUARE_ACCESS_TOKEN` (secret)
- `SQUARE_LOCATION_ID` (secret)
- `SQUARE_ENVIRONMENT` (`sandbox` or `production`)

Using Wrangler:

```bash
npx wrangler pages secret put SQUARE_ACCESS_TOKEN
npx wrangler pages secret put SQUARE_LOCATION_ID
npx wrangler pages secret put SQUARE_ENVIRONMENT
```

Optional:

- `SQUARE_API_VERSION` (Square API version header; if unset, it’s omitted)
- `SQUARE_DEFAULT_CURRENCY` (defaults to `USD`)

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

### Return page

After payment, Square redirects back to:

- `/square/return`

Note: this is a landing page only. If you need “paid order confirmation,” add a webhook handler or query Square Orders/Payments server-side.

## Security note (important)

The server uses a minimal in-code catalog (`functions/_lib/catalog.js`) to prevent client-side price tampering.
In a production setup, this should come from your authoritative store (for example **D1**) instead of code.

