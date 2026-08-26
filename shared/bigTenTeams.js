// Single source of truth for identifying Big Ten teams.
//
// ESPN's team `displayName` is always "{School} {Mascot}" (e.g. "Illinois Fighting
// Illini"). Matching on this with a substring check (e.g. name.includes('Illinois'))
// is wrong: it also matches non-Big-Ten schools whose name contains a Big Ten
// school's name, like "Eastern Illinois Panthers" or "Iowa State Cyclones". Instead
// we match the *exact* full displayName against a known map, verified against
// ESPN's live college-football scoreboard/teams endpoints for group=5 (Big Ten).

export const BIG_TEN_TEAMS = [
  'Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan', 'Michigan State',
  'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State', 'Penn State',
  'Purdue', 'Rutgers', 'Wisconsin', 'Oregon', 'UCLA', 'USC', 'Washington',
];

// Exact ESPN displayName -> canonical short name.
const BIG_TEN_DISPLAY_NAMES = {
  'illinois fighting illini': 'Illinois',
  'indiana hoosiers': 'Indiana',
  'iowa hawkeyes': 'Iowa',
  'maryland terrapins': 'Maryland',
  'michigan wolverines': 'Michigan',
  'michigan state spartans': 'Michigan State',
  'minnesota golden gophers': 'Minnesota',
  'nebraska cornhuskers': 'Nebraska',
  'northwestern wildcats': 'Northwestern',
  'ohio state buckeyes': 'Ohio State',
  'penn state nittany lions': 'Penn State',
  'purdue boilermakers': 'Purdue',
  'rutgers scarlet knights': 'Rutgers',
  'wisconsin badgers': 'Wisconsin',
  'oregon ducks': 'Oregon',
  'ucla bruins': 'UCLA',
  'usc trojans': 'USC',
  'washington huskies': 'Washington',
};

// Also allow matching on the bare short name itself (e.g. "Illinois"), in case a
// caller already has a normalized name rather than a full ESPN displayName.
const SHORT_NAME_LOOKUP = Object.fromEntries(
  BIG_TEN_TEAMS.map(t => [t.toLowerCase(), t])
);

export function normalizeBigTenName(teamName) {
  if (!teamName) return null;
  const key = teamName.trim().toLowerCase();
  return BIG_TEN_DISPLAY_NAMES[key] || SHORT_NAME_LOOKUP[key] || null;
}

export function isBigTenTeam(teamName) {
  return normalizeBigTenName(teamName) !== null;
}
