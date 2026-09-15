import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/index.js';
import { normalizeBigTenName, BIG_TEN_TEAMS } from '../services/espn.js';
import { currentSeason, getCurrentWeek } from '../services/schedule.js';
import { submitPick, PickError } from '../services/pickSubmission.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  let { week, season } = req.query;

  if (!week || !season) {
    // Default to the active week, derived from the DB (see services/schedule.js).
    season = currentSeason();
    const { rows: any } = query('SELECT 1 FROM games WHERE season = $1 LIMIT 1', [season]);
    if (any.length === 0) {
      return res.json({ picks: [], week: null, season: null });
    }
    week = getCurrentWeek(season);
  }

  const { rows: picks } = query(
    `SELECT
       p.id, p.user_id, p.game_id, p.week_number, p.season,
       p.picked_team, p.result, p.created_at,
       u.username,
       g.home_team, g.away_team, g.home_abbr, g.away_abbr,
       g.commence_time, g.status as game_status,
       g.home_score, g.away_score
     FROM picks p
     JOIN users u ON p.user_id = u.id
     JOIN games g ON p.game_id = g.id
     WHERE p.week_number = $1 AND p.season = $2
     ORDER BY u.username ASC, p.created_at ASC`,
    [week, season]
  );

  const enriched = picks.map(p => ({
    ...p,
    picked_team_name: p.picked_team === 'home'
      ? normalizeBigTenName(p.home_team) || p.home_team
      : normalizeBigTenName(p.away_team) || p.away_team,
    picked_team_abbr: p.picked_team === 'home' ? p.home_abbr : p.away_abbr,
  }));

  res.json({ picks: enriched, week: Number(week), season: Number(season) });
});

router.post('/', requireAuth, (req, res) => {
  const { gameId, pickedTeam } = req.body;
  const userId = req.user.userId;

  try {
    const { pick, warning } = submitPick({ userId, gameId, pickedTeam });
    res.json({ pick, warning });
  } catch (err) {
    if (err instanceof PickError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

router.delete('/:pickId', requireAuth, (req, res) => {
  const { pickId } = req.params;
  const userId = req.user.userId;

  const { rows: pickRows } = query(
    `SELECT p.*, g.commence_time
     FROM picks p JOIN games g ON p.game_id = g.id
     WHERE p.id = $1`,
    [pickId]
  );

  if (pickRows.length === 0) {
    return res.status(404).json({ error: 'Pick not found' });
  }

  const pick = pickRows[0];

  if (pick.user_id !== userId) {
    return res.status(403).json({ error: 'Cannot delete another user\'s pick' });
  }

  const now = new Date();
  const kickoff = new Date(pick.commence_time);
  if (now >= kickoff) {
    return res.status(400).json({ error: 'Cannot remove a pick after the game has started' });
  }

  query('DELETE FROM picks WHERE id = $1', [pickId]);
  res.json({ ok: true });
});

// All picks for the current user for a full season (used by planning sheet)
router.get('/my-season', requireAuth, (req, res) => {
  const userId = req.user.userId;
  const { season } = req.query;

  if (!season) return res.status(400).json({ error: 'season required' });

  const { rows: picks } = query(
    `SELECT
       p.id, p.week_number, p.season, p.picked_team, p.result,
       g.id as game_id, g.home_team, g.away_team, g.home_abbr, g.away_abbr,
       g.commence_time, g.status as game_status, g.home_score, g.away_score
     FROM picks p
     JOIN games g ON p.game_id = g.id
     WHERE p.user_id = $1 AND p.season = $2
     ORDER BY p.week_number ASC, p.created_at ASC`,
    [userId, season]
  );

  const enriched = picks.map(p => ({
    ...p,
    picked_team_name: p.picked_team === 'home'
      ? normalizeBigTenName(p.home_team) || p.home_team
      : normalizeBigTenName(p.away_team) || p.away_team,
    picked_team_abbr: p.picked_team === 'home' ? p.home_abbr : p.away_abbr,
  }));

  res.json({ picks: enriched, season: Number(season) });
});

// Get remaining teams for the current user
router.get('/my-teams', requireAuth, (req, res) => {
  const userId = req.user.userId;
  const { season } = req.query;

  if (!season) {
    return res.status(400).json({ error: 'season required' });
  }

  const { rows: usedRows } = query(
    `SELECT
       CASE WHEN p.picked_team = 'home' THEN g.home_team ELSE g.away_team END as team_name
     FROM picks p
     JOIN games g ON p.game_id = g.id
     WHERE p.user_id = $1 AND p.season = $2`,
    [userId, season]
  );

  const usedTeamNames = usedRows.map(r => r.team_name);
  const usedNormalized = usedTeamNames.map(n => normalizeBigTenName(n)).filter(Boolean);

  const remainingTeams = BIG_TEN_TEAMS.filter(t => !usedNormalized.includes(t));

  res.json({
    usedTeams: usedNormalized,
    remainingTeams,
    teamsUsed: usedNormalized.length,
    teamsRemaining: remainingTeams.length,
  });
});

export default router;
