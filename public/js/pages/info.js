import { html, icon, setTitle } from '../lib.js';
import { data } from '../components.js';

export default async function info(root, { arg }) {
  if (arg === 'about') {
    setTitle('About');
    const products = await data.products();
    root.innerHTML = String(html`<section class="container page-top narrow prose">
      <h1>About Cedar Bear</h1>
      <p class="lead">A healthy lifestyle, naturally. Cedar Bear makes alcohol-free herbal formulas in convenient 60 mL dropper bottles.</p>
      <div class="about-products">${products.map((p) => html`<a class="about-p" href="/product/${p.slug}"><img src="${p.images[1]?.src || p.images[0].src}" alt="${p.images[0].alt}"><b>${p.name}</b><small>${p.categoryLabel} · ${p.labelLine}</small></a>`)}</div>
      <h2>How this Phase 1 demo works</h2>
      <ol class="how">
        <li>${icon('bag')}<span><b>Storefront path</b> — Home → Shop → Product → Cart → Checkout.</span></li>
        <li>${icon('tag')}<span><b>Campaign path</b> — a campaign link (e.g., TikTok) opens an offer landing page → Claim → the same shared cart → Checkout.</span></li>
        <li>${icon('shield')}<span><b>Server-validated pricing</b> — discounts, bundles and shipping are recalculated on the server; expired offers never grant a discount.</span></li>
        <li>${icon('flask')}<span><b>Simulated checkout</b> — no real payment is taken and nothing is sent to a supplier. Orders are marked “TEST”.</span></li>
        <li>${icon('chart')}<span><b>Operations</b> — authorized staff can review and export test orders and campaign events.</span></li>
      </ol>
    </section>`);
    return;
  }
  if (arg === 'privacy') {
    setTitle('Privacy');
    root.innerHTML = String(html`<section class="container page-top narrow prose"><h1>Privacy</h1>
      <p>This is a Phase 1 demonstration site. Information entered at checkout is used only to create a clearly-marked test order that authorized operators can review. No payment information is collected.</p>
      <p>We record basic, anonymous browsing events (landing visit, product view, add to cart, checkout start and simulated completion) together with the campaign source of your visit, to measure how the storefront and campaign offers perform. A random session identifier is stored in your browser; no third-party trackers are used.</p>
      <p>Order confirmation details are only viewable in the browser that placed the order.</p></section>`);
    return;
  }
  setTitle('Terms');
  root.innerHTML = String(html`<section class="container page-top narrow prose"><h1>Terms</h1>
    <p>This site is a Phase 1 demonstration of the Cedar Bear retail storefront and promotional funnel. Orders placed here are <b>test orders</b>: no payment is collected, no goods are shipped and no supplier dispatch occurs.</p>
    <p>Prices, offers and product information shown are for demonstration and may change before launch. Dietary supplements: these statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.</p></section>`);
}
