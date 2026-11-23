'use strict';
// End-to-end acceptance tests against a real server instance with an isolated data directory.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server/app');

const ROOT = path.join(__dirname, '..');
let base, app, tmp;
const PW = 'test-admin-password-123';

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cedarbear-'));
  // Copy config so offer edits in tests never touch the real data folder.
  for (const f of ['products.json', 'offers.json', 'settings.json']) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(tmp, f));
  app = createApp({ root: ROOT, dataDir: tmp, runtimeDir: path.join(tmp, 'runtime'), adminPassword: PW });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => { app.server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(p, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* csv / html */ }
  return { status: res.status, json, text, headers: res.headers };
}
const checkout = (items, extra = {}) => ({
  items, shippingMethod: 'standard', paymentMethod: 'demo-card', idempotencyKey: `key-${Math.random().toString(36).slice(2, 12)}`,
  customer: { name: 'Jamie Sample', email: 'jamie@example.com' },
  shipping: { address1: '123 Cedar Lane', address2: '', city: 'Rivermere', state: 'OR', zip: '97035' },
  sessionId: 'session-test-0001', attribution: { source: 'direct' }, ...extra,
});
async function login() {
  const r = await call('/api/admin/login', { method: 'POST', body: { password: PW } });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

test('AT-01: storefront pages and catalog are served', async () => {
  for (const p of ['/', '/shop', '/product/kava-calm', '/cart', '/checkout', '/offer/calm-and-balance', '/admin/operations']) {
    const r = await call(p);
    assert.equal(r.status, 200, p);
    assert.match(r.text, /<main id="main"/);
  }
  const { json } = await call('/api/products');
  assert.deepEqual(json.products.map((p) => p.id), ['kava-calm', 'chamomile-relaxer', 'adrenal-balance']);
  assert.equal((await call('/api/products/nope')).status, 404);
});

test('AT-04: server-side totals, discounts and free-shipping rules', async () => {
  // One Kava Calm: 34.90 + 5.95 shipping
  let q = (await call('/api/cart/quote', { method: 'POST', body: { items: [{ productId: 'kava-calm', variantId: '60ml', qty: 1 }] } })).json;
  assert.equal(q.totals.subtotalCents, 3490);
  assert.equal(q.totals.shippingCents, 595);
  assert.equal(q.totals.totalCents, 4085);
  // Offer trio: 20% off each; merchandise 77.36 >= 75 → free standard shipping
  q = (await call('/api/cart/quote', { method: 'POST', body: { items: [
    { productId: 'kava-calm', variantId: '60ml', qty: 1, offerId: 'calm-balance-tiktok' },
    { productId: 'chamomile-relaxer', variantId: '60ml', qty: 1, offerId: 'calm-balance-tiktok' },
    { productId: 'adrenal-balance', variantId: '60ml', qty: 1, offerId: 'calm-balance-tiktok' },
  ] } })).json;
  assert.equal(q.totals.subtotalCents, 3490 + 2990 + 3290);
  assert.equal(q.totals.discountCents, 698 + 598 + 658);
  assert.equal(q.totals.shippingCents, 0);
  assert.equal(q.shipping.freeShippingApplied, true);
  // Expedited is never free
  q = (await call('/api/cart/quote', { method: 'POST', body: { items: [{ productId: 'kava-calm', variantId: 'duo', qty: 2 }], shippingMethod: 'expedited' } })).json;
  assert.equal(q.totals.shippingCents, 1295);
  assert.equal(q.totals.totalCents, 5990 * 2 + 1295);
  // Same product from catalog + offer = two separate lines in ONE cart (SALE-02)
  q = (await call('/api/cart/quote', { method: 'POST', body: { items: [
    { productId: 'kava-calm', variantId: '60ml', qty: 1 }, { productId: 'kava-calm', variantId: '60ml', qty: 1, offerId: 'calm-balance-tiktok' },
  ] } })).json;
  assert.equal(q.lines.length, 2);
  assert.deepEqual(q.lines.map((l) => l.source).sort(), ['catalog', 'offer']);
});

test('CART-02: invalid quantities are rejected; browser prices are ignored', async () => {
  for (const qty of [0, -1, 1.5, 21, '2']) {
    const r = await call('/api/cart/quote', { method: 'POST', body: { items: [{ productId: 'kava-calm', variantId: '60ml', qty }] } });
    assert.equal(r.status, 400, `qty ${qty}`);
  }
  const q = (await call('/api/cart/quote', { method: 'POST', body: { items: [{ productId: 'kava-calm', variantId: '60ml', qty: 1, priceCents: 1, unitCents: 1 }] } })).json;
  assert.equal(q.totals.subtotalCents, 3490);
});

test('AT-05: inactive / unknown / non-covered offers grant no discount', async () => {
  const items = [
    { productId: 'kava-calm', variantId: '60ml', qty: 1, offerId: 'nightly-calm-duo' }, // inactive
    { productId: 'chamomile-relaxer', variantId: '60ml', qty: 1, offerId: 'does-not-exist' },
    { productId: 'adrenal-balance', variantId: 'duo', qty: 1, offerId: 'calm-balance-tiktok' }, // variant not in offer
  ];
  const q = (await call('/api/cart/quote', { method: 'POST', body: { items } })).json;
  assert.equal(q.totals.discountCents, 0);
  assert.equal(q.notices.length, 3);
  assert.ok(q.normalizedItems.every((i) => i.offerId === null));
  assert.equal((await call('/api/offers/nightly-calm')).status, 404);
  // Checkout with a stale offer line is refused with a fresh quote (no silent discount)
  const r = await call('/api/orders', { method: 'POST', body: checkout(items) });
  assert.equal(r.status, 409);
  assert.ok(r.json.quote);
});

test('AT-02 + AT-06: campaign offer → shared cart → exactly one marked test order', async () => {
  const offer = (await call('/api/offers/calm-and-balance')).json.offer;
  assert.equal(offer.state, 'active');
  const items = offer.items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty, offerId: offer.id }));
  items.push({ productId: 'kava-calm', variantId: '60ml', qty: 1 }); // plus a catalog item
  const body = checkout(items, { sessionId: 'session-test-0002', attribution: { source: 'tiktok' } });
  await call('/api/events', { method: 'POST', body: { type: 'landing_visit', sessionId: 'session-test-0002', source: 'tiktok', offerId: offer.id } });
  await call('/api/events', { method: 'POST', body: { type: 'checkout_start', sessionId: 'session-test-0002', source: 'tiktok' } });
  const [a, b] = await Promise.all([call('/api/orders', { method: 'POST', body }), call('/api/orders', { method: 'POST', body })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.json.orderId, b.json.orderId, 'double submit returns the same order');
  const o = a.json.order;
  assert.match(o.id, /^TEST-\d{4}-\d{5}$/);
  assert.equal(o.isTest, true);
  assert.equal(o.paymentStatus, 'simulated');
  assert.equal(o.orderStatus, 'test-completed');
  assert.equal(o.supplierDispatch, false);
  assert.equal(o.payment.capturedCents, 0);
  assert.equal(o.totals.totalCents, 3490 + 2792 + 2392 + 2632);
  assert.equal(app.orders.all().filter((x) => x.idempotencyKey === body.idempotencyKey).length, 1);
  // Confirmation needs the secret token
  assert.equal((await call(`/api/orders/${o.id}`)).status, 404);
  assert.equal((await call(`/api/orders/${o.id}?token=wrong`)).status, 404);
  assert.equal((await call(`/api/orders/${o.id}?token=${a.json.token}`)).status, 200);
  // Completion event recorded server-side with attribution
  const ev = app.events.forSession('session-test-0002').map((e) => e.type);
  assert.deepEqual(ev, ['landing_visit', 'checkout_start', 'simulated_completion']);
  assert.equal(app.orders.get(o.id).attribution.source, 'tiktok');
});

