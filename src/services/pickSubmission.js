import { query } from '../db/index.js';
import { isBigTenTeam, normalizeBigTenName } from './espn.js';

const TOTAL_BIG_TEN_TEAMS = 18;
const TOTAL_WEEKS = 13;

export class PickError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Shared by the manual "make a pick" endpoint (routes/picks.js) and the
// planned-pick auto-submitter (jobs/autoPicker.js), so both paths enforce
// identical pool rules — used-team, weekly cap, double-pick cap, elimination,
// kickoff lock — with no risk of the two drifting apart.
export function submitPick({ userId, gameId, pickedTeam }) {
  if (!gameId || !pickedTeam) {
    throw new PickError(400, 'gameId and pickedTeam required');
  }

  if (!['home', 'away'].includes(pickedTeam)) {
    throw new PickError(400, 'pickedTeam must be "home" or "away"');
  }

  // Fetch game
  const { rows: gameRows } = query('SELECT * FROM games WHERE id = $1', [gameId]);
  if (gameRows.length === 0) {
    throw new PickError(404, 'Game not found');
  }
  const game = gameRows[0];

  // Check game hasn't started
  const now = new Date();
  const kickoff = new Date(game.commence_time);
  if (now >= kickoff) {
    throw new PickError(400, 'Game has already started — picks are locked');
  }

  // Check user is not eliminated
  const { rows: userRows } = query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userRows[0];
  if (!user) {
    throw new PickError(404, 'User not found');
  }
  if (user.is_eliminated) {
    throw new PickError(400, 'You have been eliminated from the pool');
  }

  // Check the picked team is a Big Ten team
  const pickedTeamName = pickedTeam === 'home' ? game.home_team : game.away_team;
  if (!isBigTenTeam(pickedTeamName)) {
    throw new PickError(400, 'You can only pick Big Ten teams');
  }

  // Normalize the team name
  const normalizedTeamName = normalizeBigTenName(pickedTeamName);

  // Check user hasn't already picked this game
  const { rows: existingGamePick } = query(
    'SELECT id FROM picks WHERE user_id = $1 AND game_id = $2',
    [userId, gameId]
  );
  if (existingGamePick.length > 0) {
    throw new PickError(400, 'You already have a pick for this game');
  }

  // Check user hasn't already used this team this season. Compares normalized
  // (exact) team names in JS rather than a SQL LIKE — a substring match would
  // wrongly treat "Michigan" as already used by a "Michigan State" pick.
  const { rows: seasonPickTeams } = query(
    `SELECT p.picked_team, g.home_team, g.away_team FROM picks p
     JOIN games g ON p.game_id = g.id
     WHERE p.user_id = $1 AND p.season = $2`,
    [userId, game.season]
  );
  const alreadyUsedTeam = seasonPickTeams.some(p => {
    const rawName = p.picked_team === 'home' ? p.home_team : p.away_team;
    return normalizeBigTenName(rawName) === normalizedTeamName;
  });
  if (alreadyUsedTeam) {
    throw new PickError(400, `You have already used ${normalizedTeamName} this season`);
  }

  // Check user hasn't exceeded 2 picks this week
  const { rows: weekPicks } = query(
    'SELECT id FROM picks WHERE user_id = $1 AND week_number = $2 AND season = $3',
    [userId, game.week_number, game.season]
  );
  if (weekPicks.length >= 2) {
    throw new PickError(400, 'You can only make 2 picks per week');
  }

  // If this would be a second pick this week (a double), enforce the 5-week cap
  if (weekPicks.length === 1) {
    const { rows: doubleWeeks } = query(
      `SELECT week_number FROM picks
       WHERE user_id = $1 AND season = $2
       GROUP BY week_number
       HAVING COUNT(*) >= 2`,
      [userId, game.season]
    );
    if (doubleWeeks.length >= 5) {
      throw new PickError(400, 'You have already used all 5 double-pick weeks this season');
    }
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

  const currentWeek = game.week_number;
  const weeksRemaining = TOTAL_WEEKS - currentWeek;

  let warning = null;
  if (teamsRemaining <= weeksRemaining && weeksRemaining > 0) {
    warning = `Warning: You only have ${teamsRemaining} teams remaining for ${weeksRemaining} weeks. You must double-pick every remaining week.`;
  }

  const pick = newPick[0];
  return {
    pick: {
      ...pick,
      picked_team_name: pick.picked_team === 'home'
        ? normalizeBigTenName(pick.home_team) || pick.home_team
        : normalizeBigTenName(pick.away_team) || pick.away_team,
      picked_team_abbr: pick.picked_team === 'home' ? pick.home_abbr : pick.away_abbr,
    },
    warning,
  };
}
