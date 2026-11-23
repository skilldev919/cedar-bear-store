// Client state: the ONE shared cart (SALE-02), browsing session, campaign attribution, event tracking.
// The cart only stores identifiers + quantities; every price shown comes from the server.

const KEYS = { cart: 'cb_cart_v1', session: 'cb_session_v1', attr: 'cb_attr_v1', orders: 'cb_orders_v1' };
const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
const ATTR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

// ---- Cart -----------------------------------------------------------------
const listeners = new Set();
const keyOf = (i) => `${i.productId}|${i.variantId}|${i.offerId || ''}`;
const sanitize = (items) => (Array.isArray(items) ? items : [])
  .filter((i) => i && i.productId && i.variantId && Number.isInteger(i.qty) && i.qty > 0)
  .map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty, offerId: i.offerId || null }));

export const cart = {
  max: 20,
  items() { return sanitize(store.get(KEYS.cart, [])); },
  set(items) {
    const merged = new Map();
    sanitize(items).forEach((i) => {
      const k = keyOf(i);
      const prev = merged.get(k);
      merged.set(k, { ...i, qty: Math.min(cart.max, (prev ? prev.qty : 0) + i.qty) });
    });
    store.set(KEYS.cart, [...merged.values()]);
    listeners.forEach((fn) => fn());
  },
  add(item) { cart.set([...cart.items(), { ...item, qty: item.qty || 1 }]); },
  setQty(key, qty) {
    const q = Math.max(1, Math.min(cart.max, Math.floor(Number(qty)) || 1));
    store.set(KEYS.cart, cart.items().map((i) => (keyOf(i) === key ? { ...i, qty: q } : i)));
    listeners.forEach((fn) => fn());
  },
  remove(key) { cart.set(cart.items().filter((i) => keyOf(i) !== key)); },
  clear() { store.set(KEYS.cart, []); listeners.forEach((fn) => fn()); },
  count() { return cart.items().reduce((s, i) => s + i.qty, 0); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  keyOf,
};
// Keep multiple tabs in sync.
window.addEventListener('storage', (e) => { if (e.key === KEYS.cart) listeners.forEach((fn) => fn()); });

// ---- Session & attribution -----------------------------------------------
export function sessionId() {
  const s = store.get(KEYS.session, null);
  const now = Date.now();
  if (s && now - s.last < SESSION_IDLE_MS) { s.last = now; store.set(KEYS.session, s); return s.id; }
  const fresh = { id: uuid(), last: now, isNew: true };
  store.set(KEYS.session, fresh);
  return fresh.id;
}
/** After a completed order the next journey is a new session. */
export function rotateSession() { store.del(KEYS.session); }

export function attribution() {
  const a = store.get(KEYS.attr, null);
  if (!a || Date.now() - a.ts > ATTR_TTL_MS) return { source: 'direct', campaign: null, offerId: null, landingPath: null };
  return a;
}
export function setAttribution({ source, campaign = null, offerId = null, landingPath = location.pathname }) {
  if (!source) return;
  store.set(KEYS.attr, { source: String(source).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'direct', campaign, offerId, landingPath, ts: Date.now() });
}
/** Picks up ?utm_source / ?utm_campaign / ?src from any landing URL (TRACK-01). */
export function captureUrlAttribution() {
  const q = new URLSearchParams(location.search);
  const source = q.get('utm_source') || q.get('src');
  if (source) setAttribution({ source, campaign: q.get('utm_campaign'), offerId: null, landingPath: location.pathname + location.search });
  return Boolean(source);
}

// ---- Tracking ---------------------------------------------------------------
export function track(type, extra = {}) {
  const a = attribution();
  const body = {
    type, sessionId: sessionId(), source: extra.source || a.source, campaign: extra.campaign ?? a.campaign,
    offerId: extra.offerId ?? a.offerId, productId: extra.productId || null, path: location.pathname, label: extra.label || null,
  };
  fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}
/** One storefront landing_visit per browsing session (offer pages record their own). */
export function trackLanding() {
  let seen = false;
  try { seen = sessionStorage.getItem('cb_landed') === '1'; sessionStorage.setItem('cb_landed', '1'); } catch { /* ignore */ }
  if (!seen) track('landing_visit', { label: `Visited ${location.pathname === '/' ? 'storefront home page' : location.pathname}` });
}

// ---- Order confirmation tokens (kept only in this browser) --------------
export const orderTokens = {
  get(id) { return (store.get(KEYS.orders, {}) || {})[id] || null; },
  set(id, token) { const m = store.get(KEYS.orders, {}) || {}; m[id] = token; store.set(KEYS.orders, m); },
};
export { uuid };

// ---- Customer account (login state) -----------------------------------------
let me = null;
let meLoaded = false;
let meLoading = null;
export const account = {
  get user() { return me; },
  /** Fetches the logged-in customer once (cached); returns the user or null. */
  load(force = false) {
    if (meLoaded && !force) return Promise.resolve(me);
    meLoading ||= fetch('/api/account/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { me = j ? j.user : null; meLoaded = true; return me; })
      .catch(() => me)
      .finally(() => { meLoading = null; });
    return meLoading;
  },
  set(user) { me = user; meLoaded = true; },
  clear() { me = null; meLoaded = true; },
};
/** Only same-site paths are allowed as a post-login destination (prevents open redirects). */
export function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') &&!/^\/(login|register)\b/.test(next) ? next : '/shop';
}
export const loginUrl = (next = location.pathname + location.search) => `/login?next=${encodeURIComponent(safeNext(next))}`;
