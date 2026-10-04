import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Express 4 does not catch rejected promises from async handlers on its own
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function uniqueSlug(text) {
  return `${slugify(text)}-${crypto.randomBytes(3).toString('hex')}`;
}

// e.g. KM-261003-4F9A2C
export function newOrderNumber(now = new Date()) {
  const d = now.toISOString().slice(2, 10).replace(/-/g, '');
  return `KM-${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
