import { html, icon, setTitle, offerBadge, money } from '../lib.js';
import { data, productCard, bindProductCards, breadcrumb, emptyState, heroProducts, scene } from '../components.js';

const SORTS = [
  ['featured', 'Featured'], ['price-asc', 'Price: Low to High'], ['price-desc', 'Price: High to Low'], ['name', 'Name: A–Z'],
];

export default async function shop(root, { query }) {
  setTitle('Shop All Products');
  const [products, offer, config] = await Promise.all([data.products(), data.featuredOffer(), data.config()]);
  const state = {
    q: query.get('q') || '',
    cat: query.get('cat') || 'all',
    sort: SORTS.some(([k]) => k === query.get('sort')) ? query.get('sort') : 'featured',
  };
  const chips = [{ id: 'all', label: 'All Products', icon: null }, ...config.categories];

  root.innerHTML = String(html`
  <section class="container page-top shop-page">
    ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Shop' }])}
    <div class="shop-head">
      <div><h1>Shop All Products</h1><p class="lead">Discover Cedar Bear's collection of alcohol-free herbal formulas — crafted for a healthy lifestyle, naturally.</p></div>
      ${offer ? html`<aside class="offer-teaser">
        ${scene('teaser')}
        <div class="ot-copy"><h2>Featured Offer</h2><p>Enter via a campaign (e.g., ${offer.sourceLabel}) to get a special discount.</p>
          <a class="btn btn-terra btn-sm" href="${offer.url}?utm_source=${offer.source}">View Offer ${icon('arrowR')}</a></div>
        <span class="pill-off">${offerBadge(offer)}</span>
        ${heroProducts(offer.items.slice(0, 2).map((i) => i.image.src))}
      </aside>` : ''}
    </div>
    <label class="search"><span class="sr-only">Search products</span>${icon('search')}<input type="search" id="q" placeholder="Search products (e.g., kava, chamomile, adrenal)" value="${state.q}" autocomplete="off"></label>
    <div class="filters">
      <div class="chips" role="tablist" aria-label="Categories">${chips.map((c) => html`<button type="button" role="tab" class="chip" data-cat="${c.id}" aria-selected="${state.cat === c.id}">${c.icon ? icon(c.icon) : ''}${c.label}</button>`)}</div>
      <label class="select-wrap"><span class="sr-only">Sort</span><select id="sort">${SORTS.map(([k, l]) => html`<option value="${k}" ${state.sort === k ? 'selected' : ''}>Sort: ${l}</option>`)}</select>${icon('chevD')}</label>
    </div>
    <p class="result-count" id="count" aria-live="polite"></p>
    <div class="pgrid pgrid-3" id="grid"></div>
  </section>`);

  const grid = root.querySelector('#grid');
  bindProductCards(grid, products);

  function draw() {
    const q = state.q.trim().toLowerCase();
    const bundles = state.cat === 'bundles';
    let list = products.filter((p) => {
      if (!bundles && state.cat !== 'all' && p.category !== state.cat) return false;
      if (bundles && !p.variants.some((v) => v.isBundle)) return false;
      if (!q) return true;
      return [p.name, p.shortDescription, p.categoryLabel, p.labelLine, ...(p.botanicals || [])].join(' ').toLowerCase().includes(q);
    });
    const priceOf = (p) => (bundles ? p.variants.find((v) => v.isBundle) : p.variants[0]).priceCents;
    if (state.sort === 'price-asc') list = list.slice().sort((a, b) => priceOf(a) - priceOf(b));
    if (state.sort === 'price-desc') list = list.slice().sort((a, b) => priceOf(b) - priceOf(a));
    if (state.sort === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    const showOfferCard = bundles && offer && (!q || offer.name.toLowerCase().includes(q) || offer.items.some((i) => i.name.toLowerCase().includes(q)));
    const cards = list.map((p) => productCard(p, { showDesc: true, preset: bundles ? p.variants.find((v) => v.isBundle).id : undefined }));
    grid.innerHTML = String(html`${showOfferCard ? html`<article class="pcard pcard-offer">
        <a class="pcard-img" href="${offer.url}"><img src="${offer.heroImage || offer.items[0].image.src}" alt="${offer.name}" loading="lazy"></a>
        <div class="pcard-body"><span class="tag tag-offer">${icon('tag')} Campaign bundle</span><h3><a href="${offer.url}">${offer.name}</a></h3>
          <div class="pcard-price"><span class="price">${money(offer.offerTotal)}</span><s>${money(offer.regularTotal)}</s></div>
          <p class="pcard-desc">${offer.items.length} formulas · ${offerBadge(offer)} for a limited time.</p>
          <a class="btn btn-terra btn-sm" href="${offer.url}">View Offer ${icon('arrowR')}</a></div></article>` : ''}${cards}`);
    const total = list.length + (showOfferCard ? 1 : 0);
    root.querySelector('#count').textContent = `${total} ${total === 1 ? 'result' : 'results'}`;
    if (!total) grid.innerHTML = String(emptyState('No products found', 'Try a different search term or category.', html`<button class="btn btn-outline" data-reset>Clear filters</button>`));
    const qs = new URLSearchParams();
    if (state.q) qs.set('q', state.q);
    if (state.cat !== 'all') qs.set('cat', state.cat);
    if (state.sort !== 'featured') qs.set('sort', state.sort);
    history.replaceState({}, '', `/shop${qs.toString() ? `?${qs}` : ''}`);
  }

  let t;
  root.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; draw(); }, 150); });
  root.querySelector('#sort').addEventListener('change', (e) => { state.sort = e.target.value; draw(); });
  root.querySelector('.chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    state.cat = b.dataset.cat;
    root.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-selected', String(c === b)));
    draw();
  });
  grid.addEventListener('click', (e) => {
    if (!e.target.closest('[data-reset]')) return;
    Object.assign(state, { q: '', cat: 'all', sort: 'featured' });
    root.querySelector('#q').value = ''; root.querySelector('#sort').value = 'featured';
    root.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-selected', String(c.dataset.cat === 'all')));
    draw();
  });
  draw();
}
