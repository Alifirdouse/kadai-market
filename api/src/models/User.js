import mongoose from 'mongoose';

const sellerProfileSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'seller', 'admin'], default: 'customer', index: true },
    seller: { type: sellerProfileSchema, default: undefined },
    addresses: [
      {
        line1: String,
        city: String,
        state: String,
        pincode: String,
        isDefault: Boolean,
      },
    ],
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    seller: this.seller,
  };
};

export const User = mongoose.model('User', userSchema);
