import { Router } from 'express';
import { z } from 'zod';
import { Product, CATEGORIES } from '../models/Product.js';
import { Order, FULFILMENT_STATUS } from '../models/Order.js';
import { requireAuth, requireApprovedSeller } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, HttpError, uniqueSlug } from '../lib/util.js';
import { publish, EVENTS } from '../services/events.js';

const r = Router();
r.use(requireAuth, requireApprovedSeller);

const productSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(4000).default(''),
    category: z.enum(CATEGORIES),
    packSize: z.string().trim().max(40).default(''),
    images: z.array(z.string().url()).max(8).default([]),
    price: z.number().positive(),
    mrp: z.number().positive(),
    stock: z.number().int().min(0),
    isNewArrival: z.boolean().default(true),
    comingSoon: z.boolean().default(false),
    status: z.enum(['draft', 'active', 'archived']).default('active'),
  })
  .refine((p) => p.mrp >= p.price, { message: 'MRP must be at least the selling price', path: ['mrp'] });

async function ownProduct(req) {
  const p = await Product.findOne({ _id: req.params.id, seller: req.user._id });
  if (!p) throw new HttpError(404, 'Product not found in your catalogue.');
  return p;
}

r.get(
  '/summary',
  ah(async (req, res) => {
    const sid = req.user._id;
    const [live, lowStock, outOfStock, openOrders] = await Promise.all([
      Product.countDocuments({ seller: sid, status: 'active', comingSoon: false }),
      Product.countDocuments({ seller: sid, status: 'active', comingSoon: false, stock: { $gt: 0, $lte: 5 } }),
      Product.countDocuments({ seller: sid, status: 'active', comingSoon: false, stock: 0 }),
      Order.countDocuments({ status: 'CONFIRMED', subOrders: { $elemMatch: { seller: sid, status: { $in: ['NEW', 'PACKED', 'SHIPPED'] } } } }),
    ]);
    res.json({ brandName: req.user.seller.brandName, live, lowStock, outOfStock, openOrders });
  })
);

r.get(
  '/products',
  ah(async (req, res) => {
    const products = await Product.find({ seller: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ products });
  })
);

r.post(
  '/products',
  validate(productSchema),
  ah(async (req, res) => {
    const product = await Product.create({
      ...req.body,
      seller: req.user._id,
      brandName: req.user.seller.brandName,
      slug: uniqueSlug(req.body.title),
    });
    await publish(EVENTS.ProductUpdated, { productId: product._id.toString(), action: 'created' });
    res.status(201).json({ product });
  })
);

r.patch(
  '/products/:id',
  validate(productSchema.innerType().partial()),
  ah(async (req, res) => {
    const p = await ownProduct(req);
    Object.assign(p, req.body);
    if (p.mrp < p.price) throw new HttpError(400, 'MRP must be at least the selling price.');
    await p.save();
    await publish(EVENTS.ProductUpdated, { productId: p._id.toString(), action: 'updated' });
    res.json({ product: p });
  })
);

// Absolute stock set from the seller dashboard
r.patch(
  '/products/:id/stock',
  validate(z.object({ stock: z.number().int().min(0) })),
  ah(async (req, res) => {
    const p = await ownProduct(req);
    const wasOut = p.stock === 0;
    p.stock = req.body.stock;
    await p.save();
    await publish(EVENTS.StockChanged, { productIds: [p._id.toString()], backInStock: wasOut && p.stock > 0 });
    res.json({ product: p });
  })
);

r.get(
  '/orders',
  ah(async (req, res) => {
    const sid = req.user._id;
    const orders = await Order.find({ status: { $in: ['CONFIRMED', 'COMPLETED'] }, 'subOrders.seller': sid })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({
      orders: orders.map((o) => {
        const mine = o.items.filter((i) => i.seller.equals(sid));
        return {
          id: o._id.toString(),
          orderNumber: o.orderNumber,
          createdAt: o.createdAt,
          customer: { name: o.contact.name, city: o.address?.city, pincode: o.address?.pincode },
          items: mine.map((i) => ({ title: i.title, packSize: i.packSize, qty: i.qty, price: i.price })),
          amount: mine.reduce((s, i) => s + i.price * i.qty, 0),
          status: o.subOrders.find((s) => s.seller.equals(sid))?.status,
        };
      }),
    });
  })
);

r.patch(
  '/orders/:id/status',
  validate(z.object({ status: z.enum(FULFILMENT_STATUS) })),
  ah(async (req, res) => {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: 'CONFIRMED', 'subOrders.seller': req.user._id },
      { $set: { 'subOrders.$.status': req.body.status }, $push: { 'subOrders.$.history': { status: req.body.status } } },
      { new: true }
    );
    if (!order) throw new HttpError(404, 'Order not found, or it is not paid yet.');
    await publish(EVENTS.OrderStatusChanged, {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      sellerId: req.user._id.toString(),
      status: req.body.status,
    });
    res.json({ ok: true, status: req.body.status });
  })
);

export default r;
