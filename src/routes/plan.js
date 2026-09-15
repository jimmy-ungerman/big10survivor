import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/index.js';

const router = Router();

// Planned-but-not-locked picks from the Plan tab — synced up from
// localStorage so jobs/autoPicker.js can see them server-side and submit
// them as real picks once their week goes live (see planned_picks in
// schema.sql). Shape matches what PlanningSheet.jsx already keeps in
// localStorage: { [weekNumber]: [teamName, ...] }.
router.get('/', requireAuth, (req, res) => {
  const { season } = req.query;
  if (!season) return res.status(400).json({ error: 'season required' });

  const { rows } = query(
    'SELECT week_number, team_name FROM planned_picks WHERE user_id = $1 AND season = $2 ORDER BY id',
    [req.user.userId, season]
  );

  const planData = {};
  for (const row of rows) {
    const key = String(row.week_number);
    if (!planData[key]) planData[key] = [];
    planData[key].push(row.team_name);
  }

  res.json({ planData });
});

// Replaces the player's entire plan for a season in one shot — mirrors how
// the client already treats planData as one blob (see the localStorage
// effect in PlanningSheet.jsx).
router.put('/', requireAuth, (req, res) => {
  const { season, planData } = req.body;
  const userId = req.user.userId;

  if (!season || typeof planData !== 'object' || planData === null) {
    return res.status(400).json({ error: 'season and planData required' });
  }

  query('DELETE FROM planned_picks WHERE user_id = $1 AND season = $2', [userId, season]);

  for (const [week, teams] of Object.entries(planData)) {
    const weekNumber = Number(week);
    if (!Number.isInteger(weekNumber) || !Array.isArray(teams)) continue;

    for (const team of teams) {
      if (typeof team !== 'string' || !team) continue;
      query(
        `INSERT INTO planned_picks (user_id, season, week_number, team_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(user_id, season, team_name) DO UPDATE SET week_number = $3`,
        [userId, season, weekNumber, team]
      );
    }
  }

  res.json({ ok: true });
});

export default router;
