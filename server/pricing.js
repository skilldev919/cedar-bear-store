'use strict';
// Server-side pricing engine (CART-01/02, AT-04, AT-05).
// All money is integer cents. Browser-supplied prices/totals are never read.
const { offerState, discountedUnit, covers } = require('./offers');
const { HttpError } = require('./http');

const ID_RE = /^[a-z0-9-]{1,60}$/;

function createPricing({ catalog, offers, settings }) {
  const methods = settings.shipping.methods;

  function shippingFor(methodId, merchandiseCents, hasItems) {
    const method = methods.find((m) => m.id === methodId) || methods[0];
    const threshold = settings.shipping.freeShippingThresholdCents;
    const eligible = settings.shipping.freeShippingAppliesTo.includes(method.id);
    const free = hasItems && eligible && merchandiseCents >= threshold;
    return {
      method: method.id,
      label: method.label,
      eta: method.eta,
      cents: !hasItems || free ? 0 : method.priceCents,
      freeShippingApplied: free,
      thresholdCents: threshold,
      remainingCents: Math.max(0, threshold - merchandiseCents),
    };
  }

  /**
   * @param {{items: Array<{productId,variantId,qty,offerId?}>, shippingMethod?: string}} input
   */
  function quote(input, now = Date.now()) {
    const items = input && input.items;
    if (!Array.isArray(items)) throw new HttpError(400, 'items must be an array');
    if (items.length > settings.maxLines) throw new HttpError(400, `At most ${settings.maxLines} cart lines`);

    const notices = [];
    const merged = new Map();
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Invalid cart item');
      const { productId, variantId, qty } = raw;
      const offerId = raw.offerId || null;
      if (!ID_RE.test(String(productId)) || !ID_RE.test(String(variantId)) || (offerId && !ID_RE.test(String(offerId)))) {
        throw new HttpError(400, 'Invalid cart item');
      }
      if (!Number.isInteger(qty) || qty < 1 || qty > settings.maxQtyPerLine) {
        throw new HttpError(400, `Quantity must be a whole number between 1 and ${settings.maxQtyPerLine}`);
      }
      const product = catalog.get(productId);
      const variant = catalog.variant(product, variantId);
      if (!product || !variant) {
        notices.push({ type: 'removed', message: 'An item that is no longer available was removed from your cart.' });
        continue;
      }
      let appliedOffer = null;
      if (offerId) {
        const offer = offers.get(offerId);
        const state = offerState(offer, now);
        if (state !== 'active') {
          notices.push({ type: 'offer-rejected', message: `The campaign offer for ${product.name} is ${state === 'invalid' ? 'not valid' : state}; it is now priced at the regular price.` });
        } else if (!covers(offer, productId, variantId)) {
          notices.push({ type: 'offer-rejected', message: `${product.name} (${variant.short}) is not part of “${offer.name}”; regular price applies.` });
        } else {
          appliedOffer = offer;
        }
      }
      const key = `${productId}|${variantId}|${appliedOffer ? appliedOffer.id : ''}`;
      const prev = merged.get(key);
      const newQty = (prev ? prev.qty : 0) + qty;
      if (newQty > settings.maxQtyPerLine) throw new HttpError(400, `Quantity must be a whole number between 1 and ${settings.maxQtyPerLine}`);
      merged.set(key, { product, variant, offer: appliedOffer, qty: newQty });
    }

    const lines = [];
    for (const [key, { product, variant, offer, qty }] of merged) {
      const regularUnitCents = variant.priceCents;
      const unitCents = offer ? discountedUnit(regularUnitCents, offer) : regularUnitCents;
      lines.push({
        key,
        productId: product.id,
        slug: product.slug,
        sku: product.sku,
        name: product.name,
        variantId: variant.id,
        variantLabel: variant.label,
        variantShort: variant.short,
        image: product.images[0].src,
        qty,
        regularUnitCents,
        unitCents,
        lineCents: unitCents * qty,
        regularLineCents: regularUnitCents * qty,
        offerId: offer ? offer.id : null,
        offerName: offer ? offer.name : null,
        source: offer ? 'offer' : 'catalog',
      });
    }

    const subtotalCents = lines.reduce((s, l) => s + l.regularLineCents, 0);
    const merchandiseCents = lines.reduce((s, l) => s + l.lineCents, 0);
    const discountCents = subtotalCents - merchandiseCents;
    const shipping = shippingFor(input.shippingMethod, merchandiseCents, lines.length > 0);
    return {
      lines,
      normalizedItems: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty, offerId: l.offerId })),
      notices,
      shipping,
      shippingOptions: methods.map((m) => {
        const s = shippingFor(m.id, merchandiseCents, lines.length > 0);
        return { id: m.id, label: m.label, eta: m.eta, cents: s.cents, baseCents: m.priceCents, free: s.freeShippingApplied };
      }),
      totals: {
        itemCount: lines.reduce((s, l) => s + l.qty, 0),
        subtotalCents,
        discountCents,
        merchandiseCents,
        shippingCents: shipping.cents,
        totalCents: merchandiseCents + shipping.cents,
      },
      currency: settings.currency,
    };
  }

  return { quote };
}

module.exports = { createPricing };
