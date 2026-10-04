import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { HttpError } from '../lib/util.js';

export function signTokens(user) {
  const payload = { sub: user._id.toString(), role: user.role };
  return {
    accessToken: jwt.sign(payload, config.jwtSecret, { expiresIn: '15m' }),
    refreshToken: jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: '7d' }),
  };
}

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

async function loadUser(token) {
  const claims = jwt.verify(token, config.jwtSecret);
  const user = await User.findById(claims.sub);
  if (!user) throw new HttpError(401, 'Your account no longer exists. Log in again.');
  return user;
}

export async function requireAuth(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Log in to continue.');
    req.user = await loadUser(token);
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, 'Your session has expired. Log in again.'));
  }
}

// Attaches req.user when a valid token is present; guests continue without one
export async function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    req.user = await loadUser(token);
  } catch {
    /* treat an invalid token as a guest */
  }
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have access to this page.'));
    }
    next();
  };

export function requireApprovedSeller(req, _res, next) {
  if (req.user?.role !== 'seller') return next(new HttpError(403, 'Seller account required.'));
  if (req.user.seller?.approvalStatus !== 'approved') {
    return next(new HttpError(403, 'Your seller account is waiting for admin approval.'));
  }
  next();
}
