import 'dotenv/config';

const env = (name, fallback) => {
  const v = process.env[name];
  if (v === undefined || v.trim() === '' || v.trim() === 'unset') {
    if (fallback === undefined) throw new Error(`Missing environment variable ${name}`);
    return fallback;
  }
  return v.trim();
};

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(env('PORT', '4000')),
  mongoUri: env('MONGO_URI', 'mongodb://localhost:27017/kadai'),
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:3000').split(','),
  jwtSecret: isProd ? env('JWT_SECRET') : env('JWT_SECRET', 'dev-access-secret'),
  jwtRefreshSecret: isProd ? env('JWT_REFRESH_SECRET') : env('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
  razorpay: {
    keyId: env('RAZORPAY_KEY_ID', ''),
    keySecret: env('RAZORPAY_KEY_SECRET', ''),
    webhookSecret: env('RAZORPAY_WEBHOOK_SECRET', ''),
  },
  serviceBus: {
    connection: env('SERVICEBUS_CONNECTION', ''),
    topic: env('SERVICEBUS_TOPIC', 'orders'),
  },
  paymentTimeoutMinutes: Number(env('PAYMENT_TIMEOUT_MINUTES', '15')),
  freeShippingAbove: 499,
  shippingFee: 40,
  newArrivalDays: 30,
};
