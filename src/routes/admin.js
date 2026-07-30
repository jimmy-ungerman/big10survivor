import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { query } from '../db/index.js';

const router = Router();

router.patch('/users/:id/paid', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { paid } = req.body;

  if (typeof paid !== 'boolean') {
    return res.status(400).json({ error: 'paid must be a boolean' });
  }

  const { rows } = query('SELECT id FROM users WHERE id = $1', [id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  query('UPDATE users SET is_paid = $1 WHERE id = $2', [paid ? 1 : 0, id]);
  res.json({ ok: true, id: Number(id), isPaid: paid });
});

export default router;
