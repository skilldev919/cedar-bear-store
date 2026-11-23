// SPA shell: routing, header/footer, mobile drawer.
import { html, icon, logo, $, setTitle } from './lib.js';
import { cart, captureUrlAttribution, trackLanding } from './state.js';
import { data } from './components.js';

const routes = [
  { re: /^\/$/, nav: 'home', load: () => import('./pages/home.js') },
  { re: /^\/shop\/?$/, nav: 'shop', load: () => import('./pages/shop.js') },
  { re: /^\/product\/([a-z0-9-]+)\/?$/, nav: 'shop', load: () => import('./pages/product.js') },
  { re: /^\/offer(?:\/([a-z0-9-]+))?\/?$/, nav: 'offer', load: () => import('./pages/offer.js'), noLanding: true },
  { re: /^\/cart\/?$/, nav: 'cart', load: () => import('./pages/cart.js') },
  { re: /^\/checkout\/?$/, nav: 'cart', load: () => import('./pages/checkout.js') },
  { re: /^\/order\/confirmation\/([A-Za-z0-9-]+)\/?$/, nav: '', load: () => import('./pages/confirmation.js') },
  { re: /^\/about\/?$/, nav: 'about', load: () => import('./pages/info.js'), arg: 'about' },
  { re: /^\/privacy\/?$/, nav: '', load: () => import('./pages/info.js'), arg: 'privacy' },
  { re: /^\/terms\/?$/, nav: '', load: () => import('./pages/info.js'), arg: 'terms' },
  { re: /^\/admin(?:\/([a-z-]+))?\/?$/, nav: 'admin', load: () => import('./pages/admin.js'), admin: true, noLanding: true },
];

let current = { nav: '', admin: false };
let navToken = 0;

function topbar(admin) {
  $('#topbar').innerHTML = String(admin
    ? html`<div class="topbar topbar-admin">${icon('lock')} <span>Authorized Access Only<span class="hide-sm"> — Cedar Bear Administration</span></span></div>`
    : html`<div class="topbar">${icon('flask')} <span>Phase 1 Demo – Simulated Checkout Only</span></div>`);
}

async function header() {
  const offer = await data.featuredOffer();
  const n = cart.count();
  const link = (key, href, label) => html`<a href="${href}" class="${current.nav === key ? 'active' : ''}" ${current.nav === key ? 'aria-current="page"' : ''}>${label}</a>`;
  const offerHref = offer ? offer.url : '/offer';
  $('#site-header').innerHTML = String(html`<div class="header-inner">
    <a class="brand" href="/" aria-label="Cedar Bear home">${logo()}<span>Cedar Bear</span></a>
    <nav class="main-nav" aria-label="Main">${link('home', '/', 'Home')}${link('shop', '/shop', 'Shop')}${link('offer', offerHref, 'Featured Offer')}${link('about', '/about', 'About')}</nav>
    <div class="header-actions">
      <a href="/cart" class="cart-link ${current.nav === 'cart' ? 'active' : ''}" aria-label="Cart, ${n} items">${icon('cart')}<span class="cart-label">Cart</span> <span class="cart-count">(${n})</span></a>
      ${current.admin ? html`<details class="admin-menu"><summary>${icon('user')}<span>Admin</span>${icon('chevD')}</summary><div><a href="/admin/operations">${icon('chart')} Dashboard</a><a href="/admin/security">${icon('shield')} Access & Security</a><button type="button" data-logout>${icon('logout')} Sign out</button></div></details>` : ''}
      <button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer">${icon('menu')}</button>
    </div>
  </div>
  <div class="drawer" id="drawer" hidden>
    <nav aria-label="Mobile">${link('home', '/', 'Home')}${link('shop', '/shop', 'Shop')}${link('offer', offerHref, 'Featured Offer')}${link('about', '/about', 'About')}${link('cart', '/cart', `Cart (${n})`)}<a href="/admin">Admin</a></nav>
  </div>`);
}

