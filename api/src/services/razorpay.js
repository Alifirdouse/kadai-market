import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../lib/util.js';
import { verifyPaymentSignature } from '../lib/signatures.js';

export const gatewayConfigured = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);
// Mock payments: always in development, and in staging when ALLOW_MOCK_PAYMENTS=true, until real keys are set
const mockAllowed = () =>
  !gatewayConfigured() && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOCK_PAYMENTS === 'true');

// Creates a Razorpay order (amount in paise). Without keys in development, returns a mock order
// so the whole checkout can be exercised locally.
export async function createGatewayOrder({ amountPaise, receipt, notes }) {
  if (mockAllowed()) {
    return { id: `order_mock_${crypto.randomBytes(6).toString('hex')}`, amount: amountPaise, currency: 'INR', mock: true };
  }
  if (!gatewayConfigured()) throw new HttpError(503, 'Payments are not configured.');

  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Razorpay order creation failed', res.status, text);
    throw new HttpError(502, 'The payment gateway did not respond. Try again.');
  }
  return res.json();
}

export function verifyCheckoutPayment({ razorpayOrderId, razorpayPaymentId, signature }) {
  if (mockAllowed()) return razorpayOrderId?.startsWith('order_mock_') && Boolean(razorpayPaymentId);
  return verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }, config.razorpay.keySecret);
}
