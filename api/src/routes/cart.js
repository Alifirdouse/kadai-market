import { Router } from 'express';
import { z } from 'zod';
import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { computeTotals } from '../lib/pricing.js';
import { config } from '../config.js';
import { ah, HttpError } from '../lib/util.js';
import { toCard } from './products.js';

const r = Router();
r.use(requireAuth);

async function cartView(userId) {
  const cart = await Cart.findOne({ user: userId }).populate('items.product').lean();
  const items = (cart?.items ?? [])
    .filter((i) => i.product && i.product.status === 'active')
    .map((i) => ({ product: toCard(i.product), qty: i.qty, available: i.product.stock }));
  const totals = computeTotals(
    items.map((i) => ({ price: i.product.price, mrp: i.product.mrp, qty: i.qty })),
    { freeShippingAbove: config.freeShippingAbove, shippingFee: config.shippingFee }
  );
  return { items, totals };
}

r.get('/', ah(async (req, res) => res.json(await cartView(req.user._id))));

const qtySchema = z.number().int().min(1).max(20);

r.post(
  '/items',
  validate(z.object({ productId: z.string().min(1), qty: qtySchema.default(1) })),
  ah(async (req, res) => {
    const product = await Product.findOne({ _id: req.body.productId, status: 'active', comingSoon: false });
    if (!product) throw new HttpError(404, 'This product is not available.');
    const cart = (await Cart.findOne({ user: req.user._id })) ?? new Cart({ user: req.user._id, items: [] });
    const line = cart.items.find((i) => i.product.equals(product._id));
    const qty = (line?.qty ?? 0) + req.body.qty;
    if (qty > product.stock) throw new HttpError(409, `Only ${product.stock} left of ${product.title}.`);
    if (line) line.qty = qty;
    else cart.items.push({ product: product._id, qty });
    await cart.save();
    res.status(201).json(await cartView(req.user._id));
  })
);

r.patch(
  '/items/:productId',
  validate(z.object({ qty: qtySchema })),
  ah(async (req, res) => {
    const product = await Product.findById(req.params.productId).select('stock title');
    if (product && req.body.qty > product.stock) throw new HttpError(409, `Only ${product.stock} left of ${product.title}.`);
    await Cart.updateOne({ user: req.user._id, 'items.product': req.params.productId }, { $set: { 'items.$.qty': req.body.qty } });
    res.json(await cartView(req.user._id));
  })
);

r.delete(
  '/items/:productId',
  ah(async (req, res) => {
    await Cart.updateOne({ user: req.user._id }, { $pull: { items: { product: req.params.productId } } });
    res.json(await cartView(req.user._id));
  })
);

export default r;
