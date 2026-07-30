import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/index.js';
import { isBigTenTeam, normalizeBigTenName, BIG_TEN_TEAMS } from '../services/espn.js';

const router = Router();

const TOTAL_BIG_TEN_TEAMS = 18;
const TOTAL_WEEKS = 13;

router.get('/', requireAuth, (req, res) => {
  let { week, season } = req.query;

  if (!week || !season) {
    // Get the most recent week from games table
    const { rows: latest } = query(
      'SELECT week_number, season FROM games ORDER BY season DESC, week_number DESC LIMIT 1'
    );
    if (latest.length === 0) {
      return res.json({ picks: [], week: null, season: null });
    }
    week = latest[0].week_number;
    season = latest[0].season;
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

  if (!gameId || !pickedTeam) {
    return res.status(400).json({ error: 'gameId and pickedTeam required' });
  }

  if (!['home', 'away'].includes(pickedTeam)) {
    return res.status(400).json({ error: 'pickedTeam must be "home" or "away"' });
  }

  // Fetch game
  const { rows: gameRows } = query('SELECT * FROM games WHERE id = $1', [gameId]);
  if (gameRows.length === 0) {
    return res.status(404).json({ error: 'Game not found' });
  }
  const game = gameRows[0];

  // Check game hasn't started
  const now = new Date();
  const kickoff = new Date(game.commence_time);
  if (now >= kickoff) {
    return res.status(400).json({ error: 'Game has already started — picks are locked' });
  }

  // Check user is not eliminated
  const { rows: userRows } = query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userRows[0];
  if (user.is_eliminated) {
    return res.status(400).json({ error: 'You have been eliminated from the pool' });
  }

  // Check the picked team is a Big Ten team
  const pickedTeamName = pickedTeam === 'home' ? game.home_team : game.away_team;
  if (!isBigTenTeam(pickedTeamName)) {
    return res.status(400).json({ error: 'You can only pick Big Ten teams' });
  }

  // Normalize the team name
  const normalizedTeamName = normalizeBigTenName(pickedTeamName);

  // Check user hasn't already picked this game
  const { rows: existingGamePick } = query(
    'SELECT id FROM picks WHERE user_id = $1 AND game_id = $2',
    [userId, gameId]
  );
  if (existingGamePick.length > 0) {
    return res.status(400).json({ error: 'You already have a pick for this game' });
  }

  // Check user hasn't already used this team this season
  const { rows: usedTeamPicks } = query(
    `SELECT p.id FROM picks p
     JOIN games g ON p.game_id = g.id
     WHERE p.user_id = $1
       AND p.season = $2
       AND (
         (p.picked_team = 'home' AND g.home_team LIKE $3)
         OR (p.picked_team = 'away' AND g.away_team LIKE $3)
       )`,
    [userId, game.season, `%${normalizedTeamName}%`]
  );
  if (usedTeamPicks.length > 0) {
    return res.status(400).json({ error: `You have already used ${normalizedTeamName} this season` });
  }

  // Check user hasn't exceeded 2 picks this week
  const { rows: weekPicks } = query(
    'SELECT id FROM picks WHERE user_id = $1 AND week_number = $2 AND season = $3',
    [userId, game.week_number, game.season]
  );
  if (weekPicks.length >= 2) {
    return res.status(400).json({ error: 'You can only make 2 picks per week' });
  }

  // Insert pick
  const result = query(
    `INSERT INTO picks (user_id, game_id, week_number, season, picked_team)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, gameId, game.week_number, game.season, pickedTeam]
  );

  const { rows: newPick } = query(
    `SELECT p.*, g.home_team, g.away_team, g.home_abbr, g.away_abbr,
            g.commence_time, g.status as game_status
     FROM picks p JOIN games g ON p.game_id = g.id
     WHERE p.id = $1`,
    [result.lastInsertRowid]
  );

  // Check if we need to warn about running low on teams
  const { rows: allSeasonPicks } = query(
    `SELECT DISTINCT
       CASE WHEN p.picked_team = 'home' THEN g.home_team ELSE g.away_team END as team
     FROM picks p
     JOIN games g ON p.game_id = g.id
     WHERE p.user_id = $1 AND p.season = $2`,
    [userId, game.season]
  );

  const teamsUsed = allSeasonPicks.length;
  const teamsRemaining = TOTAL_BIG_TEN_TEAMS - teamsUsed;

  // Determine current week and weeks remaining
  const { rows: maxWeekRow } = query(
    'SELECT MAX(week_number) as max_week FROM games WHERE season = $1',
    [game.season]
  );
  const currentWeek = game.week_number;
  const weeksRemaining = TOTAL_WEEKS - currentWeek;

  let warning = null;
  if (teamsRemaining <= weeksRemaining && weeksRemaining > 0) {
    warning = `Warning: You only have ${teamsRemaining} teams remaining for ${weeksRemaining} weeks. You must double-pick every remaining week.`;
  }

  const pick = newPick[0];
  res.json({
    pick: {
      ...pick,
      picked_team_name: pick.picked_team === 'home'
        ? normalizeBigTenName(pick.home_team) || pick.home_team
        : normalizeBigTenName(pick.away_team) || pick.away_team,
      picked_team_abbr: pick.picked_team === 'home' ? pick.home_abbr : pick.away_abbr,
    },
    warning,
  });
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
