'use strict';
// Checkout & order model (CHK-01/02, ORDER-01, AT-06).
//
// Order states:   draft -> awaiting-payment -> test-completed | pending-review | canceled
// Payment states: unpaid -> simulated            (verified-paid reserved for a future verified provider event)
const crypto = require('crypto');
const { orderRepo } = require('./repos');
const { HttpError } = require('./http');

const ORDER_STATUSES = ['test-completed', 'pending-review', 'canceled'];
const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,24}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

function text(v, field, { required = true, max = 100 } = {}) {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim() : '';
  if (required && !s) throw new HttpError(400, `${field} is required`, { field });
  if (s.length > max) throw new HttpError(400, `${field} is too long`, { field });
  return s;
}

function validateCheckout(body, settings) {
  const c = body.customer || {};
  const s = body.shipping || {};
  const customer = {
    name: text(c.name, 'Full name', { max: 80 }),
    email: text(c.email, 'Email address', { max: 120 }).toLowerCase(),
  };
  if (!EMAIL_RE.test(customer.email)) throw new HttpError(400, 'Enter a valid email address', { field: 'email' });
  const shipping = {
    name: customer.name,
    address1: text(s.address1, 'Address line 1', { max: 120 }),
    address2: text(s.address2, 'Address line 2', { required: false, max: 120 }),
    city: text(s.city, 'City', { max: 80 }),
    state: text(s.state, 'State', { max: 2 }).toUpperCase(),
    zip: text(s.zip, 'ZIP code', { max: 10 }),
    country: 'United States',
  };
  if (!US_STATES.includes(shipping.state)) throw new HttpError(400, 'Choose a valid state', { field: 'state' });
  if (!ZIP_RE.test(shipping.zip)) throw new HttpError(400, 'Enter a valid ZIP code', { field: 'zip' });
  const shippingMethod = settings.shipping.methods.some((m) => m.id === body.shippingMethod) ? body.shippingMethod : null;
  if (!shippingMethod) throw new HttpError(400, 'Choose a shipping method', { field: 'shippingMethod' });
  const paymentMethod = settings.paymentMethods.some((m) => m.id === body.paymentMethod) ? body.paymentMethod : null;
  if (!paymentMethod) throw new HttpError(400, 'Choose a demo payment method', { field: 'paymentMethod' });
  if (!KEY_RE.test(String(body.idempotencyKey || ''))) throw new HttpError(400, 'Missing checkout key');
  return { customer, shipping, shippingMethod, paymentMethod, idempotencyKey: body.idempotencyKey };
}

class Orders {
  constructor(file, { pricing, payment, events, offers, settings }) {
    this.repo = orderRepo(file);
    Object.assign(this, { pricing, payment, events, offers, settings });
    this.inFlight = new Map();
  }

  all() { return this.repo.all(); }
  get(id) { return this.repo.get(id); }

