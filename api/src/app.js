import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import sellerRoutes from './routes/seller.js';
import adminRoutes from './routes/admin.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Azure Front Door / Container Apps ingress
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

  // Payments are mounted before express.json(): the webhook needs the raw body for its signature
  app.use('/api/v1/payments', paymentRoutes);
  app.use(express.json({ limit: '200kb' }));

  app.get('/health', (_req, res) =>
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'up' : 'down', time: new Date().toISOString() })
  );

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-7', legacyHeaders: false });
  app.use('/api/v1/auth', authLimiter, authRoutes);
  app.use('/api/v1/products', productRoutes);
  app.use('/api/v1/cart', cartRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1/seller', sellerRoutes);
  app.use('/api/v1/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
