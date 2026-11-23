'use strict';
// Offer configuration module (PROMO-01/02/03, CART-02, AT-05, AT-08).
const { JsonFile } = require('./store');
const { HttpError } = require('./http');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function offerState(offer, now = Date.now()) {
  if (!offer) return 'invalid';
  if (offer.status !== 'active') return 'inactive';
  if (offer.startsAt && now < Date.parse(offer.startsAt)) return 'scheduled';
  if (offer.expiresAt && now > Date.parse(offer.expiresAt)) return 'expired';
  return 'active';
}

function discountedUnit(regularCents, offer) {
  if (offer.discountType === 'fixed') return Math.max(0, regularCents - offer.discountValue);
  // percent — integer arithmetic, rounded half-up to the cent
  return Math.round((regularCents * (100 - offer.discountValue)) / 100);
}

function covers(offer, productId, variantId) {
  return offer.items.some((it) => it.productId === productId && (!it.variantId || it.variantId === variantId));
}

class Offers {
  constructor(file, catalog) {
    this.src = new JsonFile(file, { offers: [] }, { remoteKey: 'offers' });
    this.catalog = catalog;
  }
  all() { return this.src.read().offers; }
  get(id) { return this.all().find((o) => o.id === id) || null; }
  bySlug(slug) { return this.all().find((o) => o.slug === slug) || null; }
  isActive(offer, now) { return offerState(offer, now) === 'active'; }
  featured(now) {
    const active = this.all().filter((o) => this.isActive(o, now));
    return active.find((o) => o.featured) || active[0] || null;
  }

  /** Public (storefront) representation — only ever produced for active offers. */
  publicView(offer, now = Date.now()) {
    const items = offer.items.map((it) => {
      const p = this.catalog.get(it.productId);
      const v = this.catalog.variant(p, it.variantId);
      if (!p || !v) return null;
      return {
        productId: p.id, slug: p.slug, name: p.name, variantId: v.id, variantLabel: v.label,
        qty: it.qty || 1, note: it.note || p.shortDescription, image: p.images[0],
        regularCents: v.priceCents, offerCents: discountedUnit(v.priceCents, offer),
      };
    }).filter(Boolean);
    const regularTotal = items.reduce((s, i) => s + i.regularCents * i.qty, 0);
    const offerTotal = items.reduce((s, i) => s + i.offerCents * i.qty, 0);
    const { id, slug, name, campaign, source, sourceLabel, headline, subheadline, discountType,
      discountValue, startsAt, expiresAt, heroImage, highlights, testimonials, featured } = offer;
    return {
      id, slug, name, campaign, source, sourceLabel, headline, subheadline, discountType, discountValue,
      startsAt, expiresAt, heroImage, highlights, testimonials, featured,
      state: offerState(offer, now), url: `/offer/${slug}`, items, regularTotal, offerTotal,
    };
  }

  /** Admin update — validated so a bad edit can never produce an invalid discount. */
  update(id, patch) {
    const data = this.src.read();
    const offer = data.offers.find((o) => o.id === id);
    if (!offer) throw new HttpError(404, 'Offer not found');
    const next = { ...offer };
    const str = (k, max) => {
      if (patch[k] === undefined) return;
      if (typeof patch[k] !== 'string' || !patch[k].trim() || patch[k].length > max) throw new HttpError(400, `Invalid ${k}`);
      next[k] = patch[k].trim();
    };
    str('name', 80); str('campaign', 80); str('headline', 120); str('subheadline', 240); str('sourceLabel', 40);
    if (patch.source !== undefined) {
      if (typeof patch.source !== 'string' || !SLUG_RE.test(patch.source)) throw new HttpError(400, 'Invalid source');
      next.source = patch.source;
    }
    if (patch.slug !== undefined) {
      if (typeof patch.slug !== 'string' || !SLUG_RE.test(patch.slug) || patch.slug.length > 60) throw new HttpError(400, 'Invalid URL slug');
      if (data.offers.some((o) => o.id !== id && o.slug === patch.slug)) throw new HttpError(400, 'URL slug already used');
      next.slug = patch.slug;
    }
    if (patch.status !== undefined) {
      if (!['active', 'inactive'].includes(patch.status)) throw new HttpError(400, 'Invalid status');
      next.status = patch.status;
    }
    if (patch.featured !== undefined) next.featured = Boolean(patch.featured);
    if (patch.discountType !== undefined) {
      if (!['percent', 'fixed'].includes(patch.discountType)) throw new HttpError(400, 'Invalid discount type');
      next.discountType = patch.discountType;
    }
    if (patch.discountValue !== undefined) next.discountValue = patch.discountValue;
    if (!Number.isInteger(next.discountValue) || next.discountValue < 1 ||
        (next.discountType === 'percent' && next.discountValue > 90) ||
        (next.discountType === 'fixed' && next.discountValue > 100000)) {
      throw new HttpError(400, 'Discount must be a whole number (1–90 %, or fixed cents)');
    }
    for (const k of ['startsAt', 'expiresAt']) {
      if (patch[k] === undefined) continue;
      if (patch[k] === null || patch[k] === '') { next[k] = null; continue; }
      if (typeof patch[k] !== 'string' || Number.isNaN(Date.parse(patch[k]))) throw new HttpError(400, `Invalid ${k}`);
      next[k] = new Date(patch[k]).toISOString();
    }
    if (next.startsAt && next.expiresAt && Date.parse(next.startsAt) >= Date.parse(next.expiresAt)) {
      throw new HttpError(400, 'Expiry must be after start');
    }
    if (patch.items !== undefined) {
      if (!Array.isArray(patch.items) || patch.items.length < 1 || patch.items.length > 10) throw new HttpError(400, 'Offer needs 1–10 products');
      next.items = patch.items.map((it) => {
        const p = this.catalog.get(it.productId);
        const v = this.catalog.variant(p, it.variantId);
        const qty = it.qty === undefined ? 1 : it.qty;
        if (!p || !v || !Number.isInteger(qty) || qty < 1 || qty > 5) throw new HttpError(400, 'Invalid offer product');
        const prev = offer.items.find((o) => o.productId === p.id);
        return { productId: p.id, variantId: v.id, qty, note: prev?.note || p.shortDescription };
      });
    }
    if (next.featured) data.offers.forEach((o) => { if (o.id !== id) o.featured = false; });
    Object.assign(offer, next);
    this.src.write(data);
    return offer;
  }
}

module.exports = { Offers, offerState, discountedUnit, covers };
