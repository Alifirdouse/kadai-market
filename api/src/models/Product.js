import mongoose from 'mongoose';

export const CATEGORIES = ['Pickles', 'Spices & Masalas', 'Tea & Coffee', 'Snacks', 'Honey & Oils'];

const productSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brandName: { type: String, required: true }, // denormalised for fast filtering and facets
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    category: { type: String, enum: CATEGORIES, required: true },
    packSize: { type: String, default: '' },
    images: [{ type: String }], // Azure Blob Storage URLs
    price: { type: Number, required: true, min: 0 }, // rupees
    mrp: { type: Number, required: true, min: 0 },
    discountPct: { type: Number, default: 0 }, // derived on save so it can be filtered and sorted
    stock: { type: Number, required: true, min: 0, default: 0 },
    isNewArrival: { type: Boolean, default: true },
    comingSoon: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'active', index: true },
  },
  { timestamps: true }
);

productSchema.pre('save', function setDiscount(next) {
  this.discountPct = this.mrp > 0 ? Math.round((1 - this.price / this.mrp) * 100) : 0;
  next();
});

// Indexes that back the storefront filters
productSchema.index({ title: 'text', description: 'text', brandName: 'text' });
productSchema.index({ status: 1, category: 1, price: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, stock: 1 });
productSchema.index({ status: 1, rating: -1 });

export const Product = mongoose.model('Product', productSchema);
