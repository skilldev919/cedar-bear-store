import { html, icon, money, setTitle, api, fmtDateTime, fmtTime, toast } from '../lib.js';
import { data } from '../components.js';
import { navigate } from '../app.js';

const SECTIONS = [
  { id: 'operations', label: 'Operations Dashboard', icon: 'chart' },
  { id: 'orders', label: 'Test Orders', icon: 'cart' },
  { id: 'events', label: 'Campaign Events', icon: 'megaphone' },
  { id: 'customers', label: 'Customers', icon: 'user' },
  { id: 'offers', label: 'Offer Configuration', icon: 'tag' },
  { id: 'security', label: 'Access & Security', icon: 'shield', sep: true },
];
const STATUS = {
  'test-completed': { label: 'Completed', cls: 'green', icon: 'check' },
  'pending-review': { label: 'Pending Review', cls: 'orange', icon: 'clock' },
  canceled: { label: 'Canceled', cls: 'red', icon: 'x' },
  'awaiting-payment': { label: 'Awaiting Payment', cls: 'grey', icon: 'clock' },
  draft: { label: 'Draft', cls: 'grey', icon: 'clock' },
};
const EVENT_META = {
  landing_visit: { label: 'Landing Visit', icon: 'card' },
  product_view: { label: 'Product View', icon: 'eye' },
  add_to_cart: { label: 'Add to Cart', icon: 'cart' },
  checkout_start: { label: 'Checkout Start', icon: 'card' },
  simulated_completion: { label: 'Simulated Completion', icon: 'checkCircle' },
};
const statusPill = (s) => { const m = STATUS[s] || STATUS.draft; return html`<span class="spill spill-${m.cls}">${icon(m.icon)} ${m.label}</span>`; };
const payPill = (s) => html`<span class="spill spill-pay">${s === 'simulated' ? 'Simulated' : s}</span>`;
const sourceLabel = (s) => (s === 'direct' ? 'Storefront (direct)' : s === 'tiktok' ? 'TikTok' : s.charAt(0).toUpperCase() + s.slice(1));

export default async function admin(root, { params, query }) {
  const section = SECTIONS.some((s) => s.id === params[0]) ? params[0] : 'operations';
  if (params[0] !== section) history.replaceState({}, '', `/admin/${section}${location.search}`);
  setTitle('Administration');
  try { await api('/api/admin/me'); } catch (e) {
    if (e.status === 401) return renderLogin(root);
    throw e;
  }
  root.innerHTML = String(html`<div class="admin-shell">
    <aside class="admin-side">
      <h2>${icon('gear')} Administration</h2>
      <nav aria-label="Administration">${SECTIONS.map((s) => html`${s.sep ? html`<hr>` : ''}<a href="/admin/${s.id}" class="${s.id === section ? 'active' : ''}" ${s.id === section ? 'aria-current="page"' : ''}>${icon(s.icon)} ${s.label}</a>`)}</nav>
    </aside>
    <div class="admin-main" id="admin-main"><div class="page-loading"></div></div>
  </div>`);
  const main = root.querySelector('#admin-main');
  const views = { operations, orders: ordersView, events: eventsView, customers: customersView, offers: offersView, security: securityView };
  try {
    await views[section](main, query);
  } catch (e) {
    if (e.status === 401) return renderLogin(root);
    main.innerHTML = String(html`<div class="notice notice-error">${icon('info')} ${e.message}</div>`);
  }
}

// ---- Login -------------------------------------------------------------------
function renderLogin(root) {
  setTitle('Admin Sign In');
  root.innerHTML = String(html`<section class="container narrow pad-xl">
    <form class="panel login" id="login" novalidate>
      <div class="login-ic">${icon('lock')}</div>
      <h1>Authorized Access Only</h1>
      <p class="muted">Sign in to the Cedar Bear administration portal to view test orders and campaign events.</p>
      <div class="field"><label for="pw">Admin password</label><input id="pw" type="password" autocomplete="current-password" required autofocus></div>
      <div class="notice notice-error" id="login-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('lock')} Sign In</button>
      <p class="muted small">The initial password is printed in the server console and saved to <code>data/runtime/INITIAL_ADMIN_PASSWORD.txt</code> (or set <code>ADMIN_PASSWORD</code>).</p>
    </form></section>`);
  const form = root.querySelector('#login');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#login-err');
    err.hidden = true;
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: root.querySelector('#pw').value } });
      navigate(location.pathname + location.search, { replace: true });
    } catch (ex) { err.hidden = false; err.textContent = ex.message; }
  });
}

