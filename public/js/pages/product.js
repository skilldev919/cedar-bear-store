import { html, icon, money, pctOff, setTitle, api, offerBadge, stars } from '../lib.js';
import { data, breadcrumb, qtyStepper, addToCart } from '../components.js';
import { track, attribution } from '../state.js';

export default async function product(root, { params, query }) {
  let p;
  try {
    p = (await api(`/api/products/${params[0]}`)).product;
  } catch {
    setTitle('Product not found');
    root.innerHTML = String(html`<section class="container narrow center pad-xl"><h1>Product not found</h1><p>This product isn't available.</p><a class="btn btn-primary" href="/shop">Browse Catalog</a></section>`);
    return;
  }
  setTitle(p.name);
  const [config, featured] = await Promise.all([data.config(), data.featuredOffer()]);

  // Campaign path (SALE-02): arriving from an offer page (?offer=slug) unlocks that offer's price for covered variants.
  const offerSlug = query.get('offer');
  let viaOffer = null;
  if (offerSlug) viaOffer = await api(`/api/offers/${encodeURIComponent(offerSlug)}`).then((r) => r.offer).catch(() => null);
  const offerFor = (variantId) => (viaOffer && viaOffer.items.some((i) => i.productId === p.id && i.variantId === variantId) ? viaOffer : null);
  const inCampaign = p.offers.length > 0;
  const otherOffer = !viaOffer && featured && featured.items.some((i) => i.productId === p.id) ? featured : null;

  const st = { img: 0, variant: (p.variants.find((v) => v.id === query.get('variant')) || p.variants[0]).id, qty: 1 };
  const duo = p.variants.find((v) => v.isBundle);
  const max = config.maxQtyPerLine;
  const fs = config.shipping;

  root.innerHTML = String(html`
  <section class="container page-top product-page">
    <div class="pp-top">
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Shop', href: '/shop' }, { label: p.name }])}
      <div class="access-chip">${icon('pin')} Accessible from: <b>Storefront</b> <span class="code code-green">SALE-01</span>${inCampaign ? html` or <b>Campaign Offer</b> <span class="code code-terra">SALE-02</span>` : ''}</div>
    </div>
    <div class="pp-title"><h1>${p.name}</h1><span class="code code-green">SALE-01</span>${inCampaign ? html`<span class="code code-terra">SALE-02</span>` : ''}</div>
    ${viaOffer ? html`<div class="notice notice-offer">${icon('tag')} <span>You're shopping via <b>${viaOffer.name}</b> (${viaOffer.sourceLabel}) — campaign price applied: <b>${offerBadge(viaOffer)}</b>.</span> <a href="${viaOffer.url}">Back to offer</a></div>` : ''}

    <div class="pp-grid">
      <div class="gallery">
        <div class="gallery-main">
          <img id="main-img" src="${p.images[0].src}" alt="${p.images[0].alt}">
          <button class="g-zoom" type="button" aria-label="Zoom image">${icon('zoom')}</button>
          ${p.images.length > 1 ? html`<button class="g-nav g-prev" type="button" aria-label="Previous image">${icon('chevL')}</button><button class="g-nav g-next" type="button" aria-label="Next image">${icon('chevR')}</button>` : ''}
          <div class="g-dots">${p.images.map((_, i) => html`<span class="${i === 0 ? 'on' : ''}"></span>`)}</div>
        </div>
        <div class="thumbs">${p.images.map((im, i) => html`<button type="button" class="thumb ${i === 0 ? 'on' : ''}" data-img="${i}" aria-label="Show image ${i + 1}"><img src="${im.src}" alt=""></button>`)}</div>
      </div>

      <div class="buybox">
        <div class="pp-price" id="price"></div>
        <p class="pp-desc">${p.description}</p>
        <div class="form-row"><label for="variant">Variant:</label>
          <div class="select-wrap"><select id="variant">${p.variants.map((v) => html`<option value="${v.id}" ${v.id === st.variant ? 'selected' : ''}>${v.label}</option>`)}</select>${icon('chevD')}</div></div>
        <div class="form-row"><label>Quantity:</label><div id="qty">${qtyStepper(1, { max })}</div></div>
        <button class="btn btn-primary btn-xl btn-block" id="add">${icon('bag')} Add to Cart</button>
        ${duo ? html`<div class="bundle-card">
          <h3>${icon('tag')} Bundle & Save More</h3>
          <button type="button" class="bundle-row" id="pick-duo">
            <span class="duo-imgs"><img src="${p.images[0].src}" alt=""><span class="plus">${icon('plus')}</span><img src="${p.images[0].src}" alt=""></span>
            <span class="duo-copy"><b>${p.name} Duo Pack</b><span>(${duo.short})</span><em>Stock up on your daily routine.</em>
              <span class="duo-price"><span class="price">${money(duo.priceCents)}</span>${duo.compareAtCents ? html`<s>${money(duo.compareAtCents)}</s><span class="save">Save ${pctOff(duo.compareAtCents, duo.priceCents)}%</span>` : ''}</span></span>
            ${icon('chevR')}
          </button>
        </div>` : ''}
        ${otherOffer ? html`<a class="offer-mini" href="${otherOffer.url}?utm_source=${otherOffer.source}">${icon('tag')}<span><b>Also in ${otherOffer.name}</b> — ${offerBadge(otherOffer)} as part of the ${otherOffer.sourceLabel} campaign bundle.</span>${icon('chevR')}</a>` : ''}
      </div>
    </div>

    <div class="info-cards">
      <div class="info-card"><h3>${icon('bag')} Product Details</h3><dl class="kv">${p.details.map(([k, v]) => html`<dt>${k}:</dt><dd>${v}</dd>`)}</dl></div>
      <div class="info-card"><h3>${icon('leaf')} Key Features</h3><ul class="checks">${p.features.map((f) => html`<li>${icon('checkCircle')}${f}</li>`)}</ul>
        ${p.botanicals?.length ? html`<p class="botanicals"><span>Botanicals pictured:</span> ${p.botanicals.join(' · ')}</p>` : ''}</div>
      <div class="info-card ship-card"><h3>${icon('truck')} Shipping</h3>
        <p><b>Free standard shipping</b> on orders ${money(fs.freeShippingThresholdCents)}+</p>
        <ul class="plain">${fs.methods.map((m) => html`<li>${m.label.replace(' (Demo)', '')}: ${money(m.priceCents)}<br><small>${m.eta}</small></li>`)}</ul></div>
      <div class="info-card"><h3>${icon('star')} Customer Reviews</h3>
        ${p.reviews.length ? html`<p class="rating">${stars(p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length)} <b>${(p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length).toFixed(1)}</b> (${p.reviews.length} reviews)</p>
          ${p.reviews.slice(0, 2).map((r) => html`<blockquote>“${r.text}”<footer>${icon('checkCircle')} — ${r.author}</footer></blockquote>`)}`
        : html`<p class="muted">No reviews yet. Verified customer reviews will appear here once published.</p>`}</div>
    </div>
  </section>
  <dialog class="lightbox" id="lightbox"><button class="lb-close" type="button" aria-label="Close">${icon('x')}</button><img alt=""></dialog>`);

  const $ = (s) => root.querySelector(s);
  function drawPrice() {
    const v = p.variants.find((x) => x.id === st.variant);
    const off = offerFor(v.id);
    const now = off ? (off.items.find((i) => i.productId === p.id && i.variantId === v.id).offerCents) : v.priceCents;
    const was = off ? v.priceCents : v.compareAtCents;
    $('#price').innerHTML = String(html`<span class="price">${money(now)}</span>${was ? html`<s>${money(was)}</s><span class="save">Save ${pctOff(was, now)}%</span>` : ''}${off ? html`<span class="tag tag-offer">${icon('tag')} Campaign price</span>` : ''}
      ${v.units > 1 ? html`<small class="per">${money(Math.round(now / v.units))} per bottle</small>` : ''}`);
    const pick = $('#pick-duo');
    if (pick) pick.classList.toggle('on', v.isBundle);
  }
  function showImg(i) {
    st.img = (i + p.images.length) % p.images.length;
    const im = p.images[st.img];
    Object.assign($('#main-img'), { src: im.src, alt: im.alt });
    root.querySelectorAll('.thumb').forEach((t, k) => t.classList.toggle('on', k === st.img));
    root.querySelectorAll('.g-dots span').forEach((t, k) => t.classList.toggle('on', k === st.img));
  }
  function setQty(q) {
    st.qty = Math.max(1, Math.min(max, Math.floor(q) || 1));
    $('#qty').innerHTML = String(qtyStepper(st.qty, { max }));
  }

  $('#variant').addEventListener('change', (e) => { st.variant = e.target.value; drawPrice(); });
  root.querySelector('.g-prev')?.addEventListener('click', () => showImg(st.img - 1));
  root.querySelector('.g-next')?.addEventListener('click', () => showImg(st.img + 1));
  root.querySelector('.thumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-img]'); if (b) showImg(Number(b.dataset.img)); });
  const lb = $('#lightbox');
  root.querySelector('.g-zoom').addEventListener('click', () => { lb.querySelector('img').src = p.images[st.img].src; lb.querySelector('img').alt = p.images[st.img].alt; lb.showModal(); });
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.closest('.lb-close')) lb.close(); });
  $('#qty').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) setQty(st.qty + Number(b.dataset.step)); });
  $('#qty').addEventListener('change', (e) => setQty(Number(e.target.value)));
  $('#pick-duo')?.addEventListener('click', () => {
    st.variant = duo.id; $('#variant').value = duo.id; drawPrice();
    $('#add').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#add').addEventListener('click', () => addToCart(p, st.variant, st.qty, offerFor(st.variant)));

  drawPrice();
  const a = attribution();
  track('product_view', { productId: p.id, offerId: viaOffer ? viaOffer.id : a.offerId, label: `Viewed ${p.name}${viaOffer ? ` via ${viaOffer.name}` : ''}` });
}
