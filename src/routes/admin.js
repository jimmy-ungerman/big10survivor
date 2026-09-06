import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../middleware/auth.js';
import { query } from '../db/index.js';

const router = Router();

// Manually create an account (for people who registered out-of-band after the
// registration lock). They log in with the temp password and are forced to
// change it on first login (must_change_password = 1).
router.post('/users', requireAdmin, async (req, res) => {
  const { username, fullName, tempPassword, isPaid } = req.body;

  if (!username || !fullName || !tempPassword) {
    return res.status(400).json({ error: 'Full name, username, and temporary password required' });
  }

  if (username.length < 2 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be 2-30 characters' });
  }

  const trimmedFullName = fullName.trim();
  if (trimmedFullName.length < 2 || trimmedFullName.length > 60) {
    return res.status(400).json({ error: 'Full name must be 2-60 characters' });
  }

  if (tempPassword.length < 4) {
    return res.status(400).json({ error: 'Temporary password must be at least 4 characters' });
  }

  const { rows: existing } = query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const result = query(
    `INSERT INTO users (username, password_hash, full_name, is_admin, is_paid, must_change_password)
     VALUES ($1, $2, $3, 0, $4, 1)`,
    [username, passwordHash, trimmedFullName, isPaid ? 1 : 0]
  );

  res.json({
    user: {
      id: result.lastInsertRowid,
      username,
      fullName: trimmedFullName,
      isPaid: !!isPaid,
      mustChangePassword: true,
    },
  });
});

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