// ---- Shared: KPI row ------------------------------------------------------------
function kpis(k) {
  const delta = (v, unit) => (v === null || v === undefined ? html`<small class="muted">No prior-period data</small>`
    : html`<small class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${v >= 0 ? '+' : ''}${v}${unit} vs. prior period</small>`);
  return html`<div class="kpis">
    <div class="kpi">${icon('cart', 'kpi-ic green')}<span><small>Total Demo Orders</small><b>${k.totalOrders}</b>${delta(k.ordersDeltaPct, '%')}</span></div>
    <div class="kpi">${icon('clock', 'kpi-ic orange')}<span><small>Pending Review</small><b class="orange">${k.pendingReview}</b><small class="${k.pendingReview ? 'warn' : 'muted'}">${k.pendingReview ? html`▲ ${k.pendingReview} require attention` : 'Nothing to review'}</small></span></div>
    <div class="kpi">${icon('trend', 'kpi-ic green')}<span><small>Conversions</small><b>${k.conversionPct === null ? '—' : `${k.conversionPct}%`}</b>${delta(k.conversionDeltaPp, ' pp')}</span></div>
    <div class="kpi">${icon('megaphone', 'kpi-ic terra')}<span><small>Top Campaign Source</small><b class="kpi-src">${k.topSource ? (k.topSource.source === 'direct' ? 'Storefront' : `${sourceLabel(k.topSource.source)} Campaign`) : '—'}</b><small class="muted">${k.topSource ? `${k.topSource.orders} orders (${k.topSource.sharePct}% of total)` : 'No orders yet'}</small></span></div>
  </div>`;
}

