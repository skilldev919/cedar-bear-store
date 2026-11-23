'use strict';
// Campaign attribution & basic event log (TRACK-01, AT-09).
const crypto = require('crypto');
const { remoteEnabled } = require('./store');
const { eventRepo } = require('./repos');
const { HttpError } = require('./http');

const TYPES = ['landing_visit', 'product_view', 'add_to_cart', 'checkout_start', 'simulated_completion'];
const MAX_EVENTS = remoteEnabled ? 5000 : 20000;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;
const SLUG_RE = /^[a-z0-9-]{1,60}$/;

function clean(v, max = 120) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, max) : null;
}

class Events {
  constructor(file) { this.repo = eventRepo(file, MAX_EVENTS); }

  all() { return this.repo.all(); }

  async record(input, { server = false } = {}) {
    const type = input.type;
    if (!TYPES.includes(type)) throw new HttpError(400, 'Unknown event type');
    if (type === 'simulated_completion' && !server) throw new HttpError(400, 'Completion events are recorded by the server');
    if (!SESSION_RE.test(String(input.sessionId || ''))) throw new HttpError(400, 'Invalid session');
    const source = input.source && SLUG_RE.test(String(input.source).toLowerCase()) ? String(input.source).toLowerCase() : 'direct';
    const ev = {
      id: crypto.randomUUID(),
      ts: server && input.ts ? input.ts : new Date().toISOString(),
      type,
      sessionId: input.sessionId,
      source,
      campaign: clean(input.campaign, 80),
      offerId: input.offerId && SLUG_RE.test(String(input.offerId)) ? input.offerId : null,
      productId: input.productId && SLUG_RE.test(String(input.productId)) ? input.productId : null,
      path: clean(input.path, 200),
      label: clean(input.label, 160),
      orderId: server ? input.orderId || null : null,
    };
    await this.repo.append(ev);
    return ev;
  }

  async forSession(sessionId) { return (await this.all()).filter((e) => e.sessionId === sessionId); }

  clear() { return this.repo.clear(); }
}

module.exports = { Events, EVENT_TYPES: TYPES };
