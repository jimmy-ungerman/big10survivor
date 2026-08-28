import axios from 'axios';
import { BIG_TEN_TEAMS, isBigTenTeam, normalizeBigTenName } from '../../shared/bigTenTeams.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';
const BIG_TEN_GROUP_ID = '5';

export { BIG_TEN_TEAMS, isBigTenTeam, normalizeBigTenName };

function parseStatus(espnStatus) {
  if (!espnStatus) return 'scheduled';
  const type = espnStatus?.type?.name || '';
  if (type === 'STATUS_FINAL') return 'complete';
  if (type === 'STATUS_IN_PROGRESS') return 'in_progress';
  return 'scheduled';
}

// ESPN's curatedRank tracks the AP Poll all season (confirmed against psuParlay's
// verification: it doesn't switch to CFP committee rankings once those start in
// November). 99 is the "unranked" sentinel.
function parseRank(competitor) {
  const rank = competitor?.curatedRank?.current;
  return rank && rank !== 99 ? rank : null;
}

function parseEvents(events) {
  const results = [];
  for (const event of events) {
    const competition = event.competitions?.[0];
    if (!competition) continue;

    const competitors = competition.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) continue;

    const status = parseStatus(event.status);
    const homeScore = status !== 'scheduled' ? parseInt(home.score, 10) || 0 : null;
    const awayScore = status !== 'scheduled' ? parseInt(away.score, 10) || 0 : null;

    results.push({
      espnId: event.id,
      homeTeam: home.team.displayName || home.team.name,
      awayTeam: away.team.displayName || away.team.name,
      homeAbbr: home.team.abbreviation,
      awayAbbr: away.team.abbreviation,
      homeRank: parseRank(home),
      awayRank: parseRank(away),
      commenceTime: event.date,
      status,
      homeScore,
      awayScore,
    });
  }
  return results;
}

async function fetchWeek(year, week) {
  try {
    const url = `${ESPN_BASE}?dates=${year}&week=${week}&seasontype=2&groups=${BIG_TEN_GROUP_ID}&limit=100`;
    const { data } = await axios.get(url, { timeout: 10000 });
    return data.events || [];
  } catch {
    return [];
  }
}

export async function getFullSchedule(year, maxWeek = 13) {
  const weekPromises = Array.from({ length: maxWeek }, (_, i) => fetchWeek(year, i + 1));
  const allWeeks = await Promise.all(weekPromises);

  const schedule = {};
  for (let i = 0; i < allWeeks.length; i++) {
    const week = i + 1;
    const events = allWeeks[i];
    if (!events.length) continue;
    const parsed = parseEvents(events);
    const bigTenGames = parsed.filter(g => isBigTenTeam(g.homeTeam) || isBigTenTeam(g.awayTeam));
    if (bigTenGames.length > 0) {
      schedule[week] = bigTenGames;
    }
  }

  return { season: year, schedule };
}

export async function fetchLiveScores(espnIds) {
  if (!espnIds || espnIds.length === 0) return [];

  // We'll fetch current week and see if any of the IDs match
  const now = new Date();
  const year = now.getFullYear();

  const results = [];
  // Try current and adjacent weeks
  for (let week = 1; week <= 15; week++) {
    const events = await fetchWeek(year, week);
    for (const event of events) {
      if (espnIds.includes(event.id)) {
        const parsed = parseEvents([event]);
        if (parsed.length) results.push(parsed[0]);
      }
    }
    if (results.length === espnIds.length) break;
  }

  return results;
}
