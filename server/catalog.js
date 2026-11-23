'use strict';
// Product catalog module (read-only configuration supplied by the owner).
const { JsonFile } = require('./store');

class Catalog {
  constructor(file) {
    this.src = new JsonFile(file, { categories: [], products: [] });
  }
  get categories() { return this.src.read().categories; }
  all() { return this.src.read().products.filter((p) => p.active); }
  get(id) { return this.all().find((p) => p.id === id) || null; }
  bySlug(slug) { return this.all().find((p) => p.slug === slug) || null; }
  variant(product, variantId) {
    return product ? product.variants.find((v) => v.id === variantId) || null : null;
  }
}

module.exports = { Catalog };
