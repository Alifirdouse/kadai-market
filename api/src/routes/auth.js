import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User.js';
import { config } from '../config.js';
import { ah, HttpError } from '../lib/util.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, signTokens } from '../middleware/auth.js';

const r = Router();

const password = z.string().min(8, 'Use at least 8 characters');
const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number');

const customerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: phone.optional(),
  password,
});

const sellerSchema = customerSchema.extend({
  brandName: z.string().trim().min(2),
  city: z.string().trim().min(2),
  gstin: z
    .string()
    .trim()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i, 'Enter a valid 15-character GSTIN')
    .optional(),
  phone,
});

const session = (user) => ({ user: user.toPublic(), ...signTokens(user) });

// Customer sign-up
r.post(
  '/register',
  validate(customerSchema),
  ah(async (req, res) => {
    const { password: pw, ...rest } = req.body;
    const user = await User.create({ ...rest, role: 'customer', passwordHash: await bcrypt.hash(pw, 12) });
    res.status(201).json(session(user));
  })
);

// Client (seller) sign-up: starts as pending until an admin approves it
r.post(
  '/register-seller',
  validate(sellerSchema),
  ah(async (req, res) => {
    const { password: pw, brandName, city, gstin, ...rest } = req.body;
    const user = await User.create({
      ...rest,
      role: 'seller',
      seller: { brandName, city, gstin, approvalStatus: 'pending' },
      passwordHash: await bcrypt.hash(pw, 12),
    });
    res.status(201).json(session(user));
  })
);

r.post(
  '/login',
  validate(z.object({ email: z.string().trim().email(), password: z.string().min(1) })),
  ah(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+passwordHash');
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'Email or password is incorrect.');
    res.json(session(user));
  })
);

r.post(
  '/refresh',
  validate(z.object({ refreshToken: z.string().min(1) })),
  ah(async (req, res) => {
    let claims;
    try {
      claims = jwt.verify(req.body.refreshToken, config.jwtRefreshSecret);
    } catch {
      throw new HttpError(401, 'Your session has expired. Log in again.');
    }
    const user = await User.findById(claims.sub);
    if (!user) throw new HttpError(401, 'Your session has expired. Log in again.');
    res.json(session(user));
  })
);

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

export default r;
