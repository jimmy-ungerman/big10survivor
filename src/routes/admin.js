import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../middleware/auth.js';
import { query } from '../db/index.js';
import { currentSeason, getCurrentWeek } from '../services/schedule.js';

const router = Router();

// Which active (non-eliminated) players haven't submitted a pick for a given
// week yet. Defaults to the current week/season (see services/schedule.js).
// Also surfaces queued Plan-tab picks so the admin can see who's covered by
// auto-submit (see jobs/autoPicker.js) vs. truly missing.
router.get('/missing-picks', requireAdmin, (req, res) => {
  const season = req.query.season ? Number(req.query.season) : currentSeason();
  const week = req.query.week ? Number(req.query.week) : getCurrentWeek(season);

  const { rows: users } = query(
    'SELECT id, username, full_name FROM users WHERE is_eliminated = 0 ORDER BY username ASC'
  );

  const { rows: picks } = query(
    'SELECT DISTINCT user_id FROM picks WHERE week_number = $1 AND season = $2',
    [week, season]
  );
  const pickedUserIds = new Set(picks.map(p => p.user_id));

  const { rows: planned } = query(
    'SELECT user_id, team_name FROM planned_picks WHERE week_number = $1 AND season = $2',
    [week, season]
  );
  const plannedByUser = new Map();
  for (const p of planned) {
    if (!plannedByUser.has(p.user_id)) plannedByUser.set(p.user_id, []);
    plannedByUser.get(p.user_id).push(p.team_name);
  }

  const { rows: kickoffRows } = query(
    'SELECT MIN(commence_time) AS next_kickoff FROM games WHERE season = $1 AND week_number = $2',
    [season, week]
  );

  const missing = users
    .filter(u => !pickedUserIds.has(u.id))
    .map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      plannedTeams: plannedByUser.get(u.id) || [],
    }));

  res.json({
    week,
    season,
    missing,
    totalActive: users.length,
    nextKickoff: kickoffRows[0]?.next_kickoff ?? null,
  });
});

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

// Reset a user's password (the "forgot password" flow — no email). Admin hands
// the user the temp password out-of-band; they're forced to change it on next login.
router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { tempPassword } = req.body;

  if (!tempPassword || tempPassword.length < 4) {
    return res.status(400).json({ error: 'Temporary password must be at least 4 characters' });
  }

  const { rows } = query('SELECT id, username FROM users WHERE id = $1', [id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const passwordHash = await bcrypt.hash(tempPassword, 10);
  query(
    'UPDATE users SET password_hash = $1, must_change_password = 1 WHERE id = $2',
    [passwordHash, id]
  );

  res.json({ ok: true, id: Number(id), username: rows[0].username, mustChangePassword: true });
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
