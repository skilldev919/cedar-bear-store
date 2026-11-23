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

export async function navigate(path, { replace = false } = {}) {
  const main = $('#main');
  // Brief fade-out of the current page before the next one rises in.
  if (!replace && !reduceMotion() && main.children.length) {
    main.classList.remove('page-enter');
    main.classList.add('page-leave');
    await new Promise((r) => setTimeout(r, 150));
  }
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  window.scrollTo(0, 0);
  await render();
}

/** Entrance animation for the freshly rendered page + soft reveal of sections below the fold. */
let revealObserver;
function animatePage(main) {
  main.classList.remove('page-leave', 'page-enter');
  if (reduceMotion()) return;
  void main.offsetWidth; // restart the CSS animation
  main.classList.add('page-enter');
  setTimeout(() => main.classList.remove('page-enter'), 1200);
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
window.addEventListener('popstate', render);
cart.subscribe(() => {
  const n = cart.count();
  document.querySelectorAll('.cart-count').forEach((el) => { el.textContent = `(${n})`; });
  const cl = document.querySelector('.cart-link'); if (cl) cl.setAttribute('aria-label', `Cart, ${n} items`);
});

footer();
render();