test('CHK-01: checkout input validation', async () => {
  const items = [{ productId: 'kava-calm', variantId: '60ml', qty: 1 }];
  const bad = [
    { customer: { name: '', email: 'a@b.co' } },
    { customer: { name: 'A', email: 'not-an-email' } },
    { shipping: { address1: 'x', city: 'y', state: 'ZZ', zip: '97035' } },
    { shipping: { address1: 'x', city: 'y', state: 'OR', zip: '123' } },
    { shippingMethod: 'teleport' },
    { paymentMethod: 'real-card' },
  ];
  for (const b of bad) assert.equal((await call('/api/orders', { method: 'POST', body: checkout(items, b) })).status, 400, JSON.stringify(b));
  assert.equal((await call('/api/orders', { method: 'POST', body: checkout([]) })).status, 400);
  assert.equal((await call('/api/orders', { method: 'POST', body: checkout(items, { expectedTotalCents: 1 }) })).status, 409);
  const big = await call('/api/orders', { method: 'POST', body: checkout([{ productId: 'adrenal-balance', variantId: '60ml', qty: 6 }]) });
  assert.equal(big.json.order.orderStatus, 'pending-review');
  // Clients cannot forge completion events
  assert.equal((await call('/api/events', { method: 'POST', body: { type: 'simulated_completion', sessionId: 'session-test-9' } })).status, 400);
});

