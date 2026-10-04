// Seeds sample sellers, products, an admin and a demo customer.  npm run seed
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from './db.js';
import { User } from './models/User.js';
import { Product } from './models/Product.js';
import { Cart } from './models/Cart.js';
import { Order } from './models/Order.js';
import { slugify } from './lib/util.js';

const DAY = 86_400_000;
const sellers = [
  { key: 's1', brandName: 'Kuttanad Kitchen', city: 'Alappuzha', email: 'kuttanad@kadai.dev' },
  { key: 's2', brandName: 'Spice Coast Co.', city: 'Kochi', email: 'spicecoast@kadai.dev' },
  { key: 's3', brandName: 'Munnar Leaf', city: 'Munnar', email: 'munnarleaf@kadai.dev' },
  { key: 's4', brandName: 'Malabar Bites', city: 'Kozhikode', email: 'malabar@kadai.dev' },
  { key: 's5', brandName: 'Wayanad Hive', city: 'Kalpetta', email: 'wayanad@kadai.dev' },
];

// [seller, title, category, pack, price, mrp, stock, daysAgo, rating, reviews, comingSoon]
const items = [
  ['s1', 'Tuna Fish Pickle', 'Pickles', '200 g', 89, 99, 24, 40, 4.5, 128],
  ['s1', 'Prawn Roast Pickle', 'Pickles', '200 g', 149, 170, 4, 6, 4.7, 62],
  ['s1', 'Beef Pickle', 'Pickles', '250 g', 149, 170, 0, 12, 4.4, 88],
  ['s1', 'Dates and Lime Pickle', 'Pickles', '300 g', 69, 80, 31, 3, 4.2, 19],
  ['s1', 'Kadumanga (Tender Mango)', 'Pickles', '400 g', 120, 140, 50, 120, 4.6, 340],
  ['s2', 'Sambar Powder', 'Spices & Masalas', '200 g', 65, 79, 80, 60, 4.3, 210],
  ['s2', 'Rasam Powder', 'Spices & Masalas', '200 g', 65, 79, 3, 60, 4.1, 97],
  ['s2', 'Turmeric Powder', 'Spices & Masalas', '250 g', 49, 60, 120, 200, 4.8, 512],
  ['s2', 'Kashmiri Chilli Powder', 'Spices & Masalas', '250 g', 99, 110, 0, 90, 4.5, 230],
  ['s2', 'Coriander Powder', 'Spices & Masalas', '200 g', 75, 89, 44, 10, 4.0, 12],
  ['s2', 'Black Pepper, Whole', 'Spices & Masalas', '100 g', 140, 165, 26, 25, 4.9, 76],
  ['s3', 'Munnar Dust Tea', 'Tea & Coffee', '250 g', 90, 115, 60, 150, 4.6, 401],
  ['s3', 'Munnar Leaf Tea', 'Tea & Coffee', '250 g', 120, 135, 15, 8, 4.4, 33],
  ['s3', 'Cardamom Tea', 'Tea & Coffee', '100 g', 165, 190, 2, 2, 4.8, 9],
  ['s3', 'Kerala Filter Coffee', 'Tea & Coffee', '200 g', 180, 199, 18, 70, 4.5, 145],
  ['s4', 'Banana Chips in Coconut Oil', 'Snacks', '250 g', 110, 129, 70, 30, 4.6, 620],
  ['s4', 'Jackfruit Chips', 'Snacks', '150 g', 130, 150, 0, 15, 4.3, 41],
  ['s4', 'Achappam (Rose Cookies)', 'Snacks', '200 g', 95, 110, 22, 5, 4.2, 14],
  ['s4', 'Avalose Podi', 'Snacks', '250 g', 69, 80, 40, 100, 4.1, 58],
  ['s4', 'Beetroot Avalose Podi', 'Snacks', '250 g', 89, 100, 12, 1, 4.0, 3],
  ['s5', 'Wild Forest Honey', 'Honey & Oils', '500 g', 349, 420, 16, 45, 4.7, 188],
  ['s5', 'Virgin Coconut Oil', 'Honey & Oils', '500 ml', 299, 340, 0, 80, 4.6, 266],
  ['s5', 'Ginger Honey', 'Honey & Oils', '250 g', 199, 230, 9, 4, 4.5, 21],
  ['s1', 'Gooseberry Pickle', 'Pickles', '300 g', 99, 115, 0, 0, 0, 0, true],
  ['s2', 'Malabar Garam Masala', 'Spices & Masalas', '100 g', 85, 99, 0, 0, 0, 0, true],
];

await connectDb();
await Promise.all([User.deleteMany({}), Product.deleteMany({}), Cart.deleteMany({}), Order.deleteMany({})]);
await Product.syncIndexes();

const passwordHash = await bcrypt.hash('password123', 12);
await User.create({ name: 'Platform Admin', email: 'admin@kadai.dev', role: 'admin', passwordHash });
await User.create({ name: 'Asha Nair', email: 'asha@kadai.dev', phone: '9847012345', role: 'customer', passwordHash });

const sellerIds = {};
for (const s of sellers) {
  const u = await User.create({
    name: `${s.brandName} owner`,
    email: s.email,
    phone: '9895000000',
    role: 'seller',
    seller: { brandName: s.brandName, city: s.city, approvalStatus: 'approved' },
    passwordHash,
  });
  sellerIds[s.key] = { id: u._id, brandName: s.brandName };
}

const now = Date.now();
for (const [key, title, category, packSize, price, mrp, stock, daysAgo, rating, reviewCount, comingSoon = false] of items) {
  const createdAt = new Date(now - daysAgo * DAY);
  await Product.create({
    seller: sellerIds[key].id,
    brandName: sellerIds[key].brandName,
    title,
    slug: slugify(title),
    description: `${title} made in small batches by ${sellerIds[key].brandName}. No artificial colours or preservatives.`,
    category,
    packSize,
    price,
    mrp,
    stock,
    rating,
    reviewCount,
    soldCount: Math.round(reviewCount * 3),
    isNewArrival: false, // "new" is derived from createdAt (last 30 days) unless a seller flags it
    comingSoon,
    createdAt,
    updatedAt: createdAt,
  });
}

console.log(`Seeded ${items.length} products from ${sellers.length} sellers.`);
console.log('Logins (password: password123): asha@kadai.dev (customer), kuttanad@kadai.dev (seller), admin@kadai.dev (admin)');
await disconnectDb();
