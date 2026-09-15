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
// gets picked up before its game locks.
//
// A planned_picks row is a one-shot fulfillment request, not a standing
// instruction: the moment submitPick() succeeds for it, it's deleted. This
// matters for exactly one case — if a player later deletes that auto-created
// pick on the Pick Sheet and picks something else instead, a *retried*
// planned row would fight them on the next cron tick (re-inserting the
// team they just backed out of, silently burning a 2nd pick for that week).
// Deleting on success means there's nothing left to retry, so a manual
// change always wins once it's been delivered once. A *failed* attempt
// (cap reached, team already used some other way, etc.) leaves the row in
// place so it keeps getting retried — it hasn't been delivered yet.
export async function applyPlannedPicks() {
  try {
    const season = currentSeason();
    const week = getCurrentWeek(season);
    if (!week) return;

    const { rows: planned } = query(
      `SELECT pp.id, pp.user_id, pp.team_name
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
        query('DELETE FROM planned_picks WHERE id = $1', [row.id]);
        console.log(`Auto-picked ${row.team_name} (week ${week}) for user ${row.user_id}`);
      } catch (err) {
        // Expected/benign: already picked this game, team already used some
        // other way, at the weekly/double-pick cap, etc. — leave the row in
        // place for the next tick to retry. Anything else is worth knowing
        // about.
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
