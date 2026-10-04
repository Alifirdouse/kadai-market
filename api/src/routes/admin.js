import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, HttpError } from '../lib/util.js';

const r = Router();
r.use(requireAuth, requireRole('admin'));

r.get(
  '/sellers',
  ah(async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const sellers = await User.find({ role: 'seller', 'seller.approvalStatus': status }).sort({ createdAt: -1 });
    res.json({ sellers: sellers.map((s) => s.toPublic()) });
  })
);

r.patch(
  '/sellers/:id',
  validate(z.object({ approvalStatus: z.enum(['approved', 'rejected']) })),
  ah(async (req, res) => {
    const seller = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'seller' },
      { $set: { 'seller.approvalStatus': req.body.approvalStatus } },
      { new: true }
    );
    if (!seller) throw new HttpError(404, 'Seller not found.');
    res.json({ seller: seller.toPublic() });
  })
);

// Platform sales for the last 30 days
r.get(
  '/reports/sales',
  ah(async (_req, res) => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const byDay = await Order.aggregate([
      { $match: { status: { $in: ['CONFIRMED', 'COMPLETED'] }, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, orders: { $sum: 1 }, revenue: { $sum: '$amounts.total' } } },
      { $sort: { _id: 1 } },
    ]);
    res.json({ days: byDay.map((d) => ({ date: d._id, orders: d.orders, revenue: d.revenue })) });
  })
);

export default r;
