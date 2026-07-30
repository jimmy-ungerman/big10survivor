const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => request('GET', '/auth/me'),
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  logout: () => request('POST', '/auth/logout'),
  register: (username, password) => request('POST', '/auth/register', { username, password }),
  getGames: () => request('GET', '/games'),
  getPicks: (week, season) => {
    const qs = week && season ? `?week=${week}&season=${season}` : '';
    return request('GET', `/picks${qs}`);
  },
  submitPick: (gameId, pickedTeam) => request('POST', '/picks', { gameId, pickedTeam }),
  deletePick: (pickId) => request('DELETE', `/picks/${pickId}`),
  getLeaderboard: () => request('GET', '/leaderboard'),
  getMyTeams: (season) => request('GET', `/picks/my-teams?season=${season}`),
  getSchedule: () => request('GET', '/games/schedule'),
  getMySeasonPicks: (season) => request('GET', `/picks/my-season?season=${season}`),
  setUserPaid: (userId, paid) => request('PATCH', `/admin/users/${userId}/paid`, { paid }),
  getSplit: () => request('GET', '/split'),
  castSplitVote: (vote) => request('POST', '/split', { vote }),
};
