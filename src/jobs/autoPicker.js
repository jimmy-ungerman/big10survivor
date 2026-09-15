import cron from 'node-cron';
import { query } from '../db/index.js';
import { currentSeason, getCurrentWeek } from '../services/schedule.js';
import { normalizeBigTenName } from '../services/espn.js';
import { submitPick, PickError } from '../services/pickSubmission.js';

// Converts planned picks (the Plan tab, synced server-side via routes/plan.js)
// into real picks once the current week goes live — "by default, automatically
// select a user's planned picks for a week at the start of the next week."
//
// Fires every 5 minutes for whatever week is currently active (not just at
// the exact moment it becomes active), so a planned pick added mid-week still
// gets picked up before its game locks. Naturally idempotent: submitPick()
// rejects a game the user already has a pick for, so re-running against an
// already-applied plan is a harmless no-op.
export async function applyPlannedPicks() {
  try {
    const season = currentSeason();
    const week = getCurrentWeek(season);
    if (!week) return;

    const { rows: planned } = query(
      `SELECT pp.user_id, pp.team_name
       FROM planned_picks pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.season = $1 AND pp.week_number = $2 AND u.is_eliminated = 0`,
      [season, week]
    );
    if (planned.length === 0) return;

    const { rows: weekGames } = query(
      'SELECT * FROM games WHERE season = $1 AND week_number = $2',
      [season, week]
    );

    for (const row of planned) {
      const game = weekGames.find(g =>
        normalizeBigTenName(g.home_team) === row.team_name ||
        normalizeBigTenName(g.away_team) === row.team_name
      );
      if (!game) continue; // team's game not in this week's schedule (shouldn't happen)

      if (new Date() >= new Date(game.commence_time)) continue; // already locked — leave it, don't retroactively pick

      const pickedTeam = normalizeBigTenName(game.home_team) === row.team_name ? 'home' : 'away';

      try {
        submitPick({ userId: row.user_id, gameId: game.id, pickedTeam });
        console.log(`Auto-picked ${row.team_name} (week ${week}) for user ${row.user_id}`);
      } catch (err) {
        // Expected/benign: already picked this game, team already used some
        // other way, at the weekly/double-pick cap, etc. Anything else is
        // worth knowing about.
        if (!(err instanceof PickError)) {
          console.error('Auto-picker submitPick error:', err);
        }
      }
    }
  } catch (err) {
    console.error('Auto-picker error:', err);
  }
}

export function startAutoPicker() {
  cron.schedule('*/5 * * * *', () => {
    applyPlannedPicks();
  });
  console.log('Auto-picker started (every 5 minutes)');
}