  async create(body, { sample = false, createdAt } = {}) {
    const input = validateCheckout(body, this.settings);
    // Idempotency: a retried/double-clicked submission returns the same order (AT-06).
    const key = input.idempotencyKey;
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const p = (async () => {
      const existing = await this.repo.findByKey(key);
      if (existing) return existing;
      // Cross-instance guard: atomically reserve the key (Redis SET NX) before creating anything.
      const claim = await this.repo.claim(key);
      if (!claim.ok) {
        if (claim.existing) return claim.existing;
        throw new HttpError(409, 'This order is already being processed — please wait a moment and refresh.');
      }
      try {
        const order = await this._create(body, input, { sample, createdAt });
        await this.repo.complete(key, order.id);
        return order;
      } catch (err) {
        await this.repo.release(key).catch(() => {});
        throw err;
      }
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  async _create(body, input, { sample, createdAt }) {
    const q = this.pricing.quote({ items: body.items, shippingMethod: input.shippingMethod });
    if (!q.lines.length) throw new HttpError(400, 'Your cart is empty');
    // Never silently change what the customer agreed to: if the server had to
    // reprice (expired offer, removed product), send the fresh quote back.
    if (q.notices.length) throw new HttpError(409, 'Your cart was updated — please review the new totals.', { quote: q });
    if (body.expectedTotalCents !== undefined && body.expectedTotalCents !== q.totals.totalCents) {
      throw new HttpError(409, 'Prices changed — please review the new totals.', { quote: q });
    }

    const a = body.attribution || {};
    const offerIds = [...new Set(q.lines.map((l) => l.offerId).filter(Boolean))];
    const offer = offerIds.length ? this.offers.get(offerIds[0]) : null;
    const source = offer ? offer.source : (typeof a.source === 'string' && /^[a-z0-9-]{1,40}$/.test(a.source) ? a.source : 'direct');
    const sessionId = typeof body.sessionId === 'string' && KEY_RE.test(body.sessionId) ? body.sessionId : null;

    const now = createdAt ? new Date(createdAt) : new Date();
    const seq = await this.repo.nextSeq(); // atomic (Redis INCR) — order numbers are always unique
    const order = {
      id: `TEST-${now.getFullYear()}-${String(seq).padStart(5, '0')}`,
      token: crypto.randomBytes(18).toString('base64url'),
      idempotencyKey: input.idempotencyKey,
      environment: 'test',
      isTest: true,
      sample,
      createdAt: now.toISOString(),
      orderStatus: 'draft',
      paymentStatus: 'unpaid',
      customer: input.customer,
      shipping: { ...input.shipping, method: q.shipping.method, methodLabel: q.shipping.label },
      lines: q.lines.map(({ key, ...l }) => l),
      totals: q.totals,
      payment: null,
      supplierDispatch: false,
      attribution: {
        source,
        campaign: offer ? offer.campaign : (typeof a.campaign === 'string' ? a.campaign.slice(0, 80) : null),
        offerIds,
        sessionId,
        landingPath: typeof a.landingPath === 'string' ? a.landingPath.slice(0, 200) : null,
      },
      history: [{ ts: now.toISOString(), status: 'draft' }],
    };

    order.orderStatus = 'awaiting-payment';
    order.history.push({ ts: now.toISOString(), status: 'awaiting-payment' });
    order.payment = await this.payment.process({ orderId: order.id, amountCents: q.totals.totalCents, currency: q.currency, method: input.paymentMethod });
    order.paymentStatus = order.payment.paymentStatus; // 'simulated' — never 'verified-paid' in Phase 1
    const r = this.settings.review;
    const needsReview = q.totals.totalCents > r.totalAboveCents || q.lines.some((l) => l.qty > r.lineQtyAbove);
    order.orderStatus = needsReview ? 'pending-review' : 'test-completed';
    order.history.push({ ts: now.toISOString(), status: order.orderStatus, note: needsReview ? 'Auto-flagged for review (large order)' : 'Simulated payment completed' });

    await this.repo.insert(order);

    if (sessionId && !sample) {
      await this.events.record({ type: 'simulated_completion', sessionId, source, campaign: order.attribution.campaign,
        offerId: offerIds[0] || null, path: `/order/confirmation/${order.id}`, label: `Completed demo order ${order.id} (no real payment)`, orderId: order.id }, { server: true });
    }
    return order;
  }

  async setStatus(id, status, by = 'admin') {
    if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, 'Invalid order status');
    const order = await this.repo.get(id);
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.orderStatus !== status) {
      order.orderStatus = status;
      order.history.push({ ts: new Date().toISOString(), status, note: `Changed by ${by}` });
      await this.repo.update(order);
    }
    return order;
  }

  /** Public confirmation view: requires the order's secret token; no internals. */
  async publicView(id, token) {
    const order = await this.repo.get(id);
    if (!order || typeof token !== 'string' || token.length !== order.token.length ||
        !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(order.token))) {
      throw new HttpError(404, 'Order not found');
    }
    const { token: _t, idempotencyKey: _k, attribution: _a, history: _h, ...rest } = order;
    return rest;
  }

  clear() { return this.repo.clear(); }
}

module.exports = { Orders, ORDER_STATUSES, US_STATES };
