import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { ah, HttpError } from '../lib/util.js';
import { verifyWebhookSignature } from '../lib/signatures.js';
import { verifyCheckoutPayment } from '../services/razorpay.js';
import { markPaid, markFailed, releaseStock } from '../services/orders.js';
import { ProcessedEvent } from '../models/ProcessedEvent.js';
import { config } from '../config.js';
import { publicOrder } from './orders.js';

const r = Router();

// Browser callback after Razorpay Checkout succeeds. The signature proves the
// payment came from Razorpay; the webhook below is still the source of truth.
r.post(
  '/verify',
  express.json(),
  validate(
    z.object({
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().min(1),
      signature: z.string().optional().default(''),
      method: z.string().optional(),
    })
  ),
  ah(async (req, res) => {
    if (!verifyCheckoutPayment(req.body)) throw new HttpError(400, 'We could not verify this payment. You have not been charged twice; contact support with your Order ID.');
    const { order } = await markPaid(req.body);
    if (!order) throw new HttpError(404, 'Order not found.');
    res.json({ order: publicOrder(order) });
  })
);

// Razorpay webhook. Mounted with a raw body parser because the signature covers the exact bytes.
r.post(
  '/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  ah(async (req, res) => {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    if (!verifyWebhookSignature(raw, req.get('x-razorpay-signature'), config.razorpay.webhookSecret)) {
      throw new HttpError(400, 'Invalid webhook signature');
    }
    const eventId = req.get('x-razorpay-event-id');
    const body = JSON.parse(raw);

    if (eventId) {
      try {
        await ProcessedEvent.create({ eventId, type: body.event });
      } catch (err) {
        if (err.code === 11000) return res.json({ ok: true, duplicate: true });
        throw err;
      }
    }

    const payment = body.payload?.payment?.entity;
    if (body.event === 'payment.captured' && payment) {
      await markPaid({ razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id, method: payment.method });
    } else if (body.event === 'payment.failed' && payment) {
      const order = await markFailed({ 'payment.razorpayOrderId': payment.order_id }, payment.error_description || 'failed');
      if (order) await releaseStock(order._id);
    }
    res.json({ ok: true });
  })
);

export default r;
