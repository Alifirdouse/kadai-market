import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Cart } from '../models/Cart.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { computeTotals, toPaise } from '../lib/pricing.js';
import { ah, HttpError, newOrderNumber } from '../lib/util.js';
import { config } from '../config.js';
import { reserveStock, releaseStock, markFailed, displayStatus } from '../services/orders.js';
import { createGatewayOrder } from '../services/razorpay.js';
import { publish, EVENTS } from '../services/events.js';

const r = Router();

const checkoutSchema = z.object({
  contact: z.object({
    name: z.string().trim().min(2),
    email: z.string().trim().email(),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  }),
  address: z.object({
    line1: z.string().trim().min(4),
    city: z.string().trim().min(2),
    state: z.string().trim().min(2).default('Kerala'),
    pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  }),
  // Guests send their cart lines; logged-in customers may omit this to use their saved cart
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(20) })).max(50).optional(),
});

export function publicOrder(o) {
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    status: displayStatus(o),
    paymentStatus: o.status,
    items: o.items.map((i) => ({ productId: i.product.toString(), title: i.title, packSize: i.packSize, price: i.price, qty: i.qty })),
    amounts: o.amounts,
    contact: { name: o.contact.name },
    address: { city: o.address?.city },
  };
}

// POST /api/v1/orders/checkout — reserve stock, create the order, open a Razorpay order
r.post(
  '/checkout',
  optionalAuth,
  validate(checkoutSchema),
  ah(async (req, res) => {
    let wanted = req.body.items;
    if (!wanted?.length && req.user) {
      const cart = await Cart.findOne({ user: req.user._id }).lean();
      wanted = (cart?.items ?? []).map((i) => ({ productId: i.product.toString(), qty: i.qty }));
    }
    if (!wanted?.length) throw new HttpError(400, 'Your cart is empty.');
    if (wanted.some((w) => !mongoose.isValidObjectId(w.productId))) throw new HttpError(400, 'Your cart has an invalid product.');

    const products = await Product.find({ _id: { $in: wanted.map((w) => w.productId) }, status: 'active' }).lean();
    const byId = new Map(products.map((p) => [p._id.toString(), p]));
    const lines = wanted.map((w) => {
      const p = byId.get(w.productId);
      if (!p || p.comingSoon) throw new HttpError(409, 'A product in your cart is no longer available.');
      return { product: p._id, seller: p.seller, title: p.title, packSize: p.packSize, price: p.price, mrp: p.mrp, qty: w.qty };
    });

    const amounts = computeTotals(lines, { freeShippingAbove: config.freeShippingAbove, shippingFee: config.shippingFee });
    await reserveStock(lines);

    const sellers = [...new Set(lines.map((l) => l.seller.toString()))];
    const order = await Order.create({
      orderNumber: newOrderNumber(),
      user: req.user?._id,
      contact: req.body.contact,
      address: req.body.address,
      items: lines,
      subOrders: sellers.map((s) => ({ seller: s, status: 'NEW', history: [{ status: 'NEW' }] })),
      amounts,
    });

    let gatewayOrder;
    try {
      gatewayOrder = await createGatewayOrder({
        amountPaise: toPaise(amounts.total),
        receipt: order.orderNumber,
        notes: { orderId: order._id.toString() },
      });
    } catch (err) {
      await markFailed({ _id: order._id }, 'gateway_error');
      await releaseStock(order._id);
      throw err;
    }
    order.payment.razorpayOrderId = gatewayOrder.id;
    await order.save();
    await publish(EVENTS.OrderPlaced, { orderId: order._id.toString(), orderNumber: order.orderNumber });

    res.status(201).json({
      order: publicOrder(order),
      payment: {
        keyId: config.razorpay.keyId || null,
        razorpayOrderId: gatewayOrder.id,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        mock: Boolean(gatewayOrder.mock),
        prefill: { name: req.body.contact.name, email: req.body.contact.email, contact: req.body.contact.phone },
      },
    });
  })
);

// Customer order history
r.get(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ orders: orders.map(publicOrder) });
  })
);

// Guest order tracking by order number + phone (as on HiFav)
r.post(
  '/track',
  validate(z.object({ orderNumber: z.string().trim().min(4), phone: z.string().trim().min(10) })),
  ah(async (req, res) => {
    const order = await Order.findOne({ orderNumber: req.body.orderNumber.toUpperCase(), 'contact.phone': req.body.phone });
    if (!order) throw new HttpError(404, 'No order matches that Order ID and phone number.');
    res.json({ order: publicOrder(order) });
  })
);

r.get(
  '/:orderNumber',
  requireAuth,
  ah(async (req, res) => {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    const allowed = order && (req.user.role === 'admin' || order.user?.equals(req.user._id));
    if (!allowed) throw new HttpError(404, 'Order not found.');
    res.json({ order: publicOrder(order) });
  })
);

export default r;
