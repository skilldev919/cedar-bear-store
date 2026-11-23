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
- `data/offers.json` — offers: copy, hero image, products + bundle quantities, % or fixed discount, active/inactive, start/expiry, featured. Also editable in **Admin → Offer Configuration**, where **Duplicate as new variation** creates further offer variations from the same landing-page template (PROMO-03; new variations start inactive).
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
- **Admin**: HMAC-signed stateless session cookie (HttpOnly, SameSite=Strict, 8 h), 5-failure / 15-min lockout shared across instances,
  JSON-only POSTs, CSP + security headers, CSV formula-injection guard.

## Continuous deployment

The Vercel project `cedar-bear-store` is connected to this GitHub repository: every push to `main`
builds and promotes a production deployment to https://cedar-bear-store.vercel.app automatically
(GitHub shows a "Vercel" status check on each commit); pushes to other branches create preview deployments.

## Deploying to Vercel

The repo is Vercel-ready (`vercel.json`, `api/index.js`): `public/` is served from the CDN and every
`/api/*` call runs as one serverless function. Set these environment variables in the Vercel project:

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | yes | Admin portal password |
| `SESSION_SECRET` | recommended | Long random string used to sign admin session cookies |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) | recommended | Durable storage for orders, events, offer edits and the admin credential |
| `APP_ENV` | optional | `test` (default). Any other value (e.g. `production`) uses a separate storage key space, keeping test and production data apart |
| `STORE_PREFIX` | optional | Explicit storage key prefix (Preview deployments use `cedarbear:ci-test:` so they never touch live data) |

With Redis, writes are atomic and safe across concurrent serverless instances: order numbers come from `INCR`, double-submits are blocked with `SET NX` idempotency keys, each order is its own key, events are appended to a list, and the admin login lockout counter is shared. Data stored in the earlier single-key format is migrated automatically on first use.

Without Redis, data lives in the function's temporary `/tmp` storage: it works for a live walkthrough
but is lost whenever Vercel recycles the instance. Add **Upstash for Redis** from the Vercel Marketplace
(Project → Storage), connect it to the project and redeploy — the app picks up the variables automatically.

## Customer accounts

- The homepage (and About / Privacy / Terms) is public. Shop, product, offer, cart, checkout and order pages require a customer account — enforced in the browser **and** on the server (cart pricing, orders and confirmations return 401 without a login).
- `/register` and `/login` (Register / Log In buttons top-right). Passwords: 8+ characters with a letter and a number, stored as per-user salted scrypt hashes; sessions are HMAC-signed HttpOnly cookies (30 days, signed with `SESSION_SECRET`); repeated wrong passwords are locked out for 15 minutes.
- Visitors sent to the login page (e.g. from a TikTok campaign link) return to the page they wanted afterwards; campaign attribution is kept.
- Checkout pre-fills the account name/email and orders are linked to the account. Admins see registered customers under **Admin → Customers**.

## Look & feel

- Calm, static design: an original morning-lake illustration (`public/images/bg-fresh-lake.svg`) softened behind frosted-glass cards and header.
- Launch intro (`public/js/intro.js`): on the first visit of a browser session, a spiral-shaped hole opens in the centre of a green Cedar Bear cover, rotating and expanding for ~3 s until the page is fully shown. Click or press any key to skip.
- Page navigation is instant with no transition effects; only quiet hover feedback on cards and buttons.
- The Register / Log In pages are animated: card entrance with a rotating glowing border, fields that slide in, floating labels, a sliding tab indicator, live password-strength meter, a shake on errors and a self-drawing success check.

## Known limitations (Phase 1)

- JSON-file storage, single process — swap for a database before production.
- No reviews or testimonials are shown because none were supplied (sections appear automatically once added to the data files).
- “Botanicals pictured” lists herbs visible in the product imagery — replace with the approved ingredient list.
- No live payments, Stripe, supplier integration or email (out of scope per SOW §9).
