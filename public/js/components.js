import { html, raw, icon, money, pctOff, api, toast, offerBadge } from './lib.js';
import { cart, track } from './state.js';

// ---- Cached storefront data -------------------------------------------------
let cache = {};
export const data = {
  async config() { return (cache.config ||= api('/api/config')); },
  async products() { return (cache.products ||= api('/api/products').then((r) => r.products)); },
  async featuredOffer() { return (cache.featured ||= api('/api/offers/featured').then((r) => r.offer).catch(() => null)); },
  reset() { cache = {}; },
};

// ---- Decorative landscape (pure SVG, no external assets) -------------------
export const scene = (cls = '') => raw(`<svg class="scene ${cls}" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9efe9"/><stop offset="1" stop-color="#f6f1e6"/></linearGradient></defs>
  <rect width="800" height="400" fill="url(#sky)"/>
  <path d="M0 250 L120 150 L200 210 L330 90 L450 200 L560 120 L680 210 L800 140 V400 H0Z" fill="#c9d3cb"/>
  <path d="M0 280 L90 220 L190 265 L300 190 L420 260 L540 200 L660 260 L800 215 V400 H0Z" fill="#a9b8ab"/>
  <g fill="#5f7a63">${Array.from({ length: 16 }, (_, i) => {
    const x = 20 + i * 52 + (i % 3) * 7; const h = 70 + ((i * 37) % 45); const y = 335 - h; const w = h * 0.32;
    const pts = [[0, 0], [w * 0.5, h * 0.3], [w * 0.25, h * 0.3], [w * 0.75, h * 0.62], [w * 0.38, h * 0.62], [w, h], [-w, h], [-w * 0.38, h * 0.62], [-w * 0.75, h * 0.62], [-w * 0.25, h * 0.3], [-w * 0.5, h * 0.3]];
    return `<polygon points="${pts.map(([dx, dy]) => `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`).join(' ')}"/>`;
  }).join('')}</g>
  <path d="M0 330 Q200 300 400 325 T800 315 V400 H0Z" fill="#e7dcc6"/>
</svg>`);

export function breadcrumb(items) {
  return html`<nav class="crumbs" aria-label="Breadcrumb">${icon('home')}${items.map((it, i) => html`${i ? icon('chevR', 'sep') : ''}${it.href ? html`<a href="${it.href}">${it.label}</a>` : html`<span aria-current="page">${it.label}</span>`}`)}</nav>`;
}

export function qtyStepper(value, { key = '', max = 20, label = 'Quantity' } = {}) {
  return html`<div class="qty" data-qty="${key}">
    <button type="button" class="qty-btn" data-step="-1" aria-label="Decrease ${label}" ${value <= 1 ? 'disabled' : ''}>${icon('minus')}</button>
    <input type="number" inputmode="numeric" min="1" max="${max}" value="${value}" aria-label="${label}">
    <button type="button" class="qty-btn" data-step="1" aria-label="Increase ${label}" ${value >= max ? 'disabled' : ''}>${icon('plus')}</button>
  </div>`;
}

/** Product card used on home + shop. `preset` selects a variant; `offer` makes it a campaign card. */
export function productCard(p, { showDesc = false, preset } = {}) {
  const variant = p.variants.find((v) => v.id === preset) || p.variants[0];
  return html`<article class="pcard" data-product="${p.id}">
    <a class="pcard-img" href="/product/${p.slug}" aria-label="${p.name}"><img src="${p.images[0].src}" alt="${p.images[0].alt}" loading="lazy"></a>
    <div class="pcard-body">
      <h3><a href="/product/${p.slug}">${p.name}</a></h3>
      <div class="pcard-price"><span class="price" data-price>${money(variant.priceCents)}</span>${variant.compareAtCents ? html`<s data-compare>${money(variant.compareAtCents)}</s>` : html`<s data-compare hidden></s>`}</div>
      <label class="variant-select"><span>Variant:</span>
        <select data-variant aria-label="${p.name} variant">${p.variants.map((v) => html`<option value="${v.id}" ${v.id === variant.id ? 'selected' : ''}>${v.short}</option>`)}</select>${icon('chevD')}
      </label>
      ${showDesc ? html`<p class="pcard-desc">${p.shortDescription}</p>` : ''}
      <button class="btn btn-primary btn-sm" data-add>${icon('cart')} Add to Cart</button>
    </div>
  </article>`;
}

/** Wires variant selects + add-to-cart buttons inside `root` for product cards. */
export function bindProductCards(root, products) {
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-variant]');
    if (!sel) return;
    const card = sel.closest('[data-product]');
    const p = products.find((x) => x.id === card.dataset.product);
    const v = p.variants.find((x) => x.id === sel.value);
    card.querySelector('[data-price]').textContent = money(v.priceCents);
    const s = card.querySelector('[data-compare]');
    s.hidden = !v.compareAtCents;
    if (v.compareAtCents) s.textContent = money(v.compareAtCents);
  });
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    const card = btn.closest('[data-product]');
    const p = products.find((x) => x.id === card.dataset.product);
    const variantId = card.querySelector('[data-variant]').value;
    addToCart(p, variantId, 1);
  });
}

export function addToCart(p, variantId, qty, offer = null) {
  cart.add({ productId: p.id, variantId, qty, offerId: offer ? offer.id : null });
  const v = p.variants.find((x) => x.id === variantId);
  track('add_to_cart', { productId: p.id, offerId: offer ? offer.id : undefined, label: `Added ${qty} × ${p.name} (${v ? v.short : variantId}) to cart${offer ? ' via offer' : ''}` });
  toast(`${p.name} added to cart`, { action: 'View cart', href: '/cart' });
}

export function offerBanner(offer) {
  if (!offer) return '';
  return html`<section class="campaign-banner">
    <div class="cb-art">${scene('mini')}<div class="phone">${icon('music')}<b>${offer.sourceLabel}</b><span>Campaign</span></div></div>
    <div class="cb-copy"><h2>${offer.sourceLabel} Campaign Offer</h2><p>${offer.subheadline}</p></div>
    <div class="cb-cta"><span class="pill-off">${offerBadge(offer)}</span><a class="btn btn-primary" href="${offer.url}?utm_source=${offer.source}">Claim the Offer ${icon('chevR')}</a></div>
  </section>`;
}

export function heroProducts(images) {
  return html`<div class="hero-products">${images.map((src, i) => html`<img src="${src}" alt="" class="hp hp-${i}" loading="eager">`)}<div class="stone"></div></div>`;
}

export const emptyState = (title, text, cta) => html`<div class="empty">${icon('bag')}<h3>${title}</h3><p>${text}</p>${cta || ''}</div>`;
export const pct = pctOff;
