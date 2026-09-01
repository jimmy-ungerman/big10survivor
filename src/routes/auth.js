import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';
import { REGISTRATION_CLOSES_AT, registrationClosed } from '../config.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

router.get('/registration-status', (req, res) => {
  res.json({ open: !registrationClosed(), closesAt: REGISTRATION_CLOSES_AT.toISOString() });
});

router.post('/register', async (req, res) => {
  if (registrationClosed()) {
    return res.status(403).json({ error: 'Registration is closed — sign-ups have been locked for the season' });
  }

  const { username, password, fullName } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({ error: 'Full name, username, and password required' });
  }

  if (username.length < 2 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be 2-30 characters' });
  }

  const trimmedFullName = fullName.trim();
  if (trimmedFullName.length < 2 || trimmedFullName.length > 60) {
    return res.status(400).json({ error: 'Full name must be 2-60 characters' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  // Check if username is taken
  const { rows: existing } = query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  // First user becomes admin
  const { rows: allUsers } = query('SELECT COUNT(*) as count FROM users');
  const isAdmin = allUsers[0].count === 0 ? 1 : 0;

  const passwordHash = await bcrypt.hash(password, 10);

  const result = query(
    'INSERT INTO users (username, password_hash, full_name, is_admin) VALUES ($1, $2, $3, $4)',
    [username, passwordHash, trimmedFullName, isAdmin]
  );

  const userId = result.lastInsertRowid;

  const token = jwt.sign(
    { userId, username, isAdmin: isAdmin === 1 },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: { id: userId, username, fullName: trimmedFullName, isAdmin: isAdmin === 1 } });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const { rows } = query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.is_admin === 1 },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, COOKIE_OPTS);
  res.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      isAdmin: user.is_admin === 1,
      isEliminated: user.is_eliminated === 1,
      eliminatedWeek: user.eliminated_week,
    }
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = query('SELECT * FROM users WHERE id = $1', [payload.userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        isAdmin: user.is_admin === 1,
        isEliminated: user.is_eliminated === 1,
        eliminatedWeek: user.eliminated_week,
      }
    });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
