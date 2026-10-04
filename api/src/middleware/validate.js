import { HttpError } from '../lib/util.js';

// Validates req.body (or req.query) against a zod schema and replaces it with the parsed value
export const validate =
  (schema, where = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[where]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(new HttpError(400, 'Some fields need fixing.', details));
    }
    req[where === 'body' ? 'body' : 'validQuery'] = result.data;
    next();
  };
