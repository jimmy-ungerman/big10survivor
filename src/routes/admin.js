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

router.patch('/users/:id/full-name', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { fullName } = req.body;

  const trimmed = typeof fullName === 'string' ? fullName.trim() : '';
  if (trimmed.length < 2 || trimmed.length > 60) {
    return res.status(400).json({ error: 'Full name must be 2-60 characters' });
  }

  const { rows } = query('SELECT id FROM users WHERE id = $1', [id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  query('UPDATE users SET full_name = $1 WHERE id = $2', [trimmed, id]);
  res.json({ ok: true, id: Number(id), fullName: trimmed });
});

export default router;
