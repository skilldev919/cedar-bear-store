'use strict';
// Admin dashboard metrics, CSV export and optional sample data.
const crypto = require('crypto');

const DAY = 86400000;

function dashboard(orders, events, now = Date.now()) {
  const inRange = (ts, from, to) => { const t = Date.parse(ts); return t >= from && t < to; };
  const cur = [now - 7 * DAY, now + 1];
  const prev = [now - 14 * DAY, now - 7 * DAY];

  const conv = (from, to) => {
    const started = new Set(events.filter((e) => e.type === 'checkout_start' && inRange(e.ts, from, to)).map((e) => e.sessionId));
    const done = new Set(events.filter((e) => e.type === 'simulated_completion' && inRange(e.ts, from, to)).map((e) => e.sessionId));
    const completed = [...started].filter((s) => done.has(s)).length;
    return started.size ? Math.round((completed / started.size) * 100) : null;
  };
  const curOrders = orders.filter((o) => inRange(o.createdAt, ...cur)).length;
  const prevOrders = orders.filter((o) => inRange(o.createdAt, ...prev)).length;

  const bySource = new Map();
  orders.forEach((o) => {
    const key = o.attribution?.source || 'direct';
    const entry = bySource.get(key) || { source: key, campaign: null, orders: 0 };
    entry.orders += 1;
    entry.campaign = entry.campaign || o.attribution?.campaign || null;
    bySource.set(key, entry);
  });
  const sources = [...bySource.values()].sort((a, b) => b.orders - a.orders);
  const top = sources[0] || null;

  const curConv = conv(...cur);
  const prevConv = conv(...prev);
  return {
    totalOrders: orders.length,
    ordersDeltaPct: prevOrders ? Math.round(((curOrders - prevOrders) / prevOrders) * 100) : null,
    ordersLast7: curOrders,
    pendingReview: orders.filter((o) => o.orderStatus === 'pending-review').length,
    conversionPct: curConv,
    conversionDeltaPp: curConv !== null && prevConv !== null ? curConv - prevConv : null,
    topSource: top ? { ...top, sharePct: Math.round((top.orders / orders.length) * 100) } : null,
    sources,
    revenueTestCents: orders.filter((o) => o.orderStatus !== 'canceled').reduce((s, o) => s + o.totals.totalCents, 0),
  };
}

function funnel(events) {
  const types = ['landing_visit', 'product_view', 'add_to_cart', 'checkout_start', 'simulated_completion'];
  return types.map((type) => ({
    type,
    events: events.filter((e) => e.type === type).length,
    sessions: new Set(events.filter((e) => e.type === type).map((e) => e.sessionId)).size,
  }));
}

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula-injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const money = (c) => (c / 100).toFixed(2);

