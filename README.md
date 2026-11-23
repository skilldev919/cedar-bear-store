# Cedar Bear — Retail Storefront + Promotional Funnel (Phase 1 demo)

Responsive storefront, campaign landing page, one shared cart, simulated checkout and a protected
operations portal, built to the *Retail Sales Channel Technical SOW v1*. **No real payments are taken
and nothing is dispatched to a supplier.**

## Run

Requires Node.js 18+ (no `npm install` needed — zero dependencies).

```bash
npm start                 # or: node server/index.js
# → http://localhost:3000        storefront
# → http://localhost:3000/admin  operations portal
```

On first start a random admin password is printed and saved to `data/runtime/INITIAL_ADMIN_PASSWORD.txt`.
Change it under **Admin → Access & Security**, or set `ADMIN_PASSWORD` in the environment.

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` to expose on the network) |
| `ADMIN_PASSWORD` | generated | Admin password (overrides the stored one at each start) |
| `SECURE_COOKIES` | off | Set `1` when served over HTTPS |

Tests: `npm test` (acceptance tests AT-01…AT-09 against a real server with isolated data).

## Pages

| URL | Design | Notes |
|---|---|---|
| `/` | 1 – Home | Hero, 5 function cards, featured products, campaign banner |
| `/shop` | 2 – Shop | Search, category chips (Nervous System / Endocrine / Bundles), sort |
| `/offer/calm-and-balance` | 3 – Promotional offer | Shareable campaign URL; `?utm_source=tiktok` recorded |
| `/product/:slug` | 4 – Product | Gallery + zoom, variants, qty, Duo-pack bundle; `?offer=slug` = campaign price (SALE-02) |
| `/cart` | 5 – Shared cart | Catalog + offer items in one cart, free-shipping meter |
| `/checkout` | 6 – Checkout | Validated form, shipping method, demo payment, idempotent submit |
| `/order/confirmation/:id` | 7 – Confirmation | Visible only in the browser that placed the order (secret token) |
| `/admin/operations` | 8 – Admin | KPIs, orders table, details, TRACK-01 timeline, CSV export |
| `/admin/orders`, `/admin/events`, `/admin/offers`, `/admin/security` | — | Full order list, event log & funnel, offer editor, password/sessions/sample data |

## Configuration (owner-editable, no code changes)

- `data/products.json` — products, variants, prices (**integer cents; current prices are placeholders pending owner approval**), details, images.
- `data/offers.json` — offers: copy, products, % discount, active/inactive, start/expiry, featured. Also editable in **Admin → Offer Configuration**.
- `data/settings.json` — shipping methods, free-shipping threshold ($75, standard only), max quantity, auto-review rules.
- Product images: `public/images/products/`.

Runtime data (orders, events, admin credential) lives in `data/runtime/` — back it up, don't commit it.

## Architecture

```
server/
  app.js       routes, static files, security headers
  catalog.js   product catalog          offers.js   offer config + validity rules
  pricing.js   server-side pricing      orders.js   checkout, order & payment states
  payment.js   payment-provider adapter (Simulated only; Stripe slots in here later)
  events.js    campaign attribution/event log    auth.js  admin auth (scrypt, sessions, lockout)
  reports.js   dashboard KPIs, CSV export, sample data
public/js/     SPA: app.js (router), state.js (shared cart/session/tracking), pages/*
```

- **Pricing is server-authoritative**: the browser sends only product/variant/qty/offer IDs. Expired,
  inactive or non-matching offers are re-priced at regular price; checkout refuses to create an order
  if the total changed since the customer last saw it.
- **States**: order `draft → awaiting-payment → test-completed | pending-review | canceled`;
  payment `unpaid → simulated`. `verified-paid` is reserved for a future verified webhook.
- **Idempotency**: each checkout carries a key; double submits return the same `TEST-YYYY-NNNNN` order.
- **Admin**: HttpOnly SameSite=Strict session cookie, 8 h lifetime, 5-failure / 15-min lockout,
  JSON-only POSTs, CSP + security headers, CSV formula-injection guard.

## Deploying to Vercel

The repo is Vercel-ready (`vercel.json`, `api/index.js`): `public/` is served from the CDN and every
`/api/*` call runs as one serverless function. Set these environment variables in the Vercel project:

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | yes | Admin portal password |
| `SESSION_SECRET` | recommended | Long random string used to sign admin session cookies |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) | recommended | Durable storage for orders, events, offer edits and the admin credential |

Without Redis, data lives in the function's temporary `/tmp` storage: it works for a live walkthrough
but is lost whenever Vercel recycles the instance. Add **Upstash for Redis** from the Vercel Marketplace
(Project → Storage), connect it to the project and redeploy — the app picks up the variables automatically.

## Known limitations (Phase 1)

- JSON-file storage, single process — swap for a database before production.
- No reviews or testimonials are shown because none were supplied (sections appear automatically once added to the data files).
- “Botanicals pictured” lists herbs visible in the product imagery — replace with the approved ingredient list.
- No live payments, Stripe, supplier integration or email (out of scope per SOW §9).
