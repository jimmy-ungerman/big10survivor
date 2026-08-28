import cron from 'node-cron';
import { query } from '../db/index.js';
import { getFullSchedule } from './espn.js';

// The survivor pool runs across the 13-week regular season.
const REGULAR_SEASON_WEEKS = 13;

export function currentSeason() {
  return new Date().getFullYear();
}

export function seasonIsSeeded(season) {
  const { rows } = query('SELECT COUNT(*) AS n FROM games WHERE season = $1', [season]);
  return rows[0].n > 0;
}

// Upsert a single parsed ESPN event. Games are keyed by espn_id (UNIQUE), so this
// is idempotent. Unlike the old /games route, ranks are updated unconditionally so
// a team dropping out of the AP Top 25 is reflected, not just first-time backfill.
function upsertGame(event, week, season) {
  const { rows: existing } = query('SELECT id FROM games WHERE espn_id = $1', [event.espnId]);

  if (existing.length > 0) {
    query(
      `UPDATE games SET
         home_team = $1, away_team = $2,
         home_abbr = $3, away_abbr = $4,
         week_number = $5, commence_time = $6,
         status = $7, home_score = $8, away_score = $9,
         home_rank = $10, away_rank = $11,
         updated_at = CURRENT_TIMESTAMP
       WHERE espn_id = $12`,
      [
        event.homeTeam, event.awayTeam,
        event.homeAbbr, event.awayAbbr,
        week, event.commenceTime,
        event.status, event.homeScore, event.awayScore,
        event.homeRank, event.awayRank,
        event.espnId,
      ]
    );
  } else {
    query(
      `INSERT INTO games
        (espn_id, home_team, away_team, home_abbr, away_abbr, week_number, season, commence_time, status, home_score, away_score, home_rank, away_rank)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        event.espnId, event.homeTeam, event.awayTeam,
        event.homeAbbr, event.awayAbbr,
        week, season, event.commenceTime,
        event.status, event.homeScore, event.awayScore,
        event.homeRank, event.awayRank,
      ]
    );
  }
}

// Pull every Big Ten game for the whole season from ESPN (weeks fetched in
// parallel) and upsert into the games table. Safe to run repeatedly — it also
// refreshes AP rankings and firms up kickoff times as ESPN updates them.
export async function seedSchedule(season = currentSeason()) {
  const { schedule } = await getFullSchedule(season, REGULAR_SEASON_WEEKS);

  let count = 0;
  const weeks = Object.keys(schedule).map(Number).sort((a, b) => a - b);
  for (const week of weeks) {
    for (const event of schedule[week]) {
      upsertGame(event, week, season);
      count++;
    }
  }

  if (count > 0) {
    console.log(`Schedule seeder: upserted ${count} games for ${season}`);
  } else {
    console.warn(`Schedule seeder: ESPN returned no games for ${season}`);
  }
  return count;
}

// Derive the active week straight from the DB — no ESPN round-trips. The current
// week is the earliest week that still has an unfinished game; once every game in
// the season is complete we fall back to the last week on record.
export function getCurrentWeek(season) {
  const { rows: active } = query(
    `SELECT MIN(week_number) AS wk FROM games
     WHERE season = $1 AND status != 'complete'`,
    [season]
  );
  if (active[0]?.wk != null) return active[0].wk;

  const { rows: last } = query(
    'SELECT MAX(week_number) AS wk FROM games WHERE season = $1',
    [season]
  );
  return last[0]?.wk ?? 1;
}

export function startScheduleSeeder() {
  // Seed once on boot (non-blocking) so a fresh deploy mid-week has data.
  seedSchedule().catch(err => console.error('Startup schedule seed failed:', err));

  // Refresh daily at 09:00 UTC (~04:00–05:00 ET) — picks up the new AP poll and
  // any kickoff-time changes ESPN firms up as game weeks approach.
  cron.schedule('0 9 * * *', () => {
    seedSchedule().catch(err => console.error('Scheduled schedule seed failed:', err));
  });
  console.log('Schedule seeder started (daily at 09:00 UTC)');
}
