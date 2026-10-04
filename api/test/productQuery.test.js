import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductQuery, buildMatch } from '../src/lib/productQuery.js';

const NOW = new Date('2026-10-03T00:00:00Z');
const has = (match, clause) => match.$and.some((c) => JSON.stringify(c) === JSON.stringify(clause));

test('defaults: active, hides coming soon, featured sort, page 1 of 24', () => {
  const q = buildProductQuery({}, { now: NOW });
  assert.ok(has(q.match, { status: 'active' }));
  assert.ok(has(q.match, { comingSoon: false }));
  assert.equal(q.sortKey, 'featured');
  assert.deepEqual([q.page, q.limit, q.skip], [1, 24, 0]);
});

test('in stock only', () => {
  assert.ok(has(buildMatch({ inStock: '1' }), { stock: { $gt: 0 } }));
  assert.ok(!has(buildMatch({ inStock: '0' }), { stock: { $gt: 0 } }));
});

test('new arrivals: seller flag OR created within 30 days', () => {
  const m = buildMatch({ new: 'true' }, { now: NOW });
  const since = new Date(NOW.getTime() - 30 * 86_400_000);
  assert.ok(has(m, { $or: [{ isNewArrival: true }, { createdAt: { $gte: since } }] }));
});

test('category and brand lists, price range, rating, discount', () => {
  const m = buildMatch({ category: 'Pickles, Snacks', brand: 'Munnar Leaf', minPrice: '50', maxPrice: '200', rating: '4', discount: '15' });
  assert.ok(has(m, { category: { $in: ['Pickles', 'Snacks'] } }));
  assert.ok(has(m, { brandName: { $in: ['Munnar Leaf'] } }));
  assert.ok(has(m, { price: { $gte: 50, $lte: 200 } }));
  assert.ok(has(m, { rating: { $gte: 4 } }));
  assert.ok(has(m, { discountPct: { $gte: 15 } }));
});

test('facet matches drop only their own filter', () => {
  const q = buildProductQuery({ category: 'Pickles', brand: 'Munnar Leaf' });
  assert.ok(!JSON.stringify(q.categoryFacetMatch).includes('"category"'));
  assert.ok(JSON.stringify(q.categoryFacetMatch).includes('Munnar Leaf'));
  assert.ok(!JSON.stringify(q.brandFacetMatch).includes('Munnar Leaf'));
  assert.ok(JSON.stringify(q.brandFacetMatch).includes('Pickles'));
});

test('coming soon shows only coming-soon products', () => {
  assert.ok(has(buildMatch({ comingSoon: '1' }), { comingSoon: true }));
});

test('bad input is clamped, unknown sort falls back', () => {
  const q = buildProductQuery({ page: '-3', limit: '999', sort: 'constructor', minPrice: 'abc' });
  assert.deepEqual([q.page, q.limit, q.sortKey], [1, 48, 'featured']);
  assert.ok(!JSON.stringify(q.match).includes('price'));
});

test('text search', () => {
  assert.ok(has(buildMatch({ q: '  tea ' }), { $text: { $search: 'tea' } }));
});
