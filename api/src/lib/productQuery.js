// Turns storefront query-string filters into a MongoDB match + sort.
// Pure function (no database access) so it can be unit-tested directly.
//
// GET /api/v1/products?q=pickle&category=Pickles,Snacks&brand=Kuttanad%20Kitchen
//     &inStock=1&new=1&minPrice=50&maxPrice=200&rating=4&discount=10&sort=newest&page=1&limit=24

const DAY_MS = 24 * 60 * 60 * 1000;

export const SORTS = {
  featured: { soldCount: -1, rating: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  rating: { rating: -1, reviewCount: -1, _id: 1 },
  discount: { discountPct: -1, _id: 1 },
};

const list = (v) =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const truthy = (v) => v === '1' || v === 'true' || v === true;

const num = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * @param {Record<string,string>} params  raw query params
 * @param {{ now?: Date, newArrivalDays?: number, except?: 'category'|'brand' }} opts
 *        `except` drops one filter so facet counts show what you would get by changing it
 */
export function buildMatch(params = {}, opts = {}) {
  const now = opts.now ?? new Date();
  const newArrivalDays = opts.newArrivalDays ?? 30;
  const and = [{ status: 'active' }];

  // Coming-soon products are hidden unless asked for explicitly
  and.push({ comingSoon: truthy(params.comingSoon) });

  const q = String(params.q ?? '').trim();
  if (q) and.push({ $text: { $search: q } });

  const cats = list(params.category);
  if (cats.length && opts.except !== 'category') and.push({ category: { $in: cats } });

  const brands = list(params.brand);
  if (brands.length && opts.except !== 'brand') and.push({ brandName: { $in: brands } });

  if (truthy(params.inStock)) and.push({ stock: { $gt: 0 } });

  if (truthy(params.new)) {
    and.push({
      $or: [{ isNewArrival: true }, { createdAt: { $gte: new Date(now.getTime() - newArrivalDays * DAY_MS) } }],
    });
  }

  const minPrice = num(params.minPrice);
  const maxPrice = num(params.maxPrice);
  if (minPrice !== undefined || maxPrice !== undefined) {
    const price = {};
    if (minPrice !== undefined) price.$gte = minPrice;
    if (maxPrice !== undefined) price.$lte = maxPrice;
    and.push({ price });
  }

  const rating = num(params.rating);
  if (rating) and.push({ rating: { $gte: rating } });

  const discount = num(params.discount);
  if (discount) and.push({ discountPct: { $gte: discount } });

  return { $and: and };
}

export function buildProductQuery(params = {}, opts = {}) {
  const page = Math.max(1, Math.floor(num(params.page) ?? 1));
  const limit = Math.min(48, Math.max(1, Math.floor(num(params.limit) ?? 24)));
  const sortKey = Object.hasOwn(SORTS, params.sort) ? params.sort : 'featured';
  return {
    match: buildMatch(params, opts),
    categoryFacetMatch: buildMatch(params, { ...opts, except: 'category' }),
    brandFacetMatch: buildMatch(params, { ...opts, except: 'brand' }),
    sort: SORTS[sortKey],
    sortKey,
    page,
    limit,
    skip: (page - 1) * limit,
  };
}
