import crypto from 'node:crypto';

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Checkout callback: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }, keySecret) {
  if (!razorpayOrderId || !razorpayPaymentId || !signature || !keySecret) return false;
  return safeEqual(hmac(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`), signature);
}

// Webhook: X-Razorpay-Signature = HMAC_SHA256(raw request body, webhook_secret)
export function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!rawBody || !signature || !webhookSecret) return false;
  return safeEqual(hmac(webhookSecret, rawBody), signature);
}

export const signForTest = hmac;