// ---- Shared: orders table + details ------------------------------------------------
function createOrdersPanel(container, allOrders, { limit = 0, initialId = null, showFilters = false } = {}) {
  const st = { sort: 'date', dir: -1, selected: new Set(), activeId: initialId || null, q: '', status: '' };
  const cols = [['id', 'Order ID'], ['customer', 'Customer'], ['total', 'Total'], ['status', 'Order Status'], ['payment', 'Payment Status'], ['date', 'Date']];
  const val = (o, k) => ({ id: o.id, customer: o.customer.name.toLowerCase(), total: o.totals.totalCents, status: o.orderStatus, payment: o.paymentStatus, date: o.createdAt }[k]);

  function list() {
    let l = allOrders.filter((o) => (!st.status || o.orderStatus === st.status)
      && (!st.q || `${o.id} ${o.customer.name} ${o.customer.email}`.toLowerCase().includes(st.q.toLowerCase())));
    l = l.slice().sort((a, b) => (val(a, st.sort) > val(b, st.sort) ? 1 : val(a, st.sort) < val(b, st.sort) ? -1 : 0) * st.dir);
    return limit ? l.slice(0, limit) : l;
  }

  function csvHref() {
    const ids = [...st.selected];
    return `/api/admin/orders.csv${ids.length ? `?ids=${encodeURIComponent(ids.join(','))}` : ''}`;
  }

  function draw() {
    const rows = list();
    container.querySelector('[data-table]').innerHTML = String(html`
      ${rows.length ? html`<table class="atable">
        <thead><tr><th class="cb"><input type="checkbox" data-all aria-label="Select all" ${rows.length && rows.every((o) => st.selected.has(o.id)) ? 'checked' : ''}></th>
          ${cols.map(([k, l]) => html`<th><button type="button" class="sort ${st.sort === k ? 'on' : ''}" data-sort="${k}">${l} ${icon(st.sort === k && st.dir === 1 ? 'chevU' : 'chevD')}</button></th>`)}<th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map((o) => html`<tr class="${o.id === st.activeId ? 'active' : ''}" data-id="${o.id}">
          <td class="cb"><input type="checkbox" data-sel aria-label="Select ${o.id}" ${st.selected.has(o.id) ? 'checked' : ''}></td>
          <td data-label="Order ID"><button type="button" class="oid" data-open>${o.id}</button>${o.sample ? html`<span class="mini-tag">sample</span>` : ''}</td>
          <td data-label="Customer"><b>${o.customer.name}</b><small>${o.customer.email}</small></td>
          <td data-label="Total"><b>${money(o.totals.totalCents)}</b></td>
          <td data-label="Order Status">${statusPill(o.orderStatus)}</td>
          <td data-label="Payment">${payPill(o.paymentStatus)}</td>
          <td data-label="Date" class="nowrap">${fmtDateTime(o.createdAt)}</td>
          <td class="actions"><details class="kebab"><summary aria-label="Actions for ${o.id}">${icon('dots')}</summary><div>
            <button type="button" data-open>${icon('eye')} View details</button>
            <button type="button" data-status="test-completed">${icon('check')} Mark completed</button>
            <button type="button" data-status="pending-review">${icon('clock')} Mark pending review</button>
            <button type="button" data-status="canceled" class="danger">${icon('x')} Cancel test order</button>
          </div></details></td>
        </tr>`)}</tbody></table>` : html`<div class="empty small">${icon('receipt')}<p>No test orders${st.q || st.status ? ' match these filters' : ' yet'}.</p>${!allOrders.length ? html`<p class="muted">Place one through the storefront checkout, or load sample orders in <a href="/admin/security">Access & Security</a>.</p>` : ''}</div>`}`);
    const exp = container.querySelector('[data-export]');
    exp.href = csvHref();
    exp.querySelector('span').textContent = st.selected.size ? `Export CSV (${st.selected.size})` : 'Export CSV';
    drawDetails();
  }

  async function drawDetails() {
    const box = container.querySelector('[data-details]');
    if (!box) return;
    if (!st.activeId) { box.innerHTML = ''; return; }
    const { order: o, events } = await api(`/api/admin/orders/${encodeURIComponent(st.activeId)}`);
    if (o.id !== st.activeId) return;
    const steps = Object.keys(EVENT_META).map((type) => ({ type, ev: events.find((e) => e.type === type) }));
    box.innerHTML = String(html`<div class="details-grid">
      <section class="panel">
        <div class="panel-title"><h3>${icon('cart')} Order Details — ${o.id}</h3>${statusPill(o.orderStatus)}</div>
        <div class="od-top">
          <dl class="kv">
            <dt>Customer</dt><dd>${o.customer.name}</dd>
            <dt>Email</dt><dd>${o.customer.email}</dd>
            <dt>Account</dt><dd>${o.account ? o.account.email : 'Guest (before accounts)'}</dd>
            <dt>Order Date</dt><dd>${fmtDateTime(o.createdAt)}</dd>
            <dt>Order Total</dt><dd><b>${money(o.totals.totalCents)}</b></dd>
            <dt>Source</dt><dd>${sourceLabel(o.attribution?.source || 'direct')}${o.attribution?.campaign ? html` · ${o.attribution.campaign}` : ''}</dd>
            <dt>Payment</dt><dd>${o.payment?.provider} · ${o.payment?.method} · <code>${o.payment?.reference}</code></dd>
          </dl>
          <div class="ship-details"><h4>${icon('truck')} Shipping Details</h4><address>${o.shipping.name}<br>${o.shipping.address1}${o.shipping.address2 ? `, ${o.shipping.address2}` : ''}<br>${o.shipping.city}, ${o.shipping.state} ${o.shipping.zip}<br>${o.shipping.country}</address><span class="mini-tag">${o.shipping.methodLabel}</span></div>
        </div>
        <div class="od-items"><h4>${icon('box')} Order Items (${o.lines.length})</h4>
          <ul>${o.lines.map((l) => html`<li><img src="${l.image}" alt=""><span><b>${l.name}</b><small>${l.variantShort}${l.offerId ? ` · offer ${l.offerId}` : ''}</small></span><span>× ${l.qty}</span><b>${money(l.lineCents)}</b></li>`)}</ul>
          <dl class="totals compact"><dt>Subtotal</dt><dd>${money(o.totals.subtotalCents)}</dd>${o.totals.discountCents ? html`<dt>Discount</dt><dd class="pos">−${money(o.totals.discountCents)}</dd>` : ''}<dt>Shipping</dt><dd>${money(o.totals.shippingCents)}</dd><dt><b>Total</b></dt><dd><b>${money(o.totals.totalCents)}</b></dd></dl>
        </div>
        <p class="muted small">${icon('info')} Test order — payment ${o.paymentStatus}, no capture, supplier dispatch: ${o.supplierDispatch ? 'yes' : 'no'}.</p>
      </section>
      <section class="panel">
        <div class="panel-title"><h3>${icon('trend')} Campaign Event Tracking — TRACK-01</h3></div>
        <p class="muted small">User journey and events for this order's ${o.attribution?.source && o.attribution.source !== 'direct' ? 'campaign' : 'storefront'} session.</p>
        ${o.attribution?.sessionId ? html`<ol class="timeline">${steps.map(({ type, ev }) => html`<li class="${ev ? 'done' : ''}">
          <span class="tl-dot">${ev ? icon('check') : ''}</span><span class="tl-ic">${icon(EVENT_META[type].icon)}</span>
          <span class="tl-txt"><b>${EVENT_META[type].label}</b><small>${ev ? ev.label || ev.path : 'Not recorded'}</small></span>
          <span class="tl-time">${ev ? fmtTime(ev.ts) : '—'}</span></li>`)}</ol>
          <p class="muted small">${events.length} event(s) in session <code>${o.attribution.sessionId.slice(0, 8)}…</code></p>`
        : html`<p class="muted">No browsing session was linked to this order.</p>`}
      </section>
    </div>`);
  }

  container.addEventListener('click', async (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) { const k = sortBtn.dataset.sort; st.dir = st.sort === k ? -st.dir : (k === 'date' || k === 'total' ? -1 : 1); st.sort = k; draw(); return; }
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const status = e.target.closest('[data-status]');
    if (status) {
      e.target.closest('details').open = false;
      try {
        const { order } = await api(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: { orderStatus: status.dataset.status } });
        const i = allOrders.findIndex((o) => o.id === id);
        allOrders[i] = order;
        toast(`${id} marked ${STATUS[order.orderStatus].label.toLowerCase()}`);
        st.activeId = id; draw();
        container.dispatchEvent(new CustomEvent('orders-changed'));
      } catch (ex) { toast(ex.message, { tone: 'info' }); }
      return;
    }
    if (e.target.closest('[data-open]') || (!e.target.closest('input,details,button,a'))) {
      const d = e.target.closest('details'); if (d) d.open = false;
      st.activeId = id; draw();
      container.querySelector('[data-details]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
  container.addEventListener('change', (e) => {
    if (e.target.matches('[data-all]')) { list().forEach((o) => (e.target.checked ? st.selected.add(o.id) : st.selected.delete(o.id))); draw(); }
    if (e.target.matches('[data-sel]')) { const id = e.target.closest('tr').dataset.id; if (e.target.checked) st.selected.add(id); else st.selected.delete(id); draw(); }
    if (e.target.matches('[data-filter-status]')) { st.status = e.target.value; draw(); }
  });
  container.addEventListener('input', (e) => { if (e.target.matches('[data-filter-q]')) { st.q = e.target.value; draw(); } });

  if (!st.activeId) st.activeId = list()[0]?.id || null;
  container.innerHTML = String(html`<section class="panel orders-panel">
    <div class="panel-title"><div><h2>Test Orders</h2><p class="muted">Demo orders from the simulated checkout (no real payments).</p></div>
      <a class="btn btn-outline btn-sm" data-export download href="/api/admin/orders.csv">${icon('download')} <span>Export CSV</span></a></div>
    ${showFilters ? html`<div class="table-filters"><label class="search small">${icon('search')}<input type="search" data-filter-q placeholder="Search by order ID, name or email"></label>
      <div class="select-wrap"><select data-filter-status aria-label="Filter by status"><option value="">All statuses</option>${Object.entries(STATUS).slice(0, 3).map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select>${icon('chevD')}</div></div>` : ''}
    <div class="table-scroll" data-table></div>
    ${limit && allOrders.length > limit ? html`<a class="link-more" href="/admin/orders">View all ${allOrders.length} test orders ${icon('chevR')}</a>` : ''}
  </section>
  <div data-details></div>`);
  draw();
}

// ---- Events table -----------------------------------------------------------------
function eventsTable(events) {
  if (!events.length) return html`<div class="empty small">${icon('megaphone')}<p>No campaign events recorded yet.</p></div>`;
  return html`<table class="atable events">
    <thead><tr><th>Time</th><th>Event</th><th>Source</th><th>Campaign / Offer</th><th>Details</th><th>Session</th></tr></thead>
    <tbody>${events.map((e) => html`<tr>
      <td data-label="Time" class="nowrap">${fmtTime(e.ts)}</td>
      <td data-label="Event"><span class="ev ev-${e.type}">${icon(EVENT_META[e.type]?.icon || 'info')} ${EVENT_META[e.type]?.label || e.type}</span></td>
      <td data-label="Source">${sourceLabel(e.source)}</td>
      <td data-label="Campaign">${e.campaign || e.offerId || '—'}</td>
      <td data-label="Details">${e.label || e.path || ''}${e.orderId ? html` <span class="mini-tag">${e.orderId}</span>` : ''}</td>
      <td data-label="Session"><code>${e.sessionId.slice(0, 8)}</code></td>
    </tr>`)}</tbody></table>`;
}

// ---- Views ------------------------------------------------------------------------
async function operations(main) {
  const [{ kpis: k }, { orders }, ev] = await Promise.all([api('/api/admin/dashboard'), api('/api/admin/orders'), api('/api/admin/events')]);
  main.innerHTML = String(html`
    <div class="admin-head"><div><h1>Operations Dashboard</h1><p class="muted">Monitor demo orders and campaign performance for the Phase 1 retail demonstration.</p></div><span class="auth-chip">${icon('lock')} Authorized access only</span></div>
    <div id="kpis">${kpis(k)}</div>
    <div class="tabs" role="tablist"><button role="tab" class="tab" aria-selected="true" data-tab="orders">${icon('cart')} Test Orders</button><button role="tab" class="tab" aria-selected="false" data-tab="events">${icon('megaphone')} Campaign Events</button></div>
    <div data-pane="orders"></div>
    <div data-pane="events" hidden><section class="panel"><div class="panel-title"><div><h2>Campaign Events</h2><p class="muted">Most recent tracked events (TRACK-01). <a href="/admin/events">Open full event log ${icon('chevR')}</a></p></div></div><div class="table-scroll">${eventsTable(ev.events.slice(0, 12))}</div></section></div>`);
  const pane = main.querySelector('[data-pane="orders"]');
  createOrdersPanel(pane, orders, { limit: 8 });
  pane.addEventListener('orders-changed', async () => { main.querySelector('#kpis').innerHTML = String(kpis((await api('/api/admin/dashboard')).kpis)); });
  main.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]'); if (!t) return;
    main.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
    main.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
  });
}

