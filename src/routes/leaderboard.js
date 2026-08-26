import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/index.js';
import { normalizeBigTenName, BIG_TEN_TEAMS } from '../services/espn.js';

const router = Router();

const TOTAL_BIG_TEN_TEAMS = 18;
const TOTAL_WEEKS = 13;

router.get('/', requireAuth, (req, res) => {
  const { rows: users } = query(
    'SELECT id, username, full_name, is_admin, is_eliminated, eliminated_week, is_paid, created_at FROM users ORDER BY created_at ASC'
  );

  // Get current week/season
  const { rows: latestGame } = query(
    'SELECT week_number, season FROM games ORDER BY season DESC, week_number DESC LIMIT 1'
  );
  const currentWeek = latestGame[0]?.week_number || 1;
  const currentSeason = latestGame[0]?.season || new Date().getFullYear();

  const leaderboard = users.map(user => {
    // Get all picks for this season
    const { rows: seasonPicks } = query(
      `SELECT p.*, g.home_team, g.away_team, g.home_abbr, g.away_abbr,
              g.commence_time, g.status as game_status
       FROM picks p
       JOIN games g ON p.game_id = g.id
       WHERE p.user_id = $1 AND p.season = $2
       ORDER BY p.week_number ASC`,
      [user.id, currentSeason]
    );

    // Used teams this season
    const usedTeams = seasonPicks.map(p => {
      const rawName = p.picked_team === 'home' ? p.home_team : p.away_team;
      return normalizeBigTenName(rawName) || rawName;
    });

    // Get this week's picks
    const thisWeekPicks = seasonPicks
      .filter(p => p.week_number === currentWeek)
      .map(p => ({
        id: p.id,
        game_id: p.game_id,
        picked_team: p.picked_team,
        picked_team_name: p.picked_team === 'home'
          ? normalizeBigTenName(p.home_team) || p.home_team
          : normalizeBigTenName(p.away_team) || p.away_team,
        picked_team_abbr: p.picked_team === 'home' ? p.home_abbr : p.away_abbr,
        result: p.result,
        game_status: p.game_status,
        commence_time: p.commence_time,
      }));

    // Count weeks survived (weeks where all picks resulted in win, or week is still in progress)
    const weekGroups = {};
    for (const pick of seasonPicks) {
      if (!weekGroups[pick.week_number]) weekGroups[pick.week_number] = [];
      weekGroups[pick.week_number].push(pick);
    }

    let weeksSurvived = 0;
    for (const [weekNum, weekPicks] of Object.entries(weekGroups)) {
      const allWins = weekPicks.every(p => p.result === 'win');
      if (allWins) weeksSurvived++;
    }

    const remainingTeams = BIG_TEN_TEAMS.filter(t => !usedTeams.includes(t));
    const weeksRemaining = TOTAL_WEEKS - currentWeek;
    const needsDoublePick = remainingTeams.length <= weeksRemaining && weeksRemaining > 0;

    // For eliminated players, find the losing picks from their eliminated week
    const eliminationPicks = user.is_eliminated === 1
      ? seasonPicks
          .filter(p => p.week_number === user.eliminated_week && p.result === 'loss')
          .map(p => ({
            week: p.week_number,
            pickedTeamName: p.picked_team === 'home'
              ? normalizeBigTenName(p.home_team) || p.home_team
              : normalizeBigTenName(p.away_team) || p.away_team,
            pickedTeamAbbr: p.picked_team === 'home' ? p.home_abbr : p.away_abbr,
            opponentName: p.picked_team === 'home'
              ? normalizeBigTenName(p.away_team) || p.away_team
              : normalizeBigTenName(p.home_team) || p.home_team,
            opponentAbbr: p.picked_team === 'home' ? p.away_abbr : p.home_abbr,
          }))
      : [];

    return {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      isAdmin: user.is_admin === 1,
      isEliminated: user.is_eliminated === 1,
      eliminatedWeek: user.eliminated_week,
      eliminationPicks,
      isPaid: user.is_paid === 1,
      weeksSurvived,
      currentWeekPicks: thisWeekPicks,
      usedTeams,
      remainingTeams,
      teamsRemaining: remainingTeams.length,
      needsDoublePick,
    };
  });

  // Sort: active users first by weeks survived desc, then eliminated users by eliminated_week desc
  leaderboard.sort((a, b) => {
    if (a.isEliminated !== b.isEliminated) {
      return a.isEliminated ? 1 : -1;
    }
    return b.weeksSurvived - a.weeksSurvived;
  });

  res.json({ leaderboard, currentWeek, season: currentSeason });
});

export default router;
