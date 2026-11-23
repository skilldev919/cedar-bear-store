import { html, icon, money, setTitle, api } from '../lib.js';
import { data, emptyState } from '../components.js';
import { cart, track, attribution, sessionId, rotateSession, orderTokens, uuid, account } from '../state.js';
import { navigate } from '../app.js';
import { serverQuote } from './cart.js';

export function stepper(step) {
  const s = (n, label) => html`<li class="${n < step ? 'done' : n === step ? 'now' : ''}"><span>${n < step ? icon('check') : n}</span>${label}</li>`;
  return html`<ol class="stepper" aria-label="Checkout progress">${s(1, 'Cart')}<li class="line"></li>${s(2, 'Checkout')}<li class="line"></li>${s(3, 'Confirmation')}</ol>`;
}

const DEMO = { name: 'Jamie Sample', email: 'jamie.sample@cedarbear.demo', address1: '123 Cedar Lane', address2: 'Suite 100', city: 'Rivermere', state: 'OR', zip: '97035' };

export default async function checkout(root) {
  setTitle('Checkout');
  const config = await data.config();
  if (!cart.items().length) {
    root.innerHTML = String(html`<section class="container page-top"><h1>Checkout – Demo Order</h1>${emptyState('Your cart is empty', 'Add a product or claim an offer before checking out.', html`<a class="btn btn-primary" href="/shop">Browse Catalog</a>`)}</section>`);
    return;
  }
  const st = { shippingMethod: 'standard', paymentMethod: config.paymentMethods[0].id, quote: null, busy: false, key: uuid() };
  track('checkout_start', { label: 'Started simulated checkout' });

  const field = (id, label, { req = true, type = 'text', auto = '', ph = '', cls = '' } = {}) => html`<div class="field ${cls}">
    <label for="${id}">${label}${req ? html` <i class="req">*</i>` : html` <span class="opt">(Optional)</span>`}</label>
    <input id="${id}" name="${id}" type="${type}" ${req ? 'required' : ''} autocomplete="${auto}" placeholder="${ph}">
    <small class="err" id="${id}-err"></small></div>`;

  root.innerHTML = String(html`
  <section class="container page-top checkout">
    <div class="co-head">
      <div><h1>Checkout – Demo Order</h1><p class="muted">A Phase 1 demo checkout to showcase the order flow. No real payment will be processed.</p></div>
      ${stepper(2)}
    </div>
    <div class="notice notice-error" id="form-error" hidden></div>
    <form class="co-grid" id="co-form" novalidate>
      <div class="co-left">
        <fieldset class="panel">
          <legend class="panel-h">${icon('user', 'ph-ic')}<span><b>Customer Information</b><small>Who is placing this demo order?</small></span>
            <button type="button" class="btn btn-ghost btn-sm" id="fill-demo">Fill demo details</button></legend>
          <div class="fields two">${field('name', 'Full Name', { auto: 'name', ph: 'Jamie Sample' })}${field('email', 'Email Address', { type: 'email', auto: 'email', ph: 'you@example.com' })}</div>
        </fieldset>
        <fieldset class="panel">
          <legend class="panel-h">${icon('truck', 'ph-ic')}<span><b>Shipping Address</b><small>Where should we send the demo order?</small></span></legend>
          <div class="fields two">${field('address1', 'Address Line 1', { auto: 'address-line1', ph: '123 Cedar Lane' })}${field('address2', 'Address Line 2', { req: false, auto: 'address-line2', ph: 'Suite 100' })}</div>
          <div class="fields three">${field('city', 'City', { auto: 'address-level2' })}
            <div class="field"><label for="state">State <i class="req">*</i></label><div class="select-wrap"><select id="state" name="state" required autocomplete="address-level1"><option value="">Select</option>${config.states.map((s) => html`<option>${s}</option>`)}</select>${icon('chevD')}</div><small class="err" id="state-err"></small></div>
            ${field('zip', 'ZIP Code', { auto: 'postal-code', ph: '97035' })}</div>
        </fieldset>
        <fieldset class="panel">
          <legend class="panel-h">${icon('box', 'ph-ic')}<span><b>Shipping Method</b><small>Choose a shipping option for this demo order.</small></span></legend>
          <div class="radios" id="ship-methods"></div>
        </fieldset>
      </div>
      <div class="co-right">
        <section class="panel co-summary" id="summary" aria-live="polite"><div class="page-loading"></div></section>
        <fieldset class="panel">
          <legend class="panel-h">${icon('card', 'ph-ic')}<span><b>Payment (Non-Live)</b><small>This is a simulated payment section for the <b>Phase 1 demo</b>.</small></span><span class="pill pill-terra-solid">DEMO ONLY</span></legend>
          <div class="radios">${config.paymentMethods.map((m, i) => html`<label class="radio ${i === 0 ? 'on' : ''}"><input type="radio" name="payment" value="${m.id}" ${i === 0 ? 'checked' : ''}>${icon(m.icon)}<span><b>${m.label}</b></span></label>`)}</div>
          <button class="btn btn-primary btn-xl btn-block" id="place" type="submit">${icon('check')} Place Test Order ${icon('chevR')}</button>
          <div class="note-warn">${icon('info')}<span>No real charge will be collected.<br>Test orders are visibly marked (e.g., “DEMO ORDER”).</span></div>
        </fieldset>
      </div>
    </form>
  </section>`);

  const $ = (s) => root.querySelector(s);
  const form = $('#co-form');
  // Pre-fill from the customer's account
  if (account.user) { $('#name').value = account.user.name; $('#email').value = account.user.email; }

  async function refresh() {
    try { st.quote = await serverQuote(st.shippingMethod); } catch (e) { $('#summary').innerHTML = String(html`<div class="notice notice-error">${e.message}</div>`); return; }
    const q = st.quote;
    if (!q.lines.length) { navigate('/cart', { replace: true }); return; }
    if (q.notices.length) showError(q.notices.map((n) => n.message).join(' '));
    $('#ship-methods').innerHTML = String(html`${q.shippingOptions.map((o) => html`<label class="radio ${o.id === st.shippingMethod ? 'on' : ''}">
      <input type="radio" name="shippingMethod" value="${o.id}" ${o.id === st.shippingMethod ? 'checked' : ''}>${icon(o.id === 'expedited' ? 'truckFast' : 'truck')}
      <span><b>${o.label}</b><small>${o.eta}</small></span><span class="r-price">${o.free ? html`<s>${money(o.baseCents)}</s> Free` : money(o.cents)}</span></label>`)}`);
    const t = q.totals;
    $('#summary').innerHTML = String(html`<h2>${icon('cart')} Order Summary</h2>
      <ul class="sum-lines">${q.lines.map((l) => html`<li><img src="${l.image}" alt=""><span><b>${l.name}</b><small>${l.variantShort}${l.offerId ? ' · Offer price' : ''}</small></span><span class="x">× ${l.qty}</span><span class="amt">${money(l.lineCents)}</span></li>`)}</ul>
      <dl class="totals">
        <dt>Subtotal</dt><dd>${money(t.subtotalCents)}</dd>
        ${t.discountCents ? html`<dt class="pos">Promotional Discount (Demo)</dt><dd class="pos">−${money(t.discountCents)}</dd>` : ''}
        <dt>Shipping (${q.shipping.method === 'expedited' ? 'Expedited' : 'Standard'})</dt><dd>${t.shippingCents ? money(t.shippingCents) : 'Free'}</dd>
      </dl>
      <div class="total-row big"><span>Total (Demo)</span><b>${money(t.totalCents)}</b></div>`);
  }

  function showError(msg) { const el = $('#form-error'); el.hidden = !msg; el.innerHTML = msg ? String(html`${icon('info')} ${msg}`) : ''; }
  function setFieldError(id, msg) {
    const el = $(`#${id}-err`); const input = $(`#${id}`);
    if (el) el.textContent = msg || '';
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function validate() {
    let ok = true;
    const v = (id) => $(`#${id}`).value.trim();
    const rules = {
      name: v('name') ? '' : 'Full name is required',
      email: /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v('email')) ? '' : 'Enter a valid email address',
      address1: v('address1') ? '' : 'Address is required',
      city: v('city') ? '' : 'City is required',
      state: v('state') ? '' : 'Choose a state',
      zip: /^\d{5}(-\d{4})?$/.test(v('zip')) ? '' : 'Enter a 5-digit ZIP code',
    };
    Object.entries(rules).forEach(([k, msg]) => { setFieldError(k, msg); if (msg) ok = false; });
    if (!ok) form.querySelector('[aria-invalid="true"]')?.focus();
    return ok;
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'shippingMethod') { st.shippingMethod = e.target.value; refresh(); }
    if (e.target.name === 'payment') {
      st.paymentMethod = e.target.value;
      form.querySelectorAll('input[name=payment]').forEach((r) => r.closest('.radio').classList.toggle('on', r.checked));
    }
  });
  form.addEventListener('input', (e) => { if (e.target.id) setFieldError(e.target.id, ''); });
  $('#fill-demo').addEventListener('click', () => { Object.entries(DEMO).forEach(([k, v]) => { $(`#${k}`).value = v; setFieldError(k, ''); }); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (st.busy) return;
    showError('');
    if (!validate()) return;
    st.busy = true;
    const btn = $('#place');
    btn.disabled = true; btn.classList.add('loading');
    const v = (id) => $(`#${id}`).value.trim();
    try {
      const res = await api('/api/orders', {
        method: 'POST',
        body: {
          items: cart.items(), shippingMethod: st.shippingMethod, paymentMethod: st.paymentMethod, idempotencyKey: st.key,
          expectedTotalCents: st.quote ? st.quote.totals.totalCents : undefined,
          customer: { name: v('name'), email: v('email') },
          shipping: { address1: v('address1'), address2: v('address2'), city: v('city'), state: v('state'), zip: v('zip') },
          sessionId: sessionId(), attribution: attribution(),
        },
      });
      orderTokens.set(res.orderId, res.token);
      cart.clear();
      rotateSession();
      navigate(`/order/confirmation/${res.orderId}`);
    } catch (err) {
      st.busy = false; btn.disabled = false; btn.classList.remove('loading');
      if (err.status === 409 && err.data.quote) {
        cart.set(err.data.quote.normalizedItems);
        st.key = uuid();
        showError(err.message);
        await refresh();
      } else if (err.data?.field) {
        setFieldError(err.data.field, err.message); showError(err.message);
      } else {
        showError(err.message || 'Could not place the test order. Please try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  await refresh();
}
