import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { HttpError } from '../lib/util.js';
import { publish, EVENTS } from './events.js';

// Atomically decrements stock for every line, or none of them.
// The `stock: { $gte: qty }` condition makes overselling impossible even under concurrent checkouts.
export async function reserveStock(lines) {
  const done = [];
  for (const line of lines) {
    const res = await Product.updateOne(
      { _id: line.product, status: 'active', comingSoon: false, stock: { $gte: line.qty } },
      { $inc: { stock: -line.qty } }
    );
    if (res.modifiedCount !== 1) {
      await Promise.all(done.map((d) => Product.updateOne({ _id: d.product }, { $inc: { stock: d.qty } })));
      const p = await Product.findById(line.product).select('title stock');
      throw new HttpError(409, p ? `Only ${p.stock} left of ${p.title}. Update your cart and try again.` : 'A product in your cart is no longer available.');
    }
    done.push(line);
  }
}

// Returns reserved stock once per order (the stockReleased flag makes it idempotent)
export async function releaseStock(orderId) {
  const order = await Order.findOneAndUpdate({ _id: orderId, stockReleased: false }, { $set: { stockReleased: true } }, { new: true });
  if (!order) return false;
  await Promise.all(order.items.map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.qty } })));
  await publish(EVENTS.StockChanged, { productIds: order.items.map((i) => i.product.toString()), reason: 'released' });
  return true;
}

// Moves PENDING_PAYMENT -> CONFIRMED exactly once, whether the browser callback or the webhook arrives first
export async function markPaid({ razorpayOrderId, razorpayPaymentId, method }) {
  const order = await Order.findOneAndUpdate(
    { 'payment.razorpayOrderId': razorpayOrderId, status: 'PENDING_PAYMENT' },
    {
      $set: {
        status: 'CONFIRMED',
        'payment.razorpayPaymentId': razorpayPaymentId,
        'payment.method': method,
        'payment.paidAt': new Date(),
      },
    },
    { new: true }
  );
  if (!order) {
    return { order: await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId }), changed: false };
  }
  await publish(EVENTS.PaymentCaptured, { orderId: order._id.toString(), orderNumber: order.orderNumber });
  return { order, changed: true };
}

export async function markFailed(filter, reason) {
  const order = await Order.findOneAndUpdate(
    { ...filter, status: 'PENDING_PAYMENT' },
    { $set: { status: 'PAYMENT_FAILED' } },
    { new: true }
  );
  if (order) await publish(EVENTS.PaymentFailed, { orderId: order._id.toString(), orderNumber: order.orderNumber, reason });
  return order;
}

// Run on a timer by the worker: orders left unpaid release their stock
export async function expireUnpaidOrders(timeoutMinutes) {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  const stale = await Order.find({ status: 'PENDING_PAYMENT', createdAt: { $lt: cutoff } }).select('_id');
  for (const { _id } of stale) await markFailed({ _id }, 'timeout');
  return stale.length;
}

// Customer-facing status derived from the per-seller sub-orders
export function displayStatus(order) {
  if (order.status !== 'CONFIRMED' && order.status !== 'COMPLETED') return order.status;
  const rank = ['NEW', 'PACKED', 'SHIPPED', 'DELIVERED'];
  const active = order.subOrders.filter((s) => s.status !== 'CANCELLED');
  if (!active.length) return 'CANCELLED';
  const lowest = Math.min(...active.map((s) => rank.indexOf(s.status)));
  return ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'][lowest];
}