async function ordersView(main, query) {
  const { orders } = await api('/api/admin/orders');
  main.innerHTML = String(html`<div class="admin-head"><div><h1>Test Orders</h1><p class="muted">All simulated orders — view line items, customer & shipping details, update status, and export for manual supplier handoff.</p></div></div><div id="op"></div>`);
  const id = query.get('id');
  createOrdersPanel(main.querySelector('#op'), orders, { showFilters: true, initialId: orders.some((o) => o.id === id) ? id : null });
}

async function eventsView(main) {
  const st = { type: '', source: '' };
  async function load() {
    const qs = new URLSearchParams(Object.entries(st).filter(([, v]) => v));
    const r = await api(`/api/admin/events?${qs}`);
    const f = r.funnel;
    main.innerHTML = String(html`<div class="admin-head"><div><h1>Campaign Events</h1><p class="muted">Campaign/referral attribution and the basic funnel events (TRACK-01).</p></div></div>
      <div class="funnel">${f.map((s, i) => html`<div class="fstep">${icon(EVENT_META[s.type].icon)}<small>${EVENT_META[s.type].label}</small><b>${s.sessions}</b><span class="muted">${s.events} events${i > 0 && f[i - 1].sessions ? html` · ${Math.round((s.sessions / f[i - 1].sessions) * 100)}% of prev.` : ''}</span></div>`)}</div>
      <section class="panel">
        <div class="panel-title"><div><h2>Event Log</h2><p class="muted">${r.total} matching events${r.total > 500 ? ' (latest 500 shown)' : ''}. Sessions shown above are unique browsing sessions.</p></div>
          <div class="table-filters">
            <div class="select-wrap"><select id="f-type" aria-label="Event type"><option value="">All events</option>${r.types.map((t) => html`<option value="${t}" ${st.type === t ? 'selected' : ''}>${EVENT_META[t].label}</option>`)}</select>${icon('chevD')}</div>
            <div class="select-wrap"><select id="f-src" aria-label="Source"><option value="">All sources</option>${r.sources.map((s) => html`<option value="${s}" ${st.source === s ? 'selected' : ''}>${sourceLabel(s)}</option>`)}</select>${icon('chevD')}</div>
          </div></div>
        <div class="table-scroll">${eventsTable(r.events)}</div>
      </section>`);
    main.querySelector('#f-type').addEventListener('change', (e) => { st.type = e.target.value; load(); });
    main.querySelector('#f-src').addEventListener('change', (e) => { st.source = e.target.value; load(); });
  }
  await load();
}

