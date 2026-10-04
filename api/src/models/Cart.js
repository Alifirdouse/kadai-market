import mongoose from 'mongoose';

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        qty: { type: Number, required: true, min: 1, max: 20 },
      },
    ],
  },
  { timestamps: true }
);

export const Cart = mongoose.model('Cart', cartSchema);
