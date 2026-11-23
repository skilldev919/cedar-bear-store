import { html, icon, money, setTitle, api, fmtDateTime } from '../lib.js';
import { scene, heroProducts, data } from '../components.js';
import { orderTokens } from '../state.js';

export default async function confirmation(root, { params }) {
  const id = params[0];
  setTitle('Order Confirmation');
  const token = orderTokens.get(id);
  let order = null;
  if (token) order = await api(`/api/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`).then((r) => r.order).catch(() => null);
  if (!order) {
    root.innerHTML = String(html`<section class="container narrow center pad-xl">${icon('lock', 'big-ic')}<h1>Order details unavailable</h1>
      <p>For privacy, order details are only shown in the browser that placed the order. Operators can view all test orders in the admin portal.</p>
      <div class="btn-row center"><a class="btn btn-primary" href="/">${icon('arrowL')} Back to Store</a><a class="btn btn-terra" href="/admin/orders">${icon('list')} View Demo Orders</a></div></section>`);
    return;
  }
  const products = await data.products();
  const t = order.totals;
  const s = order.shipping;
  const statusLabel = order.orderStatus;
  const summaryTable = html`<table class="otable">
      <thead><tr><th>Items Purchased</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
      <tbody>${order.lines.map((l) => html`<tr><td class="oi"><img src="${l.image}" alt=""><span><b>${l.name}</b><small>Variant: ${l.variantShort}${l.offerId ? ' · Campaign offer' : ''}</small></span></td>
        <td data-label="Qty">${l.qty}</td><td data-label="Unit Price">${l.offerId ? html`<s class="muted">${money(l.regularUnitCents)}</s> ` : ''}${money(l.unitCents)}</td><td data-label="Subtotal">${money(l.lineCents)}</td></tr>`)}</tbody>
    </table>
    <dl class="totals">
      <dt>Subtotal</dt><dd>${money(t.subtotalCents)}</dd>
      ${t.discountCents ? html`<dt class="pos">Promotional Discount (Demo)</dt><dd class="pos">−${money(t.discountCents)}</dd>` : ''}
      <dt>Shipping (${s.method === 'expedited' ? 'Expedited' : 'Standard'})</dt><dd>${t.shippingCents ? money(t.shippingCents) : 'Free'}</dd>
    </dl>
    <div class="total-row"><span>Order Total</span><b>${money(t.totalCents)}</b></div>`;

  root.innerHTML = String(html`
  <section class="confirm-hero">
    ${scene()}
    <div class="container confirm-grid">
      <div class="confirm-card">
        <div class="cc-head">${icon('check', 'cc-check')}<div><h1>Test Order Confirmed</h1><p>Your demo order has been placed successfully. This is a simulated checkout for testing the Cedar Bear retail system.</p></div></div>
        <div class="cc-number">${icon('receipt')}<span>Test Order Number</span><b>${order.id}</b></div>
        <div class="cc-status">
          <div class="st st-green">${icon('box')}<span>Order Status:<b>${statusLabel}</b></span></div>
          <div class="st st-terra">${icon('card')}<span>Payment Status:<b>${order.paymentStatus}</b></span></div>
        </div>
        <div class="cc-notes"><span>${icon('info')} No real payment captured.</span><span>${icon('info')} No supplier dispatch triggered.</span></div>
      </div>
      ${heroProducts(products.slice(0, 2).map((p) => p.images[0].src))}
    </div>
  </section>
  <section class="container confirm-body">
    <div class="cb-head"><h2>${icon('bag')} Order Summary</h2><span class="muted">Placed on ${fmtDateTime(order.createdAt)} <span class="pill pill-outline">Demo</span></span></div>
    <div class="confirm-cols">
      <div class="panel">
        <div class="desktop-only">${summaryTable}</div>
        <details class="mobile-only order-collapse"><summary>${icon('bag')}<span><b>Order Summary</b><small>${t.itemCount} items | Total: ${money(t.totalCents)}</small></span>${icon('chevD')}</summary>${summaryTable}</details>
      </div>
      <div class="side-stack">
        <div class="panel addr">${icon('pin', 'side-ic')}<div><h3>Shipping Address</h3><address>${s.name}<br>${s.address1}${s.address2 ? html`, ${s.address2}` : ''}<br>${s.city}, ${s.state} ${s.zip}<br>${s.country}</address><small class="muted">${s.methodLabel}</small></div></div>
        <div class="panel panel-green demo-note">${icon('flask', 'side-ic')}<div><h3>Demo Checkout (Simulated)</h3><p>This order is for demonstration and testing purposes only. No real charge has been made, and no supplier dispatch will occur.</p></div></div>
      </div>
    </div>
    <div class="explain">
      <div>${icon('flask', 'ex-ic terra')}<span><b class="terra">This Is a Demo Order</b><small>A simulated checkout to showcase the retail experience and order flow.</small></span></div>
      <div>${icon('cart', 'ex-ic')}<span><b>Production Checkout (Real)</b><small>In production, you will be charged via a real payment provider (e.g., credit card, Apple Pay, or Google Pay), and your order will be sent to our supplier for fulfillment.</small></span></div>
    </div>
    <div class="btn-row center">
      <a class="btn btn-primary btn-lg" href="/">${icon('arrowL')} Back to Store</a>
      <a class="btn btn-terra btn-lg" href="/admin/orders?id=${order.id}">${icon('list')} View Demo Orders</a>
    </div>
  </section>`);
}
