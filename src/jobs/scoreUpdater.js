import cron from 'node-cron';
import { query } from '../db/index.js';
import { fetchLiveScores } from '../services/espn.js';
import { calculateResult } from '../services/results.js';

async function updateScores() {
  try {
    // Get all games that are not yet complete
    const { rows: activeGames } = query(
      `SELECT * FROM games WHERE status != 'complete'`
    );

    if (activeGames.length === 0) return;

    const espnIds = activeGames.map(g => g.espn_id);
    const liveScores = await fetchLiveScores(espnIds);

    for (const scoreData of liveScores) {
      query(
        `UPDATE games SET
          status = $1,
          home_score = $2,
          away_score = $3,
          updated_at = CURRENT_TIMESTAMP
         WHERE espn_id = $4`,
        [scoreData.status, scoreData.homeScore, scoreData.awayScore, scoreData.espnId]
      );
    }

    // Now resolve pending picks for completed games
    const { rows: completedGames } = query(
      `SELECT * FROM games WHERE status = 'complete'`
    );

    const completedIds = completedGames.map(g => g.id);
    if (completedIds.length === 0) return;

    const { rows: pendingPicks } = query(
      `SELECT p.*, g.home_score, g.away_score, g.status as game_status
       FROM picks p
       JOIN games g ON p.game_id = g.id
       WHERE p.result = 'pending' AND g.status = 'complete'`
    );

    const resolvedWeeks = new Set();

    for (const pick of pendingPicks) {
      const result = calculateResult(pick, {
        status: pick.game_status,
        home_score: pick.home_score,
        away_score: pick.away_score,
      });

      if (result !== 'pending') {
        query(
          `UPDATE picks SET result = $1 WHERE id = $2`,
          [result, pick.id]
        );
        resolvedWeeks.add(`${pick.season}-${pick.week_number}`);
      }
    }

    // Check for eliminations after resolving picks
    for (const weekKey of resolvedWeeks) {
      const [season, weekNumber] = weekKey.split('-').map(Number);
      await checkEliminations(season, weekNumber);
    }
  } catch (err) {
    console.error('Score updater error:', err);
  }
}

async function checkEliminations(season, weekNumber) {
  // Find users who have a loss this week and aren't already eliminated
  const { rows: losers } = query(
    `SELECT DISTINCT p.user_id
     FROM picks p
     WHERE p.week_number = $1
       AND p.season = $2
       AND p.result = 'loss'
       AND p.user_id NOT IN (
         SELECT id FROM users WHERE is_eliminated = 1
       )`,
    [weekNumber, season]
  );

  for (const loser of losers) {
    // Make sure all their picks for this week are settled (no pending)
    const { rows: pendingPicks } = query(
      `SELECT id FROM picks
       WHERE user_id = $1 AND week_number = $2 AND season = $3 AND result = 'pending'`,
      [loser.user_id, weekNumber, season]
    );

    if (pendingPicks.length === 0) {
      // All picks settled and at least one loss — eliminate
      query(
        `UPDATE users SET is_eliminated = 1, eliminated_week = $1 WHERE id = $2`,
        [weekNumber, loser.user_id]
      );
      console.log(`User ${loser.user_id} eliminated in week ${weekNumber}`);
    }
  }
}

export function startScoreUpdater() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    updateScores();
  });
  console.log('Score updater started (every 5 minutes)');
}
