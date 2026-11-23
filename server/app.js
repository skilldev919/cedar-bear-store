'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { HttpError, send, readJson } = require('./http');
const { Catalog } = require('./catalog');
const { Offers } = require('./offers');
const { createPricing } = require('./pricing');
const { SimulatedPaymentProvider } = require('./payment');
const { Orders, ORDER_STATUSES, US_STATES } = require('./orders');
const { Events, EVENT_TYPES } = require('./events');
const { Auth } = require('./auth');
const { Accounts, publicUser } = require('./accounts');
const reports = require('./reports');
const { syncIn, flush } = require('./store');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function createApp({ root = path.join(__dirname, '..'), dataDir, runtimeDir, adminPassword, secureCookies, sessionSecret } = {}) {
  dataDir = dataDir || path.join(root, 'data');
  // Serverless hosts (Vercel) only allow writes under /tmp; Redis is used there when configured.
  runtimeDir = runtimeDir || (process.env.VERCEL ? path.join(require('os').tmpdir(), 'cedarbear-runtime') : path.join(dataDir, 'runtime'));
  const publicDir = path.join(root, 'public');
  const settings = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));

  const catalog = new Catalog(path.join(dataDir, 'products.json'));
  const offers = new Offers(path.join(dataDir, 'offers.json'), catalog);
  const pricing = createPricing({ catalog, offers, settings });
  const events = new Events(path.join(runtimeDir, 'events.json'));
  const orders = new Orders(path.join(runtimeDir, 'orders.json'), { pricing, payment: new SimulatedPaymentProvider(), events, offers, settings });
  const auth = new Auth(path.join(runtimeDir, 'auth.json'), { envPassword: adminPassword, secureCookies, sessionSecret });
  const accounts = new Accounts(path.join(runtimeDir, 'users.json'), { secret: () => auth.customerSecret(), secureCookies });

  const publicProduct = (p) => {
    const { active, ...rest } = p;
    const offerList = offers.all().filter((o) => offers.isActive(o) && o.items.some((i) => i.productId === p.id))
      .map((o) => ({ id: o.id, slug: o.slug, name: o.name, discountType: o.discountType, discountValue: o.discountValue,
        variantIds: o.items.filter((i) => i.productId === p.id).map((i) => i.variantId) }));
    return { ...rest, offers: offerList };
  };

  const adminOrder = (o) => { const { token, idempotencyKey, ...rest } = o; return rest; };

  // ---- Route table -------------------------------------------------------
  const routes = [];
  const on = (method, pattern, handler, { admin = false } = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, handler, admin });
  };

  // Public storefront API
  on('GET', '/api/config', () => ({
    currency: settings.currency, maxQtyPerLine: settings.maxQtyPerLine, shipping: settings.shipping,
    paymentMethods: settings.paymentMethods, categories: catalog.categories, states: US_STATES,
  }));
  on('GET', '/api/products', () => ({ products: catalog.all().sort((a, b) => a.featuredRank - b.featuredRank).map(publicProduct) }));
  on('GET', '/api/products/:slug', ({ params }) => {
    const p = catalog.bySlug(params.slug);
    if (!p) throw new HttpError(404, 'Product not found');
    return { product: publicProduct(p) };
  });
  on('GET', '/api/offers/featured', () => {
    const o = offers.featured();
    return { offer: o ? offers.publicView(o) : null };
  });
  on('GET', '/api/offers/:slug', ({ params }) => {
    const o = offers.bySlug(params.slug);
    // Inactive / expired / unknown offers are never presented as active (PROMO-02, AT-05).
    if (!o || !offers.isActive(o)) throw new HttpError(404, 'This offer is not currently available', { inactive: Boolean(o) });
    return { offer: offers.publicView(o) };
  });
  // Customer accounts (registration / login). Shopping features below require a logged-in customer.
  on('POST', '/api/account/register', async ({ req, res }) => {
    const user = await accounts.register(await readJson(req));
    res.setHeader('Set-Cookie', accounts.issue(user));
    return { user: publicUser(user) };
  });
  on('POST', '/api/account/login', async ({ req, res }) => {
    const user = await accounts.login(req, await readJson(req));
    res.setHeader('Set-Cookie', accounts.issue(user));
    return { user: publicUser(user) };
  });
  on('POST', '/api/account/logout', ({ res }) => { res.setHeader('Set-Cookie', accounts.logout()); return { ok: true }; });
  on('GET', '/api/account/me', ({ req }) => {
    const u = accounts.session(req);
    if (!u) throw new HttpError(401, 'Not logged in', { loginRequired: true });
    return { user: u };
  });

  on('POST', '/api/cart/quote', async ({ req }) => { accounts.require(req); return pricing.quote(await readJson(req)); });
  on('POST', '/api/orders', async ({ req }) => {
    const account = accounts.require(req);
    const order = await orders.create(await readJson(req), { account });
    return { orderId: order.id, token: order.token, order: await orders.publicView(order.id, order.token) };
  });
  on('GET', '/api/orders/:id', async ({ req, params, url }) => { accounts.require(req); return { order: await orders.publicView(params.id, url.searchParams.get('token')) }; });
  on('POST', '/api/events', async ({ req }) => { const e = await events.record(await readJson(req)); return { ok: true, id: e.id }; });

  // Admin auth
  on('POST', '/api/admin/login', async ({ req, res }) => {
    const body = await readJson(req);
    res.setHeader('Set-Cookie', await auth.login(req, body.password));
    return { ok: true };
  });
  on('POST', '/api/admin/logout', ({ req, res }) => { res.setHeader('Set-Cookie', auth.logout()); return { ok: true }; });
  on('GET', '/api/admin/me', ({ session }) => ({ ok: true, since: new Date(session.createdAt).toISOString() }), { admin: true });

  // Admin operations
  on('GET', '/api/admin/dashboard', async () => ({ kpis: reports.dashboard(await orders.all(), await events.all()) }), { admin: true });
  on('GET', '/api/admin/orders', async () => ({
    orders: (await orders.all()).slice().reverse().map(adminOrder), statuses: ORDER_STATUSES,
  }), { admin: true });
  on('GET', '/api/admin/orders.csv', async ({ url, res }) => {
    const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
    const list = (await orders.all()).filter((o) => !ids.length || ids.includes(o.id));
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cedar-bear-test-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store', ...SECURITY_HEADERS,
    });
    res.end(reports.ordersCsv(list));
  }, { admin: true });
  on('GET', '/api/admin/orders/:id', async ({ params }) => {
    const o = await orders.get(params.id);
    if (!o) throw new HttpError(404, 'Order not found');
    const sid = o.attribution?.sessionId;
    return { order: adminOrder(o), events: sid ? await events.forSession(sid) : [] };
  }, { admin: true });
  on('PATCH', '/api/admin/orders/:id', async ({ req, params }) => {
    const body = await readJson(req);
    return { order: adminOrder(await orders.setStatus(params.id, body.orderStatus)) };
  }, { admin: true });
  on('GET', '/api/admin/events', async ({ url }) => {
    const type = url.searchParams.get('type');
    const source = url.searchParams.get('source');
    const all = await events.all();
    let list = all;
    if (type) list = list.filter((e) => e.type === type);
    if (source) list = list.filter((e) => e.source === source);
    return {
      events: list.slice(-500).reverse(), total: list.length, types: EVENT_TYPES,
      sources: [...new Set(all.map((e) => e.source))], funnel: reports.funnel(all),
    };
  }, { admin: true });
  on('GET', '/api/admin/offers', () => ({
    offers: offers.all().map((o) => ({ ...o, state: offers.publicView(o).state })),
    products: catalog.all().map((p) => ({ id: p.id, name: p.name, variants: p.variants.map((v) => ({ id: v.id, label: v.label })) })),
    images: offers.imageLibrary(),
  }), { admin: true });
  on('POST', '/api/admin/offers', async ({ req }) => {
    const body = await readJson(req);
    const o = offers.create(String(body.fromId || ''));
    return { offer: { ...o, state: offers.publicView(o).state } };
  }, { admin: true });
  on('PUT', '/api/admin/offers/:id', async ({ req, params }) => {
    const o = offers.update(params.id, await readJson(req));
    return { offer: { ...o, state: offers.publicView(o).state } };
  }, { admin: true });
  on('GET', '/api/admin/customers', async () => {
    const [list, all] = await Promise.all([accounts.list(), orders.all()]);
    return { customers: list.map((c) => {
      const mine = all.filter((o) => o.account?.id === c.id);
      return { ...c, orders: mine.length, lastOrderAt: mine.length ? mine.map((o) => o.createdAt).sort().pop() : null };
    }) };
  }, { admin: true });
  on('GET', '/api/admin/security', ({ session }) => auth.securityInfo(session), { admin: true });
  on('POST', '/api/admin/password', async ({ req, res }) => {
    const b = await readJson(req);
    auth.changePassword(b.current, b.next);
    res.setHeader('Set-Cookie', auth.cookie('', 0));
    return { ok: true };
  }, { admin: true });
  on('POST', '/api/admin/sessions/revoke', ({ res }) => { auth.revokeAll(); res.setHeader('Set-Cookie', auth.cookie('', 0)); return { ok: true }; }, { admin: true });
  on('POST', '/api/admin/sample-data', async () => ({ created: await reports.loadSampleData({ orders, events, offers }) }), { admin: true });
  on('POST', '/api/admin/clear-test-data', async () => { await orders.clear(); await events.clear(); return { ok: true }; }, { admin: true });

  // ---- Static files + SPA fallback --------------------------------------
  const indexHtml = () => fs.readFileSync(path.join(publicDir, 'index.html'));
  function serveStatic(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir + path.sep)) return send(res, 403, 'Forbidden');
    fs.stat(file, (err, st) => {
      if (!err && st.isFile()) {
        const ext = path.extname(file).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': ext === '.webp' || ext === '.png' ? 'public, max-age=86400' : 'no-cache',
          ...SECURITY_HEADERS,
        });
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(file).pipe(res);
      }
      if (path.extname(rel)) return send(res, 404, 'Not found', SECURITY_HEADERS);
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
      res.end(req.method === 'HEAD' ? undefined : indexHtml());
    });
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
        return serveStatic(req, res, url.pathname === '/' ? '/index.html' : url.pathname);
      }
      await syncIn();
      let matched = false;
      for (const r of routes) {
        const m = url.pathname.match(r.re);
        if (!m) continue;
        matched = true;
        if (r.method !== req.method) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const session = r.admin ? auth.require(req) : auth.session(req);
        const out = await r.handler({ req, res, url, params, session });
        await flush();
        if (!res.headersSent && !res.writableEnded) send(res, 200, out, SECURITY_HEADERS);
        return;
      }
      throw new HttpError(matched ? 405 : 404, matched ? 'Method not allowed' : 'Not found');
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      const status = err instanceof HttpError ? err.status : 500;
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'Internal server error' : err.message, ...(err.extra || {}) }, SECURITY_HEADERS);
    }
  }

  return { server: http.createServer(handler), handler, auth, accounts, orders, events, offers, catalog, pricing };
}

module.exports = { createApp };
