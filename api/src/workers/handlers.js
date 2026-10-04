// Event handlers. They run in the worker process (Service Bus) or inside the API (local mode).
// Every handler is idempotent: Service Bus delivers at least once, so a repeat must be harmless.
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { releaseStock } from '../services/orders.js';
import { notify } from '../services/notify.js';

const handlers = {
  async OrderPlaced({ orderNumber }) {
    console.log(`[order] ${orderNumber} placed, waiting for payment`);
  },

  async PaymentCaptured({ orderId }) {
    // Guarded by a flag so soldCount is only counted once per order
    const order = await Order.findOneAndUpdate({ _id: orderId, 'payment.counted': { $ne: true } }, { $set: { 'payment.counted': true } }, { new: true });
    if (!order) return;
    await Promise.all(order.items.map((i) => Product.updateOne({ _id: i.product }, { $inc: { soldCount: i.qty } })));
    await notify.customer(order.contact, `Order ${order.orderNumber} confirmed`, `We received ₹${order.amounts.total}. Your sellers are packing it now.`);
    const sellerIds = order.subOrders.map((s) => s.seller.toString());
    await notify.sellers(sellerIds, `New order ${order.orderNumber}`, 'Open your seller hub to pack it.');
  },

  async PaymentFailed({ orderId, orderNumber, reason }) {
    await releaseStock(orderId);
    console.log(`[order] ${orderNumber} payment failed (${reason}); stock released`);
  },

  async OrderStatusChanged({ orderId, status }) {
    const order = await Order.findById(orderId).lean();
    if (!order) return;
    const messages = { PACKED: 'is packed', SHIPPED: 'is on its way', DELIVERED: 'was delivered' };
    if (messages[status]) await notify.customer(order.contact, `Order ${order.orderNumber} ${messages[status]}`, 'Track it any time with your Order ID.');
  },

  async StockChanged({ productIds, backInStock }) {
    // Hook for back-in-stock alerts and for refreshing a search index such as Azure AI Search
    if (backInStock) console.log(`[stock] back in stock: ${productIds.join(', ')}`);
  },

  async ProductUpdated({ productId, action }) {
    console.log(`[catalog] product ${productId} ${action}`);
  },
};

export async function handleEvent(event) {
  const handler = handlers[event?.type];
  if (!handler) return console.warn(`No handler for event ${event?.type}`);
  await handler(event.data);
}
