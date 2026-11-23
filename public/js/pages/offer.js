import { html, icon, money, setTitle, api, offerBadge, toast, stars } from '../lib.js';
import { data, scene, heroProducts } from '../components.js';
import { cart, track, setAttribution } from '../state.js';
import { navigate } from '../app.js';

export default async function offerPage(root, { params, query }) {
  let slug = params[0];
  if (!slug) {
    const f = await data.featuredOffer();
    if (f) { navigate(`${f.url}${location.search}`, { replace: true }); return; }
  }
  let offer = null;
  let inactive = false;
  if (slug) {
    try { offer = (await api(`/api/offers/${slug}`)).offer; } catch (e) { inactive = Boolean(e.data?.inactive); }
  }
  if (!offer) {
    setTitle('Offer unavailable');
    root.innerHTML = String(html`<section class="container narrow center pad-xl offer-gone">
      ${icon('tag', 'big-ic')}<h1>${inactive ? 'This offer has ended' : 'No active offer'}</h1>
      <p>${inactive ? 'This campaign offer is no longer active, so its discount can’t be applied.' : 'There’s no campaign offer running right now.'} You can still shop our full catalog at regular prices.</p>
      <a class="btn btn-primary" href="/shop">${icon('bag')} Browse Catalog</a></section>`);
    return;
  }

  setTitle('Promotional Offer');
  // Attribution: explicit ?utm_source wins, otherwise the offer's configured channel.
  const source = query.get('utm_source') || query.get('src') || offer.source;
  setAttribution({ source, campaign: offer.campaign, offerId: offer.id, landingPath: location.pathname + location.search });
  track('landing_visit', { source, campaign: offer.campaign, offerId: offer.id, label: `Visited ${offer.campaign} landing page` });

  const shareUrl = `${location.origin}${offer.url}?utm_source=${offer.source}`;
  root.innerHTML = String(html`
  <section class="offer-hero">
    ${scene()}
    <div class="container offer-hero-grid">
      <div class="offer-copy">
        <div class="src-chips">
          <span class="src-chip">${icon('music')} Source: <b>${offer.sourceLabel}</b></span>
          <button type="button" class="src-chip" id="copy-url" title="Copy shareable offer link">${icon('link')} Offer URL: <u>${offer.url}</u></button>
        </div>
        <h1>${offer.headline}</h1>
        <p class="lead">${offer.subheadline}</p>
        <button class="btn btn-primary btn-xl" id="claim">${icon('tag')} Claim This Offer ${icon('arrowR')}</button>
        <p class="claim-note">Bundle of ${offer.items.length}: <s>${money(offer.regularTotal)}</s> <b>${money(offer.offerTotal)}</b> with this offer</p>
      </div>
      <div class="offer-art">
        <span class="burst">${offer.discountType === 'percent' ? html`<b>${offer.discountValue}%</b><span>OFF</span>` : html`<b>${money(offer.discountValue)}</b><span>OFF</span>`}</span>
        ${offer.heroImage ? html`<div class="hero-products single"><img class="hp" src="${offer.heroImage}" alt="${offer.name}"><div class="stone"></div></div>` : heroProducts(offer.items.map((i) => i.image.src))}
      </div>
    </div>
  </section>

  <section class="container">
    <div class="highlights">${offer.highlights.map((h) => html`<details class="hl"><summary><span class="hl-ic">${icon(h.icon)}</span><span class="hl-txt"><b>${h.title}</b><span>${h.text}</span></span>${icon('chevR', 'hl-chev')}</summary><p>${h.text}</p></details>`)}</div>

    <div class="offer-grid">
      <div class="panel offer-details">
        <h2>${icon('info')} Offer Details</h2>
        <dl class="kv kv-split">
          <dt>Discount</dt><dd><span class="pill pill-terra">${offerBadge(offer)}</span></dd>
          <dt>Campaign</dt><dd>${offer.campaign}</dd>
          <dt>Offer URL</dt><dd>${offer.url}</dd>
          <dt>Bundle price</dt><dd><s class="muted">${money(offer.regularTotal)}</s> <b>${money(offer.offerTotal)}</b></dd>
          <dt>Availability</dt><dd><span class="pill pill-green"><i class="dot"></i> Active</span></dd>
        </dl>
      </div>
      <div class="panel bundle-contents">
        <h2>${icon('layers')} Bundle Contents <span>(${offer.items.length} Items)</span></h2>
        <ul>${offer.items.map((i) => html`<li>
          <a class="bc-img" href="/product/${i.slug}?offer=${offer.slug}"><img src="${i.image.src}" alt=""></a>
          <div><a href="/product/${i.slug}?offer=${offer.slug}"><b>${i.name}</b></a><span>${i.note}</span></div>
          <div class="bc-price"><s>${money(i.regularCents)}</s><b>${money(i.offerCents)}</b></div>
        </li>`)}</ul>
      </div>
    </div>

    ${offer.testimonials?.length ? html`<section class="testimonials"><h2>${icon('message')} What Customers Are Saying</h2>
      <div class="t-grid">${offer.testimonials.map((t) => html`<figure class="panel"><blockquote>“${t.text}”</blockquote>${stars(t.rating || 5)}<figcaption>— ${t.author}</figcaption></figure>`)}</div></section>` : ''}

    <div class="config-note">${icon('gear')}<p><b>Admin / Configuration Note:</b> Only active (non-expired) offers are shown to customers. Inactive or expired offers are automatically hidden from the landing page.
      <span class="cn-meta">Current Offer Status: <span class="pill pill-green">Active</span> <span class="sep">|</span> Expires: ${offer.expiresAt ? new Date(offer.expiresAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'No expiry'}</span></p></div>
  </section>`);

  root.querySelector('#claim').addEventListener('click', () => {
    offer.items.forEach((i) => cart.add({ productId: i.productId, variantId: i.variantId, qty: i.qty, offerId: offer.id }));
    track('add_to_cart', { source, campaign: offer.campaign, offerId: offer.id, productId: offer.items[0].productId, label: `Claimed ${offer.name} — added ${offer.items.length} items to cart` });
    toast(`${offer.name} added to your cart`);
    navigate('/cart');
  });
  root.querySelector('#copy-url').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast('Shareable offer link copied'); } catch { toast(shareUrl, { tone: 'info' }); }
  });
}