async function customersView(main) {
  const { customers } = await api('/api/admin/customers');
  main.innerHTML = String(html`<div class="admin-head"><div><h1>Customers</h1><p class="muted">Registered customer accounts. Passwords are stored as salted hashes and are never shown.</p></div></div>
    <section class="panel">
      <div class="panel-title"><div><h2>${icon('user')} Accounts <span>(${customers.length})</span></h2></div></div>
      ${customers.length ? html`<div class="table-scroll"><table class="atable compact customers">
        <thead><tr><th>Name</th><th>Email</th><th>Registered</th><th>Orders</th><th>Last order</th></tr></thead>
        <tbody>${customers.map((c) => html`<tr><td data-label="Name"><b>${c.name}</b></td><td data-label="Email">${c.email}</td><td data-label="Registered">${fmtDateTime(c.createdAt)}</td><td data-label="Orders">${c.orders}</td><td data-label="Last order">${c.lastOrderAt ? fmtDateTime(c.lastOrderAt) : '—'}</td></tr>`)}</tbody>
      </table></div>` : html`<div class="empty small">${icon('user')}<p>No customers have registered yet.</p></div>`}
    </section>`);
}

const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const STATE_PILL = { active: 'green', inactive: 'grey', expired: 'red', scheduled: 'orange' };

