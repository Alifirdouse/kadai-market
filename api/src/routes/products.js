import { Router } from 'express';
import { Product, CATEGORIES } from '../models/Product.js';
import { buildProductQuery } from '../lib/productQuery.js';
import { config } from '../config.js';
import { ah, HttpError } from '../lib/util.js';

const r = Router();
const DAY_MS = 86_400_000;

export function toCard(p) {
  const isNew = p.isNewArrival || Date.now() - new Date(p.createdAt).getTime() <= config.newArrivalDays * DAY_MS;
  return {
    id: p._id.toString(),
    slug: p.slug,
    title: p.title,
    brandName: p.brandName,
    category: p.category,
    packSize: p.packSize,
    image: p.images?.[0] ?? null,
    price: p.price,
    mrp: p.mrp,
    discountPct: p.discountPct,
    inStock: p.stock > 0,
    lowStock: p.stock > 0 && p.stock <= 5 ? p.stock : null, // drives the "Only 3 left" badge
    isNew,
    comingSoon: p.comingSoon,
    rating: p.rating,
    reviewCount: p.reviewCount,
  };
}

// GET /api/v1/products  — listing with filters, sort, pagination and facet counts
r.get(
  '/',
  ah(async (req, res) => {
    const q = buildProductQuery(req.query, { newArrivalDays: config.newArrivalDays });
    const [items, total, categories, brands] = await Promise.all([
      Product.find(q.match).sort(q.sort).skip(q.skip).limit(q.limit).lean(),
      Product.countDocuments(q.match),
      Product.aggregate([{ $match: q.categoryFacetMatch }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
      Product.aggregate([{ $match: q.brandFacetMatch }, { $group: { _id: '$brandName', count: { $sum: 1 } } }]),
    ]);
    const catCounts = Object.fromEntries(categories.map((c) => [c._id, c.count]));
    res.json({
      items: items.map(toCard),
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / q.limit)),
      sort: q.sort,
      facets: {
        categories: CATEGORIES.map((name) => ({ name, count: catCounts[name] ?? 0 })),
        brands: brands.map((b) => ({ name: b._id, count: b.count })).sort((a, b) => a.name.localeCompare(b.name)),
      },
    });
  })
);

r.get('/categories', (_req, res) => res.json({ categories: CATEGORIES }));

r.get(
  '/:slug',
  ah(async (req, res) => {
    const p = await Product.findOne({ slug: req.params.slug, status: 'active' }).lean();
    if (!p) throw new HttpError(404, 'This product is not available.');
    res.json({ product: { ...toCard(p), description: p.description, images: p.images, sellerId: p.seller.toString() } });
  })
);

export default r;
