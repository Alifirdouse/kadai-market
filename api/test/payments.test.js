import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, toPaise } from '../src/lib/pricing.js';
import { verifyPaymentSignature, verifyWebhookSignature, signForTest } from '../src/lib/signatures.js';
import { newOrderNumber, slugify } from '../src/lib/util.js';

test('totals add delivery under ₹499 and waive it above', () => {
  const small = computeTotals([{ price: 89, mrp: 99, qty: 2 }]);
  assert.deepEqual(small, { subtotal: 178, mrpTotal: 198, savings: 20, shipping: 40, total: 218 });
  const big = computeTotals([{ price: 349, mrp: 420, qty: 1 }, { price: 180, mrp: 199, qty: 1 }]);
  assert.equal(big.shipping, 0);
  assert.equal(big.total, 529);
});

test('totals reject bad quantities', () => {
  assert.throws(() => computeTotals([{ price: 10, qty: 0 }]));
  assert.throws(() => computeTotals([{ price: 10, qty: 1.5 }]));
});

test('rupees to paise', () => {
  assert.equal(toPaise(218), 21800);
  assert.equal(toPaise(99.99), 9999);
});

test('checkout signature: valid, tampered, missing secret', () => {
  const secret = 'test_secret';
  const signature = signForTest(secret, 'order_ABC|pay_XYZ');
  assert.equal(verifyPaymentSignature({ razorpayOrderId: 'order_ABC', razorpayPaymentId: 'pay_XYZ', signature }, secret), true);
  assert.equal(verifyPaymentSignature({ razorpayOrderId: 'order_ABC', razorpayPaymentId: 'pay_OTHER', signature }, secret), false);
  assert.equal(verifyPaymentSignature({ razorpayOrderId: 'order_ABC', razorpayPaymentId: 'pay_XYZ', signature }, ''), false);
});

test('webhook signature covers the exact raw body', () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: {} });
  const sig = signForTest('whsec', body);
  assert.equal(verifyWebhookSignature(body, sig, 'whsec'), true);
  assert.equal(verifyWebhookSignature(body + ' ', sig, 'whsec'), false);
});

test('order numbers and slugs', () => {
  assert.match(newOrderNumber(new Date('2026-10-03T10:00:00Z')), /^KM-261003-[0-9A-F]{6}$/);
  assert.equal(slugify('Kadumanga (Tender Mango)'), 'kadumanga-tender-mango');
});
