'use strict';
// Replaceable payment-provider interface (SOW §4, §5).
//
// Interface:  async process({ orderId, amountCents, currency, method }) -> {
//   paymentStatus: 'simulated' | 'unpaid' | 'verified-paid',
//   provider: string, reference: string, externalReference: string|null, capturedCents: number }
//
// Phase 1 ships ONLY the simulated provider. No Stripe credentials, API calls or
// webhooks exist here. A future StripeProvider must implement the same interface,
// and only a *verified webhook event* may ever set paymentStatus = 'verified-paid'.
const crypto = require('crypto');

class SimulatedPaymentProvider {
  constructor() { this.name = 'simulated'; }
  async process({ method }) {
    return {
      paymentStatus: 'simulated',
      provider: this.name,
      method,
      reference: `SIM-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
      externalReference: null,
      capturedCents: 0, // never captures money
    };
  }
}

module.exports = { SimulatedPaymentProvider };
