import mongoose from 'mongoose';

export const ORDER_STATUS = ['PENDING_PAYMENT', 'CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED', 'COMPLETED'];
export const FULFILMENT_STATUS = ['NEW', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: String, // snapshot so later product edits do not change old orders
    packSize: String,
    price: Number,
    mrp: Number,
    qty: Number,
  },
  { _id: false }
);

// One sub-order per seller: each seller fulfils only their own items
const subOrderSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: FULFILMENT_STATUS, default: 'NEW' },
    history: [{ status: String, at: { type: Date, default: Date.now } }],
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // empty for guest orders
    contact: {
      name: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
      phone: { type: String, required: true },
    },
    address: { line1: String, city: String, state: String, pincode: String },
    items: [orderItemSchema],
    subOrders: [subOrderSchema],
    amounts: { subtotal: Number, mrpTotal: Number, shipping: Number, total: Number },
    status: { type: String, enum: ORDER_STATUS, default: 'PENDING_PAYMENT', index: true },
    payment: {
      provider: { type: String, default: 'razorpay' },
      method: String,
      razorpayOrderId: { type: String, index: true },
      razorpayPaymentId: String,
      paidAt: Date,
      counted: { type: Boolean, default: false }, // sales counters updated (idempotency guard)
    },
    stockReleased: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.index({ 'subOrders.seller': 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
