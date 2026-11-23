'use strict';
// Campaign attribution & basic event log (TRACK-01, AT-09).
const crypto = require('crypto');
const { JsonFile, remoteEnabled } = require('./store');
const { HttpError } = require('./http');

const TYPES = ['landing_visit', 'product_view', 'add_to_cart', 'checkout_start', 'simulated_completion'];
const MAX_EVENTS = remoteEnabled ? 3000 : 20000; // keep each Redis value small
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;
const SLUG_RE = /^[a-z0-9-]{1,60}$/;

function clean(v, max = 120) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, max) : null;
}

class Events {
  constructor(file) { this.src = new JsonFile(file, { events: [] }, { remoteKey: 'events' }); }

  all() { return this.src.read().events; }

  record(input, { server = false } = {}) {
    const type = input.type;
    if (!TYPES.includes(type)) throw new HttpError(400, 'Unknown event type');
    if (type === 'simulated_completion' && !server) throw new HttpError(400, 'Completion events are recorded by the server');
    if (!SESSION_RE.test(String(input.sessionId || ''))) throw new HttpError(400, 'Invalid session');
    const source = input.source && SLUG_RE.test(String(input.source).toLowerCase()) ? String(input.source).toLowerCase() : 'direct';
    const ev = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
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
    const data = this.src.read();
    data.events.push(ev);
    if (data.events.length > MAX_EVENTS) data.events.splice(0, data.events.length - MAX_EVENTS);
    this.src.write(data);
    return ev;
  }

  forSession(sessionId) { return this.all().filter((e) => e.sessionId === sessionId); }

  clear() { this.src.write({ events: [] }); }
}

module.exports = { Events, EVENT_TYPES: TYPES };
