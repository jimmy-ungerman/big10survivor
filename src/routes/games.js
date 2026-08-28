import { Router } from 'express';
import { query } from '../db/index.js';
import { isBigTenTeam, normalizeBigTenName } from '../services/espn.js';
import { currentSeason, seasonIsSeeded, seedSchedule, getCurrentWeek } from '../services/schedule.js';

const router = Router();

// The daily seeder (services/schedule.js) normally keeps every week populated.
// These are the request-path fallbacks: a cold start before the cron's first run,
// or a future week ESPN hadn't fully scheduled at the last seed. Throttled so a
// genuinely empty ESPN response can't trigger a refetch storm.
let lastOnDemandSeed = 0;
const ON_DEMAND_SEED_THROTTLE = 10 * 60 * 1000; // 10 minutes

async function maybeSeed(season, force) {
  if (!force && Date.now() - lastOnDemandSeed < ON_DEMAND_SEED_THROTTLE) return;
  lastOnDemandSeed = Date.now();
  await seedSchedule(season);
}

function enrichGame(g) {
  return {
    ...g,
    home_is_big_ten: isBigTenTeam(g.home_team),
    away_is_big_ten: isBigTenTeam(g.away_team),
    home_big_ten_name: normalizeBigTenName(g.home_team),
    away_big_ten_name: normalizeBigTenName(g.away_team),
  };
}

function weekGames(week, season) {
  return query(
    'SELECT * FROM games WHERE week_number = $1 AND season = $2 ORDER BY commence_time ASC',
    [week, season]
  ).rows;
}

// Current week's games — served straight from the DB, no ESPN call in the request path.
router.get('/', async (req, res) => {
  try {
    const season = currentSeason();
    if (!seasonIsSeeded(season)) await maybeSeed(season, true);

    let week = getCurrentWeek(season);
    let games = weekGames(week, season);

    // A future week ESPN hadn't scheduled yet at the last seed — try once more.
    if (games.length === 0) {
      await maybeSeed(season, false);
      week = getCurrentWeek(season);
      games = weekGames(week, season);
    }

    res.json({ games: games.map(enrichGame), week, season });
  } catch (err) {
    console.error('Games route error:', err);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Full season schedule for the planning sheet — also straight from the DB.
router.get('/schedule', async (req, res) => {
  try {
    const season = currentSeason();
    if (!seasonIsSeeded(season)) await maybeSeed(season, true);

    const { rows: games } = query(
      'SELECT * FROM games WHERE season = $1 ORDER BY week_number ASC, commence_time ASC',
      [season]
    );

    const schedule = {};
    for (const g of games) {
      (schedule[g.week_number] ||= []).push({
        espnId: g.espn_id,
        homeTeam: g.home_team,
        awayTeam: g.away_team,
        homeAbbr: g.home_abbr,
        awayAbbr: g.away_abbr,
        homeRank: g.home_rank,
        awayRank: g.away_rank,
        commenceTime: g.commence_time,
        status: g.status,
        homeScore: g.home_score,
        awayScore: g.away_score,
      });
    }

    res.json({ season, schedule });
  } catch (err) {
    console.error('Schedule route error:', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Force a re-seed from ESPN (refreshes rankings, kickoff times, scores).
router.post('/refresh', async (req, res) => {
  try {
    const count = await seedSchedule(currentSeason());
    res.json({ ok: true, upserted: count });
  } catch (err) {
    console.error('Schedule refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh schedule' });
  }
});

export default router;
