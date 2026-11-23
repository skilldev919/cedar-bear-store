// Shared helpers: safe HTML templating, money, icons, API client, toasts.

class SafeHtml { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new SafeHtml(String(s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);
function renderVal(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return esc(v);
}
/** Tagged template: every interpolation is HTML-escaped unless it is itself html`` / raw(). */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += renderVal(v) + strings[i + 1]; });
  return new SafeHtml(out);
}

export const money = (cents) => `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
export const pctOff = (regular, now) => (regular > now ? Math.round(((regular - now) / regular) * 100) : 0);
export const fmtDate = (iso, opts = {}) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...opts });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const fmtTime = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const offerBadge = (o) => (o.discountType === 'percent' ? `${o.discountValue}% OFF` : `${money(o.discountValue)} OFF`);

// ---- Icons (inline SVG, stroke-based) -------------------------------------
const P = {
  bag: '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  tag: '<path d="M3 11.5V4a1 1 0 0 1 1-1h7.5l9.5 9.5-8.5 8.5z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  cart: '<circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17.5" cy="19.5" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1 1 0 0 0 1 .8h9.3a1 1 0 0 0 1-.8L20.5 7H6"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  home: '<path d="M3 11l9-7.5 9 7.5"/><path d="M5.5 9.5V20h5v-5.5h3V20h5V9.5"/>',
  chevR: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
  chevL: '<path d="M15 5.5L8.5 12l6.5 6.5"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  chevU: '<path d="M6 15l6-6 6 6"/>',
  arrowR: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  arrowL: '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.5-4.5"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.5-4.5M11 8v6M8 11h6"/>',
  leaf: '<path d="M11 20.5A7 7 0 0 1 4 13.5C4 7.5 10 4.5 20 3.5c-1 10-4.5 17-9 17z"/><path d="M4 21c3-6 6.5-9 11-11"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  lotus: '<path d="M12 20c-1.8-2.6-3-5.6 0-12 3 6.4 1.8 9.4 0 12z"/><path d="M12 20c-4.5 0-8.5-2.5-9.5-7 3.5 0 7 1.6 9.5 7zM12 20c4.5 0 8.5-2.5 9.5-7-3.5 0-7 1.6-9.5 7z"/>',
  truck: '<path d="M1.5 5.5h12.5v10.5H1.5zM14 9.5h4.2l3.3 3.3v3.2H14"/><circle cx="5.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  truckFast: '<path d="M5 5.5h10v10.5H5zM15 9.5h3.5l3 3v3.5H15"/><circle cx="8.5" cy="17.5" r="2"/><circle cx="18" cy="17.5" r="2"/><path d="M1 8h3M1 11h3M2 14h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19.5 7"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8 5.2-5.6"/>',
  star: '<path d="M12 3.2l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17.2 6.6 20l1-6.1-4.4-4.3 6.1-.8z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6.5 8-6.5s7 2.5 8 6.5"/>',
  box: '<path d="M21 7.5l-9-4.5-9 4.5 9 4.5zM3 7.5v9l9 4.5 9-4.5v-9M12 12v9"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  megaphone: '<path d="M3 10v4h3.5L15 19V5l-8.5 5z"/><path d="M18.5 9a4 4 0 0 1 0 6M6.5 14l1.5 6h2.5l-1-5"/>',
  download: '<path d="M12 3.5v12M7 10.5l5 5 5-5M4 20.5h16"/>',
  dots: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
  flask: '<path d="M9 3h6M10 3v6.5L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3"/><path d="M7 15.5h10"/>',
  list: '<path d="M8.5 6h12.5M8.5 12h12.5M8.5 18h12.5M3.5 6h.1M3.5 12h.1M3.5 18h.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  menu: '<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bank: '<path d="M3 9.5L12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  music: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5H11"/><path d="M14 3c.5 2.5 2.5 4.5 5.5 5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5M12 8S10.5 3.5 8 4.2 8.7 8 12 8zM12 8s1.5-4.5 4-3.8S15.3 8 12 8z"/>',
  chart: '<path d="M5 20V12M10 20V5M15 20v-9M20 20v-6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  message: '<path d="M20.5 12a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.1-4.2A8.5 8.5 0 1 1 20.5 12z"/>',
  logout: '<path d="M9 20.5H5V3.5h4M15.5 16.5L20 12l-4.5-4.5M20 12H9"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13.5h10L18 7"/>',
  filter: '<path d="M3.5 5h17l-6.5 8v6l-4-2v-4z"/>',
  dropper: '<path d="M14.5 3.5l6 6M17.5 6.5L8 16l-3.5 1 1-3.5L15 4"/><path d="M4.5 17.5L3 21"/>',
};
export function icon(name, cls = '') {
  return raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`);
}
export function stars(n = 5) {
  return raw(`<span class="stars" aria-label="${n} out of 5 stars">${Array.from({ length: 5 }, (_, i) =>
    `<svg viewBox="0 0 24 24" class="${i < Math.round(n) ? 'on' : ''}" aria-hidden="true"><path d="${'M12 3.2l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17.2 6.6 20l1-6.1-4.4-4.3 6.1-.8z'}"/></svg>`).join('')}</span>`);
}

export const logo = (cls = '') => raw(`<svg class="logo-mark ${cls}" viewBox="0 0 96 52" aria-hidden="true" fill="currentColor">
  <path d="M14 4l7 11h-3.5l6 9h-4l6.5 10H4l6.5-10h-4l6-9H9z"/>
  <path d="M27 10l6 9.5h-3l5 7.5h-3.4l5.4 8H22.6"/>
  <path d="M6 33h3v6H6zM15.5 33h3v6h-3z"/>
  <path d="M36 44c0-8 7-13 18-13.5 6-.3 10.5-1.6 14.5-4.3 2.6-1.7 5.2-2.6 7.6-2.4l1.2-2.3 1.6 2.6c2.2.6 4 2 5.4 3.8l4.6 1.4c1.4.5 1.6 2.2.3 3l-3.2.8c-1.3 3.4-3.6 6-6.5 7.7V47h-4.3l-.6-5.2c-5 1.3-11.6 1.4-17.4.6L60.5 47h-4.2l-.6-5.6c-3.5-.6-6.6.4-8.6 2.4L45 47h-4.5l1.4-5.2C39.7 43 37.7 43.8 36 44z"/>
  <path d="M2 47.5h92v1.8H2z"/>
</svg>`);

// ---- API ------------------------------------------------------------------
export class ApiError extends Error {
  constructor(status, data) { super(data?.error || `Request failed (${status})`); this.status = status; this.data = data || {}; }
}
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 401 && data && data.loginRequired) window.dispatchEvent(new CustomEvent('cb:login-required'));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ---- Toasts ---------------------------------------------------------------
export function toast(message, { action, href, tone = 'ok' } = {}) {
  let wrap = document.getElementById('toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; wrap.setAttribute('aria-live', 'polite'); document.body.append(wrap); }
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.innerHTML = String(html`${icon(tone === 'ok' ? 'checkCircle' : 'info')}<span>${message}</span>${action ? html`<a href="${href}">${action}</a>` : ''}`);
  wrap.append(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function setTitle(t) { document.title = t ? `Cedar Bear – ${t}` : 'Cedar Bear – Retail Storefront'; }
