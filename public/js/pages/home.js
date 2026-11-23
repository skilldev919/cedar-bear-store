import { html, icon, setTitle } from '../lib.js';
import { data, productCard, bindProductCards, offerBanner, scene, heroProducts } from '../components.js';

export default async function home(root) {
  setTitle('');
  const [products, offer] = await Promise.all([data.products(), data.featuredOffer()]);
  const offerHref = offer ? `${offer.url}?utm_source=${offer.source}` : '/offer';
  const features = [
    { icon: 'bag', tone: 'green', title: 'Browse Catalog', text: 'Explore our product collection by category.', href: '/shop' },
    { icon: 'tag', tone: 'terra', title: 'Promotional Offer', text: `Enter via a campaign offer (e.g., ${offer ? offer.sourceLabel : 'TikTok'}) to get a special offer.`, href: offerHref },
    { icon: 'cart', tone: 'green', title: 'Shared Cart', text: 'The same cart works across browsing and campaign entry.', href: '/cart' },
    { icon: 'card', tone: 'terra', title: 'Checkout Demo', text: 'A simulated checkout flow (no real payments) for Phase 1 demo.', href: '/checkout' },
    { icon: 'gear', tone: 'green', title: 'Admin Orders', text: 'View and manage demo orders from the admin portal.', href: '/admin/operations' },
  ];
  root.innerHTML = String(html`
  <section class="hero">
    ${scene()}
    <div class="container hero-grid">
      <div class="hero-copy">
        <h1>Healthy Retail Storefront + Promotional Funnel</h1>
        <p>Browse our products directly or enter via a campaign offer to experience the full promotional sales funnel, from offer to (simulated) checkout.</p>
        <div class="btn-row">
          <a class="btn btn-primary btn-lg" href="/shop">${icon('bag')} Browse Catalog ${icon('chevR')}</a>
          <a class="btn btn-terra btn-lg" href="${offerHref}">${icon('tag')} View Featured Offer ${icon('chevR')}</a>
        </div>
      </div>
      ${heroProducts(products.slice(0, 3).map((p) => p.images[0].src))}
    </div>
  </section>

  <section class="container features">
    ${features.map((f) => html`<a class="feature" href="${f.href}">
      <span class="feature-ic tone-${f.tone}">${icon(f.icon)}</span>
      <span class="feature-txt"><b>${f.title}</b><span>${f.text}</span></span>
      ${icon('chevR', 'feature-chev')}
    </a>`)}
  </section>

  <section class="container section">
    <div class="section-head"><h2>Featured Products</h2><a class="link-more" href="/shop">View All Products ${icon('chevR')}</a></div>
    <div class="pgrid pgrid-3" id="featured">${products.slice(0, 3).map((p) => productCard(p))}</div>
  </section>

  <div class="container section-tight">${offerBanner(offer)}</div>`);
  bindProductCards(root.querySelector('#featured'), products);
}
