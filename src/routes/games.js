import { Router } from 'express';
import { query } from '../db/index.js';
import { getCurrentWeekGames, getFullSchedule, isBigTenTeam, normalizeBigTenName } from '../services/espn.js';

const router = Router();

// Cache to avoid hammering ESPN
let gamesCache = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let scheduleCache = null;
let scheduleCacheTime = null;
const SCHEDULE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

router.get('/', async (req, res) => {
  try {
    // Try to return from DB first for current week
    const now = Date.now();
    if (gamesCache && cacheTime && (now - cacheTime) < CACHE_TTL) {
      return res.json(gamesCache);
    }

    // Fetch current week from ESPN
    const { season, week, events } = await getCurrentWeekGames();

    // Upsert games into DB
    for (const event of events) {
      const { rows: existing } = query(
        'SELECT id FROM games WHERE espn_id = $1',
        [event.espnId]
      );

      if (existing.length > 0) {
        query(
          `UPDATE games SET
            home_team = $1, away_team = $2,
            home_abbr = $3, away_abbr = $4,
            status = $5, home_score = $6, away_score = $7,
            updated_at = CURRENT_TIMESTAMP
           WHERE espn_id = $8`,
          [
            event.homeTeam, event.awayTeam,
            event.homeAbbr, event.awayAbbr,
            event.status, event.homeScore, event.awayScore,
            event.espnId
          ]
        );
      } else {
        query(
          `INSERT INTO games
            (espn_id, home_team, away_team, home_abbr, away_abbr, week_number, season, commence_time, status, home_score, away_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            event.espnId, event.homeTeam, event.awayTeam,
            event.homeAbbr, event.awayAbbr,
            week, season, event.commenceTime,
            event.status, event.homeScore, event.awayScore,
          ]
        );
      }
    }

    // Return from DB
    const { rows: games } = query(
      'SELECT * FROM games WHERE week_number = $1 AND season = $2 ORDER BY commence_time ASC',
      [week, season]
    );

    const enrichedGames = games.map(g => ({
      ...g,
      home_is_big_ten: isBigTenTeam(g.home_team),
      away_is_big_ten: isBigTenTeam(g.away_team),
      home_big_ten_name: normalizeBigTenName(g.home_team),
      away_big_ten_name: normalizeBigTenName(g.away_team),
    }));

    const response = { games: enrichedGames, week, season };
    gamesCache = response;
    cacheTime = now;

    res.json(response);
  } catch (err) {
    console.error('Games route error:', err);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Full season schedule for planning sheet
router.get('/schedule', async (req, res) => {
  try {
    const now = Date.now();
    if (scheduleCache && scheduleCacheTime && (now - scheduleCacheTime) < SCHEDULE_CACHE_TTL) {
      return res.json(scheduleCache);
    }

    const year = new Date().getFullYear();
    const { season, schedule } = await getFullSchedule(year);

    const response = { season, schedule };
    scheduleCache = response;
    scheduleCacheTime = now;

    res.json(response);
  } catch (err) {
    console.error('Schedule route error:', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Admin route to force refresh
router.post('/refresh', async (req, res) => {
  gamesCache = null;
  cacheTime = null;
  scheduleCache = null;
  scheduleCacheTime = null;
  res.json({ ok: true });
});

export default router;