function footer() {
  $('#site-footer').innerHTML = String(html`<div class="footer-inner">
    <a class="brand brand-light" href="/">${logo()}<span>Cedar Bear</span></a>
    <span class="tagline">A healthy lifestyle, naturally.</span>
    <nav aria-label="Footer"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/admin">Admin ${icon('external')}</a></nav>
  </div>
  <p class="disclaimer">Phase 1 demonstration — no real payments are collected and no orders are dispatched. These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.</p>`);
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Page transitions & effects ------------------------------------------------
const supportsVT = typeof document.startViewTransition === 'function';
let lastPointer = null;
function fxLayer() {
  let el = document.querySelector('.fx-layer');
  if (!el) { el = document.createElement('div'); el.className = 'fx-layer'; el.setAttribute('aria-hidden', 'true'); document.body.append(el); }
  return el;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function spawn(parent, cls, x, y, vars = {}) {
  const d = document.createElement('div');
  d.className = cls;
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  for (const [k, v] of Object.entries(vars)) d.style.setProperty(k, v);
  parent.append(d);
  return d;
}

/** Magic wand: the wand flicks at the click point and light shoots out of its tip —
 *  a flare, a fan of light beams and a shower of stars that fall like glitter. */
function castWand(x, y) {
  const cast = document.createElement('div');
  cast.className = 'fx-cast';
  fxLayer().append(cast);
  spawn(cast, 'fx-wand', x, y);
  spawn(cast, 'fx-flare', x, y);
  // The wand points up-left, so the light shoots out in a fan centred on that direction.
  const aim = -128;
  for (let i = 0; i < 9; i++) {
    const a = aim + (i - 4) * 13 + rnd(-5, 5);
    spawn(cast, 'fx-beam', x, y, { '--a': `${a}deg`, '--len': `${Math.round(rnd(140, 300))}px`, '--d': `${(Math.abs(i - 4) * 0.018).toFixed(3)}s` });
  }
  const colors = ['#fff3b0', '#ffe07a', '#ffffff', '#c9f3dc', '#ffd1e6', '#ffe07a'];
  for (let i = 0; i < 18; i++) {
    const a = ((aim + rnd(-75, 75)) * Math.PI) / 180;
    const dist = rnd(70, 230);
    spawn(cast, 'fx-star', x, y, {
      '--x': `${Math.round(Math.cos(a) * dist)}px`, '--y': `${Math.round(Math.sin(a) * dist)}px`,
      '--r': `${Math.round(rnd(-360, 360))}deg`, '--s': `${Math.round(rnd(9, 22))}px`,
      '--c': colors[i % colors.length], '--t': `${rnd(0.9, 1.4).toFixed(2)}s`, '--d': `${rnd(0, 0.12).toFixed(2)}s`,
    });
  }
  for (let i = 0; i < 16; i++) {
    const a = ((aim + rnd(-90, 90)) * Math.PI) / 180;
    const dist = rnd(30, 160);
    spawn(cast, 'fx-glitter', x, y, { '--x': `${Math.round(Math.cos(a) * dist)}px`, '--y': `${Math.round(Math.sin(a) * dist)}px`, '--d': `${rnd(0, 0.2).toFixed(2)}s` });
  }
  // Hide the real wand cursor while the animated wand flicks, so only one wand is visible.
  document.body.classList.add('wand-casting');
  clearTimeout(castWand.cursorTimer);
  castWand.cursorTimer = setTimeout(() => document.body.classList.remove('wand-casting'), 600);
  setTimeout(() => cast.remove(), 1900);
}

document.addEventListener('pointerdown', (e) => {
  lastPointer = { x: e.clientX, y: e.clientY, t: Date.now() };
  if (e.button !== 0) return;
  // Don't cast while typing in form fields or using dropdowns.
  if (e.target.closest('input, textarea, select, [contenteditable="true"], option')) return;
  castWand(e.clientX, e.clientY);
}, true);

/** Page change: after the wand's light leaves the tip, it floods the screen (bloom + beams). */
function fxBurst(x, y) {
  const layer = fxLayer();
  layer.querySelectorAll('.fx-burst').forEach((b) => b.remove());
  layer.style.setProperty('--fx-x', `${Math.round(x)}px`);
  layer.style.setProperty('--fx-y', `${Math.round(y)}px`);
  const burst = document.createElement('div');
  burst.className = 'fx-cast fx-burst';
  burst.innerHTML = '<div class="fx-flash"></div><div class="fx-rays"></div>';
  layer.append(burst);
  setTimeout(() => burst.remove(), 1700);
}

/** Floating bokeh lights behind the content (decorative). */
function ambient() {
  if (document.querySelector('.ambient')) return;
  const a = document.createElement('div');
  a.className = 'ambient';
  a.setAttribute('aria-hidden', 'true');
  let h = '<div class="glow"></div>';
  for (let i = 0; i < 16; i++) {
    const size = 6 + Math.random() * 18;
    h += `<i style="left:${Math.random() * 100}%;width:${size}px;height:${size}px;animation-duration:${16 + Math.random() * 18}s;animation-delay:-${Math.random() * 30}s;--dx:${Math.round(Math.random() * 120 - 60)}px"></i>`;
  }
  a.innerHTML = h;
  document.body.prepend(a);
}

export async function navigate(path, { replace = false } = {}) {
  const update = async () => {
    if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
    window.scrollTo(0, 0);
    await render();
  };
  if (replace) { await update(); return; }
  await transition(update);
}

/** Runs a DOM update inside the page transition (View Transitions when available, CSS fallback otherwise). */
async function transition(update) {
  const p = lastPointer && Date.now() - lastPointer.t < 1500 ? lastPointer : { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  document.documentElement.style.setProperty('--vt-x', `${Math.round(p.x)}px`);
  document.documentElement.style.setProperty('--vt-y', `${Math.round(p.y)}px`);
  fxBurst(p.x, p.y);
  if (supportsVT) {
    const t = document.startViewTransition(update);
    await t.updateCallbackDone.catch(() => {});
    return;
  }
  const main = $('#main');
  if (main.children.length) {
    main.classList.remove('page-enter');
    main.classList.add('page-leave');
    await new Promise((r) => setTimeout(r, 420)); // swap pages while the light covers the screen
  }
  await update();
}

/** Entrance choreography for the freshly rendered page + reveal of sections below the fold. */
let revealObserver;
function animatePage(main) {
  main.classList.remove('page-leave', 'page-enter', 'vt-enter');
  void main.offsetWidth; // restart the CSS animations
  const cls = supportsVT ? 'vt-enter' : 'page-enter';
  main.classList.add(cls);
  setTimeout(() => main.classList.remove(cls), 1600);
  if (!('IntersectionObserver' in window)) return;
  revealObserver?.disconnect();
  revealObserver = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('in'); revealObserver.unobserve(en.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  const fold = window.innerHeight;
  main.querySelectorAll('.section, .section-tight, .info-cards, .offer-grid, .testimonials, .config-note, .confirm-cols, .explain, .details-grid, .cart-actions, .about-products, .how')
    .forEach((el) => { if (el.getBoundingClientRect().top > fold) { el.classList.add('reveal'); revealObserver.observe(el); } });
}
export const refreshHeader = () => header();

async function render() {
  const token = ++navToken;
  const path = location.pathname;
  const route = routes.find((r) => r.re.test(path));
  const main = $('#main');
  current = { nav: route ? route.nav : '', admin: Boolean(route && route.admin) };
  topbar(current.admin);
  document.body.classList.toggle('is-admin', current.admin);
  header();
  if (!route) {
    setTitle('Page not found');
    main.classList.remove('page-leave');
    main.innerHTML = String(html`<section class="container narrow center pad-xl"><h1>Page not found</h1><p>We couldn't find that page.</p><a class="btn btn-primary" href="/">${icon('arrowL')} Back to Store</a></section>`);
    return;
  }
  captureUrlAttribution();
  if (!route.noLanding) trackLanding();
  const params = path.match(route.re).slice(1);
  try {
    const mod = await route.load();
    if (token !== navToken) return;
    main.innerHTML = '';
    await mod.default(main, { params, arg: route.arg, query: new URLSearchParams(location.search), isStale: () => token !== navToken });
    if (token === navToken) animatePage(main);
  } catch (err) {
    console.error(err);
    if (token !== navToken) return;
    main.classList.remove('page-leave');
    main.innerHTML = String(html`<section class="container narrow center pad-xl"><h1>Something went wrong</h1><p>${err.message || 'Please try again.'}</p><a class="btn btn-primary" href="/">Back to Store</a></section>`);
  }
}

// Intercept same-origin links for client-side navigation.
document.addEventListener('click', (e) => {
  const drawerBtn = e.target.closest('.menu-btn');
  if (drawerBtn) {
    const d = $('#drawer');
    d.hidden = !d.hidden;
    drawerBtn.setAttribute('aria-expanded', String(!d.hidden));
    return;
  }
  if (e.target.closest('[data-logout]')) {
    fetch('/api/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).finally(() => navigate('/admin'));
    return;
  }
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || a.target || a.hasAttribute('download') || url.pathname.startsWith('/api/')) return;
  e.preventDefault();
  const menu = a.closest('details'); if (menu) menu.open = false;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) { location.hash = url.hash; return; }
  navigate(url.pathname + url.search + url.hash);
});
window.addEventListener('popstate', () => transition(render));
cart.subscribe(() => {
  const n = cart.count();
  document.querySelectorAll('.cart-count').forEach((el) => { el.textContent = `(${n})`; });
  const cl = document.querySelector('.cart-link'); if (cl) cl.setAttribute('aria-label', `Cart, ${n} items`);
});

footer();
ambient();
render();
