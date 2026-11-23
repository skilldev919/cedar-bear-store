import { html, icon, money, setTitle, api } from '../lib.js';
import { scene, heroProducts, qtyStepper, emptyState, data } from '../components.js';
import { cart } from '../state.js';

/** Asks the server to price the cart; applies any server-side normalisation (expired offers, removed items). */
export async function serverQuote(shippingMethod = 'standard') {
  const q = await api('/api/cart/quote', { method: 'POST', body: { items: cart.items(), shippingMethod } });
  if (q.notices.length) cart.set(q.normalizedItems);
  return q;
}

export default async function cartPage(root) {
  setTitle('Your Cart');
  const products = await data.products();
  root.innerHTML = String(html`
  <section class="cart-hero">
    ${scene()}
    <div class="container cart-hero-grid">
      <div>
        <h1>Your Cart</h1>
        <p class="lead">A shared cart for everything — items from our product catalog and special campaign offers are combined here for one easy checkout.</p>
        <div class="equation">
          <div class="eq eq-green">${icon('box')}<span><b>Catalog Items</b><small>Regular products from our catalog</small></span></div>
          <span class="eq-op">+</span>
          <div class="eq eq-terra">${icon('tag')}<span><b>Campaign-Offer Items</b><small>Promotional products from active offers</small></span></div>
          <span class="eq-op">=</span>
          <div class="eq eq-dark">${icon('cart')}<span><b>One Shared Cart</b><small>All items together, one checkout</small></span></div>
        </div>
      </div>
      ${heroProducts(products.slice(0, 2).map((p) => p.images[0].src))}
    </div>
  </section>
  <section class="container cart-wrap" id="cart-body"><div class="page-loading"></div></section>`);

  const body = root.querySelector('#cart-body');
  let pending = 0;
  let notices = [];

  async function draw() {
    const ticket = ++pending;
    let q;
    try { q = await serverQuote('standard'); } catch (e) {
      body.innerHTML = String(html`<div class="notice notice-error">${icon('info')} ${e.message}</div>`);
      if (e.status === 400) { cart.clear(); }
      return;
    }
    if (ticket !== pending) return;
    if (q.notices.length) notices = q.notices;
    if (!q.lines.length) {
      body.innerHTML = String(html`${notices.map((n) => html`<div class="notice notice-warn">${icon('info')} ${n.message}</div>`)}
        ${emptyState('Your cart is empty', 'Browse the catalog or claim a campaign offer — both fill this same shared cart.',
          html`<div class="btn-row center"><a class="btn btn-primary" href="/shop">${icon('bag')} Browse Catalog</a><a class="btn btn-terra" href="/offer">${icon('tag')} View Featured Offer</a></div>`)}`);
      return;
    }
    const t = q.totals;
    const s = q.shipping;
    const progress = Math.min(100, Math.round((t.merchandiseCents / s.thresholdCents) * 100));
    body.innerHTML = String(html`
    ${notices.map((n) => html`<div class="notice notice-warn">${icon('info')} ${n.message}</div>`)}
    <div class="cart-grid">
      <div class="panel cart-items">
        <h2>Cart Items (${t.itemCount})</h2>
        <table class="ctable">
          <thead><tr><th>Item</th><th>Unit Price</th><th>Quantity</th><th>Line Total</th><th><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>${q.lines.map((l) => html`<tr data-key="${cart.keyOf(l)}">
            <td class="ci-item"><a href="/product/${l.slug}${l.offerId ? '' : ''}"><img src="${l.image}" alt=""></a>
              <div><a href="/product/${l.slug}"><b>${l.name}${l.offerId ? ' (Promo)' : ''}</b></a><small>Variant: ${l.variantShort}</small>
              ${l.source === 'offer' ? html`<span class="tag tag-offer" title="${l.offerName}">${icon('tag')} Offer</span>` : html`<span class="tag tag-catalog">${icon('box')} Catalog</span>`}</div></td>
            <td class="ci-unit" data-label="Unit Price">${l.offerId ? html`<s>${money(l.regularUnitCents)}</s><b class="promo">${money(l.unitCents)}</b>` : money(l.unitCents)}</td>
            <td data-label="Quantity">${qtyStepper(l.qty, { key: cart.keyOf(l), max: cart.max, label: `${l.name} quantity` })}</td>
            <td class="ci-total" data-label="Line Total">${money(l.lineCents)}</td>
            <td><button class="link-remove" type="button" data-remove>Remove</button></td>
          </tr>`)}</tbody>
        </table>
      </div>
      <aside class="panel summary">
        <h2>Order Summary</h2>
        <dl class="totals">
          <dt>Subtotal (${t.itemCount} ${t.itemCount === 1 ? 'item' : 'items'})</dt><dd>${money(t.subtotalCents)}</dd>
          <dt>Discount (Campaign Offers)</dt><dd class="pos">${t.discountCents ? `−${money(t.discountCents)}` : money(0)}</dd>
          <dt>Shipping</dt><dd class="${s.freeShippingApplied ? 'pos' : ''}">${money(t.shippingCents)}</dd>
        </dl>
        <div class="ship-box ${s.freeShippingApplied ? 'done' : ''}">
          <div class="sb-head">${icon('truck')}<span><b>Free Shipping</b><small>Orders ${money(s.thresholdCents)}+ ship free (standard)</small></span>${s.freeShippingApplied ? icon('checkCircle', 'ok') : ''}</div>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
          <p>${s.freeShippingApplied ? html`<b>${money(t.merchandiseCents)}</b> / ${money(s.thresholdCents)} (Free shipping achieved)` : html`Add <b>${money(s.remainingCents)}</b> more for free shipping`}</p>
        </div>
        <div class="total-row"><span>Total</span><b>${money(t.totalCents)}</b></div>
        <div class="validated">${icon('shield')}<span><b>Totals are server-validated</b><small>Prices, discounts, and eligibility are confirmed on our server at checkout.</small></span></div>
      </aside>
    </div>
    <div class="cart-actions">
      <a class="btn btn-outline btn-lg" href="/shop">${icon('arrowL')} Continue Shopping</a>
      <a class="btn btn-terra btn-lg" href="/checkout">${icon('bag')} Proceed to Checkout ${icon('chevR')}</a>
    </div>`);
  }

  body.addEventListener('click', (e) => {
    const row = e.target.closest('[data-key]');
    if (!row) return;
    const key = row.dataset.key;
    if (e.target.closest('[data-remove]')) { cart.remove(key); notices = []; draw(); return; }
    const step = e.target.closest('[data-step]');
    if (step) {
      const item = cart.items().find((i) => cart.keyOf(i) === key);
      if (item) { cart.setQty(key, item.qty + Number(step.dataset.step)); draw(); }
    }
  });
  body.addEventListener('change', (e) => {
    const row = e.target.closest('[data-key]');
    if (row && e.target.matches('input[type=number]')) { cart.setQty(row.dataset.key, Number(e.target.value)); draw(); }
  });
  await draw();
}