test('AT-07: admin is protected; operators can view, update and export', async () => {
  for (const p of ['/api/admin/orders', '/api/admin/dashboard', '/api/admin/events', '/api/admin/orders.csv', '/api/admin/offers']) {
    assert.equal((await call(p)).status, 401, p);
  }
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { password: 'wrong' } })).status, 401);
  const cookie = await login();
  const { json } = await call('/api/admin/orders', { cookie });
  assert.ok(json.orders.length >= 2);
  assert.ok(json.orders.every((o) => !('token' in o)));
  const id = json.orders[0].id;
  const upd = await call(`/api/admin/orders/${id}`, { method: 'PATCH', body: { orderStatus: 'canceled' }, cookie });
  assert.equal(upd.json.order.orderStatus, 'canceled');
  assert.equal((await call(`/api/admin/orders/${id}`, { method: 'PATCH', body: { orderStatus: 'verified-paid' }, cookie })).status, 400);
  const csv = await call('/api/admin/orders.csv', { cookie });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.text, /order_id,created_at/);
  assert.match(csv.text, /TEST — DEMO ORDER/);
  const dash = (await call('/api/admin/dashboard', { cookie })).json.kpis;
  assert.equal(dash.totalOrders, json.orders.length);
  const detail = await call(`/api/admin/orders/${id}`, { cookie });
  assert.ok(Array.isArray(detail.json.events));
});

test('AT-08: offer configuration changes apply without code changes', async () => {
  const cookie = await login();
  let r = await call('/api/admin/offers/calm-balance-tiktok', { method: 'PUT', body: { discountValue: 30 }, cookie });
  assert.equal(r.status, 200);
  let q = (await call('/api/cart/quote', { method: 'POST', body: { items: [{ productId: 'kava-calm', variantId: '60ml', qty: 1, offerId: 'calm-balance-tiktok' }] } })).json;
  assert.equal(q.lines[0].unitCents, 2443);
  assert.equal((await call('/api/admin/offers/calm-balance-tiktok', { method: 'PUT', body: { discountValue: 95 }, cookie })).status, 400);
  r = await call('/api/admin/offers/calm-balance-tiktok', { method: 'PUT', body: { status: 'inactive' }, cookie });
  assert.equal(r.json.offer.state, 'inactive');
  assert.equal((await call('/api/offers/calm-and-balance')).status, 404);
  q = (await call('/api/cart/quote', { method: 'POST', body: { items: [{ productId: 'kava-calm', variantId: '60ml', qty: 1, offerId: 'calm-balance-tiktok' }] } })).json;
  assert.equal(q.totals.discountCents, 0);
  // Expired offers are also rejected
  await call('/api/admin/offers/calm-balance-tiktok', { method: 'PUT', body: { status: 'active', startsAt: '2020-01-01T00:00:00Z', expiresAt: '2020-02-01T00:00:00Z' }, cookie });
  assert.equal((await call('/api/offers/calm-and-balance')).status, 404);
  assert.equal((await call('/api/offers/featured')).json.offer, null);
});

test('AT-09: sample data + event funnel are inspectable', async () => {
  const cookie = await login();
  await call('/api/admin/offers/calm-balance-tiktok', { method: 'PUT', body: { status: 'active', startsAt: '2020-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', discountValue: 20 }, cookie });
  const r = await call('/api/admin/sample-data', { method: 'POST', body: {}, cookie });
  assert.equal(r.json.created.length, 6);
  const ev = (await call('/api/admin/events', { cookie })).json;
  assert.equal(ev.funnel.length, 5);
  assert.ok(ev.funnel[4].sessions >= 6);
  const dash = (await call('/api/admin/dashboard', { cookie })).json.kpis;
  assert.ok(dash.conversionPct > 0 && dash.conversionPct <= 100);
  assert.ok(dash.pendingReview >= 1);
});

test('security: static path traversal and non-JSON posts are refused', async () => {
  assert.notEqual((await call('/..%2fdata%2fruntime%2fauth.json')).status, 200);
  const r = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  assert.equal(r.status, 415);
});