async function offersView(main) {
  const { offers, products, images } = await api('/api/admin/offers');
  main.innerHTML = String(html`<div class="admin-head"><div><h1>Offer Configuration</h1><p class="muted">Change copy, products, discount and active/inactive status without touching checkout or product logic (PROMO-02, AT-08). Inactive or expired offers stay stored but are never shown or priced as active.</p></div></div>
    <p class="muted small">${icon('layers')} New offer variations (PROMO-03) reuse the same landing-page template: use <b>Duplicate as new variation</b> on any offer, then edit and activate it.</p>
    ${offers.map((o) => html`<form class="panel offer-form" data-offer="${o.id}">
      <div class="panel-title"><h2>${o.name} <span class="spill spill-${STATE_PILL[o.state] || 'grey'}">${o.state}</span>${o.featured ? html` <span class="mini-tag">featured</span>` : ''}</h2>
        ${o.state === 'active' ? html`<a class="btn btn-outline btn-sm" href="/offer/${o.slug}" target="_blank" rel="noopener">${icon('external')} Preview</a>` : ''}</div>
      <div class="fields three">
        <div class="field"><label>Status</label><div class="select-wrap"><select name="status"><option value="active" ${o.status === 'active' ? 'selected' : ''}>Active</option><option value="inactive" ${o.status === 'inactive' ? 'selected' : ''}>Inactive</option></select>${icon('chevD')}</div></div>
        <div class="field"><label>Discount</label><div class="pair"><div class="select-wrap"><select name="discountType" aria-label="Discount type"><option value="percent" ${o.discountType === 'percent' ? 'selected' : ''}>% off</option><option value="fixed" ${o.discountType === 'fixed' ? 'selected' : ''}>$ off each</option></select>${icon('chevD')}</div><input name="discountValue" type="number" min="0.01" step="0.01" aria-label="Discount amount" value="${o.discountType === 'fixed' ? (o.discountValue / 100).toFixed(2) : o.discountValue}" required></div></div>
        <div class="field check-field"><label><input type="checkbox" name="featured" ${o.featured ? 'checked' : ''}> Featured offer (home & nav)</label></div>
        <div class="field"><label>Starts</label><input name="startsAt" type="datetime-local" value="${toLocalInput(o.startsAt)}"></div>
        <div class="field"><label>Expires</label><input name="expiresAt" type="datetime-local" value="${toLocalInput(o.expiresAt)}"></div>
        <div class="field"><label>Offer URL slug</label><div class="prefix"><span>/offer/</span><input name="slug" value="${o.slug}" pattern="[a-z0-9]+(-[a-z0-9]+)*" required></div></div>
        <div class="field"><label>Offer name</label><input name="name" value="${o.name}" required maxlength="80"></div>
        <div class="field"><label>Campaign</label><input name="campaign" value="${o.campaign}" required maxlength="80"></div>
        <div class="field"><label>Source (id / label)</label><div class="pair"><input name="source" value="${o.source}" required pattern="[a-z0-9-]+"><input name="sourceLabel" value="${o.sourceLabel}" required maxlength="40"></div></div>
      </div>
      <div class="field"><label>Headline</label><input name="headline" value="${o.headline}" required maxlength="120"></div>
      <div class="field"><label>Hero image</label><div class="select-wrap"><select name="heroImage"><option value="" ${!o.heroImage ? 'selected' : ''}>Bundle product bottles (default)</option>${images.map((src) => html`<option value="${src}" ${o.heroImage === src ? 'selected' : ''}>${src.split('/').pop()}</option>`)}</select>${icon('chevD')}</div></div>
      <div class="field"><label>Sub-headline</label><textarea name="subheadline" rows="2" required maxlength="240">${o.subheadline}</textarea></div>
      <fieldset class="field"><legend>Bundle products</legend><div class="prod-picks">${products.map((p) => { const it = o.items.find((i) => i.productId === p.id); return html`<label class="pick"><input type="checkbox" name="item" value="${p.id}" ${it ? 'checked' : ''}><b>${p.name}</b>
        <span class="select-wrap"><select name="variant-${p.id}" aria-label="${p.name} variant">${p.variants.map((v) => html`<option value="${v.id}" ${it?.variantId === v.id ? 'selected' : ''}>${v.label}</option>`)}</select>${icon('chevD')}</span>
        <span class="qty-pick">Qty <input type="number" name="qty-${p.id}" min="1" max="5" value="${it?.qty || 1}" aria-label="${p.name} quantity"></span></label>`; })}</div></fieldset>
      <div class="form-actions"><span class="form-msg" aria-live="polite"></span><button class="btn btn-outline" type="button" data-duplicate="${o.id}">${icon('copy')} Duplicate as new variation</button><button class="btn btn-primary" type="submit">${icon('check')} Save offer</button></div>
    </form>`)}`);

  main.querySelectorAll('[data-offer]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const msg = form.querySelector('.form-msg');
    const items = fd.getAll('item').map((pid) => ({ productId: pid, variantId: fd.get(`variant-${pid}`), qty: Number(fd.get(`qty-${pid}`)) || 1 }));
    const dType = fd.get('discountType');
    const dRaw = Number(fd.get('discountValue'));
    const body = {
      status: fd.get('status'), featured: fd.get('featured') === 'on', discountType: dType, discountValue: dType === 'fixed' ? Math.round(dRaw * 100) : dRaw, heroImage: fd.get('heroImage'),
      startsAt: fd.get('startsAt') ? new Date(fd.get('startsAt')).toISOString() : null,
      expiresAt: fd.get('expiresAt') ? new Date(fd.get('expiresAt')).toISOString() : null,
      slug: fd.get('slug'), name: fd.get('name'), campaign: fd.get('campaign'), source: fd.get('source'), sourceLabel: fd.get('sourceLabel'),
      headline: fd.get('headline'), subheadline: fd.get('subheadline'), items,
    };
    try {
      await api(`/api/admin/offers/${form.dataset.offer}`, { method: 'PUT', body });
      data.reset();
      toast('Offer saved — storefront updated');
      await offersView(main);
    } catch (ex) { msg.textContent = ex.message; msg.className = 'form-msg err'; }
  }));
  main.querySelectorAll('[data-duplicate]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const { offer } = await api('/api/admin/offers', { method: 'POST', body: { fromId: b.dataset.duplicate } });
      toast(`Created ${offer.name} (inactive) — edit and activate it below`);
      await offersView(main);
      main.querySelector(`[data-offer="${offer.id}"]`)?.scrollIntoView({ behavior: 'smooth' });
    } catch (ex) { toast(ex.message, { tone: 'info' }); }
  }));
}