function ordersCsv(orders) {
  const head = ['order_id', 'created_at', 'environment', 'order_status', 'payment_status', 'payment_reference', 'supplier_dispatch',
    'customer_name', 'customer_email', 'address_line1', 'address_line2', 'city', 'state', 'zip', 'country', 'shipping_method',
    'sku', 'product', 'variant', 'qty', 'unit_price', 'line_total', 'line_source', 'offer_id',
    'order_subtotal', 'order_discount', 'order_shipping', 'order_total', 'source', 'campaign'];
  const rows = [head];
  orders.forEach((o) => o.lines.forEach((l) => rows.push([
    o.id, o.createdAt, 'TEST — DEMO ORDER', o.orderStatus, o.paymentStatus, o.payment?.reference, 'no',
    o.customer.name, o.customer.email, o.shipping.address1, o.shipping.address2, o.shipping.city, o.shipping.state, o.shipping.zip, o.shipping.country, o.shipping.methodLabel,
    l.sku, l.name, l.variantLabel, l.qty, money(l.unitCents), money(l.lineCents), l.source, l.offerId,
    money(o.totals.subtotalCents), money(o.totals.discountCents), money(o.totals.shippingCents), money(o.totals.totalCents),
    o.attribution?.source, o.attribution?.campaign,
  ])));
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Creates a handful of clearly-marked sample test orders + events through the real pricing/order pipeline. */
async function loadSampleData({ orders, events, offers }) {
  const offer = offers.featured();
  const people = [
    ['Jordan Lee', '123 Evergreen Way', 'Maplewood', 'OR', '97035'],
    ['Alex Rivera', '48 Pine Ridge Rd', 'Bend', 'OR', '97701'],
    ['Morgan Hale', '9 Cedar Hollow Ln', 'Boise', 'ID', '83702'],
    ['Taylor Chen', '310 Alder St', 'Tacoma', 'WA', '98402'],
    ['Riley Brooks', '77 Summit Ave', 'Missoula', 'MT', '59801'],
    ['Casey Nguyen', '15 Juniper Ct', 'Reno', 'NV', '89501'],
  ];
  const baskets = [
    { offer: true, items: [] },
    { items: [{ productId: 'kava-calm', variantId: '60ml', qty: 1 }] },
    { items: [{ productId: 'chamomile-relaxer', variantId: 'duo', qty: 1 }, { productId: 'adrenal-balance', variantId: '60ml', qty: 1 }] },
    { offer: true, items: [{ productId: 'kava-calm', variantId: 'duo', qty: 1 }] },
    { items: [{ productId: 'adrenal-balance', variantId: '60ml', qty: 6 }] },
    { offer: true, items: [] },
  ];
  const created = [];
  for (let i = 0; i < people.length; i++) {
    const [name, address1, city, state, zip] = people[i];
    const b = baskets[i];
    const useOffer = b.offer && offer;
    const items = [...b.items];
    if (useOffer) offer.items.forEach((it) => items.push({ productId: it.productId, variantId: it.variantId, qty: it.qty || 1, offerId: offer.id }));
    if (!items.length) continue;
    const sessionId = `sample-${crypto.randomBytes(6).toString('hex')}`;
    const t0 = Date.now() - (i * 26 + 3) * 3600000;
    const source = useOffer ? offer.source : 'direct';
    const evs = useOffer
      ? [['landing_visit', 0, `Visited ${offer.campaign} landing page`, `/offer/${offer.slug}`]]
      : [['landing_visit', 0, 'Visited storefront home page', '/']];
    evs.push(['product_view', 1, `Viewed ${items[0].productId.replace(/-/g, ' ')}`, `/product/${items[0].productId}`]);
    evs.push(['add_to_cart', 3, `Added ${items.length} item(s) to cart`, '/cart']);
    evs.push(['checkout_start', 5, 'Started simulated checkout', '/checkout']);
    evs.forEach(([type, min, label, path]) => {
      const e = events.record({ type, sessionId, source, campaign: useOffer ? offer.campaign : null, offerId: useOffer ? offer.id : null, productId: items[0].productId, path, label });
      e.ts = new Date(t0 + min * 60000).toISOString();
    });
    const order = await orders.create({
      items, sessionId,
      customer: { name, email: `${name.split(' ')[0].toLowerCase()}.sample@cedarbear.demo` },
      shipping: { address1, address2: '', city, state, zip },
      shippingMethod: i % 3 === 2 ? 'expedited' : 'standard',
      paymentMethod: i % 2 ? 'demo-bank' : 'demo-card',
      idempotencyKey: `sample-${crypto.randomUUID()}`,
      attribution: { source, campaign: useOffer ? offer.campaign : null },
    }, { sample: true, createdAt: new Date(t0 + 7 * 60000).toISOString() });
    events.record({ type: 'simulated_completion', sessionId, source, campaign: order.attribution.campaign, offerId: order.attribution.offerIds[0] || null,
      path: `/order/confirmation/${order.id}`, label: `Completed demo order ${order.id} (no real payment)`, orderId: order.id }, { server: true })
      .ts = new Date(t0 + 7 * 60000).toISOString();
    created.push(order.id);
  }
  // One abandoned checkout so the conversion rate is realistic.
  const sid = `sample-${crypto.randomBytes(6).toString('hex')}`;
  ['landing_visit', 'product_view', 'add_to_cart', 'checkout_start'].forEach((type, k) => {
    events.record({ type, sessionId: sid, source: 'direct', productId: 'kava-calm', path: '/', label: k === 3 ? 'Started simulated checkout' : 'Sample session' })
      .ts = new Date(Date.now() - 5 * 3600000 + k * 60000).toISOString();
  });
  events.src.write();
  if (created.length) orders.setStatus(created[created.length - 1], 'canceled', 'sample data');
  return created;
}

module.exports = { dashboard, funnel, ordersCsv, loadSampleData };
