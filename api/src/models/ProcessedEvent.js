import mongoose from 'mongoose';

// Records webhook event IDs so a repeated delivery from Razorpay is ignored (idempotency)
const processedEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: String,
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  },
  { versionKey: false }
);

export const ProcessedEvent = mongoose.model('ProcessedEvent', processedEventSchema);