async function securityView(main) {
  const s = await api('/api/admin/security');
  main.innerHTML = String(html`<div class="admin-head"><div><h1>Access & Security</h1><p class="muted">Administrative functions are protected; public visitors cannot access this area (AT-07).</p></div><span class="auth-chip">${icon('lock')} Authorized access only</span></div>
    <div class="sec-grid">
      <section class="panel"><h2>${icon('user')} Current Session</h2>
        <dl class="kv"><dt>Signed in</dt><dd>${fmtDateTime(s.sessionStartedAt)}</dd><dt>From</dt><dd><code>${s.sessionIp}</code></dd><dt>Sessions</dt><dd>Signed, stateless cookies</dd><dt>Session lifetime</dt><dd>${s.sessionTtlHours} hours (HttpOnly, SameSite=Strict cookie)</dd><dt>Lockout</dt><dd>${s.lockout.maxFailures} failed attempts / ${s.lockout.windowMinutes} min</dd><dt>Password source</dt><dd>${s.credentialSource === 'env' ? 'ADMIN_PASSWORD environment variable' : s.credentialSource === 'admin' ? 'Set by an administrator' : 'Generated on first run'}</dd></dl>
        <div class="btn-row"><button class="btn btn-outline btn-sm" data-logout>${icon('logout')} Sign out</button><button class="btn btn-outline btn-sm" id="revoke">${icon('lock')} Sign out all sessions</button></div>
      </section>
      <section class="panel"><h2>${icon('lock')} Change Password</h2>
        <form id="pw-form" class="stack">
          <div class="field"><label for="cur">Current password</label><input id="cur" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="nxt">New password (min. 10 characters)</label><input id="nxt" type="password" autocomplete="new-password" minlength="10" required></div>
          <span class="form-msg" aria-live="polite"></span>
          <button class="btn btn-primary btn-sm" type="submit">Update password</button>
        </form>
        ${s.credentialSource === 'env' ? html`<p class="muted small">Currently using the ADMIN_PASSWORD environment variable. A password set here replaces it and signs out all sessions.</p>` : ''}
      </section>
      <section class="panel"><h2>${icon('flask')} Demo Data</h2>
        <p class="muted">Sample orders are created through the real pricing and order pipeline and are tagged “sample”. Clearing removes all test orders and events (order numbering continues).</p>
        <div class="btn-row"><button class="btn btn-outline btn-sm" id="sample">${icon('plus')} Load sample orders</button><button class="btn btn-danger btn-sm" id="clear">${icon('trash')} Clear all test data</button></div>
      </section>
      <section class="panel"><h2>${icon('list')} Recent Sign-in Attempts</h2>
        ${s.attempts.length ? html`<table class="atable compact"><thead><tr><th>Time</th><th>IP</th><th>Result</th></tr></thead><tbody>${s.attempts.map((a) => html`<tr><td>${fmtDateTime(a.ts)}</td><td><code>${a.ip}</code></td><td>${a.ok ? html`<span class="spill spill-green">Success</span>` : html`<span class="spill spill-red">Failed</span>`}</td></tr>`)}</tbody></table>` : html`<p class="muted">No attempts recorded.</p>`}
      </section>
    </div>`);
  main.querySelector('#revoke').addEventListener('click', async () => { await api('/api/admin/sessions/revoke', { method: 'POST', body: {} }); navigate('/admin'); });
  main.querySelector('#sample').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const r = await api('/api/admin/sample-data', { method: 'POST', body: {} }); toast(`Created ${r.created.length} sample test orders`); navigate('/admin/operations'); }
    catch (ex) { toast(ex.message, { tone: 'info' }); e.target.disabled = false; }
  });
  main.querySelector('#clear').addEventListener('click', async () => {
    if (!confirm('Delete ALL test orders and campaign events? This cannot be undone.')) return;
    await api('/api/admin/clear-test-data', { method: 'POST', body: {} });
    toast('All test data cleared'); securityView(main);
  });
  main.querySelector('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = e.target.querySelector('.form-msg');
    try {
      await api('/api/admin/password', { method: 'POST', body: { current: main.querySelector('#cur').value, next: main.querySelector('#nxt').value } });
      toast('Password updated — please sign in again'); navigate('/admin');
    } catch (ex) { msg.textContent = ex.message; msg.className = 'form-msg err'; }
  });
}
