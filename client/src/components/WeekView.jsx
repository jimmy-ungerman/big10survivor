import React, { useState, useEffect } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../App.jsx';

function ResultBadge({ result, gameStatus }) {
  if (result === 'win') return (
    <span className="text-xs font-bold text-green-400 bg-green-900/30 border border-green-700 px-2 py-0.5 rounded">W</span>
  );
  if (result === 'loss') return (
    <span className="text-xs font-bold text-red-400 bg-red-900/30 border border-red-700 px-2 py-0.5 rounded">L</span>
  );
  if (gameStatus === 'in_progress') return (
    <span className="text-xs font-bold text-green-400 bg-green-900/20 border border-green-800 px-2 py-0.5 rounded">LIVE</span>
  );
  return (
    <span className="text-xs text-gray-500 border border-gray-700 px-2 py-0.5 rounded">TBD</span>
  );
}

export default function WeekView() {
  const { user } = useAuth();
  const [picks, setPicks] = useState([]);
  const [week, setWeek] = useState(null);
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getPicks();
        setPicks(data.picks || []);
        setWeek(data.week);
        setSeason(data.season);
      } catch (err) {
        setError('Failed to load picks');
      } finally {
        setLoading(false);
      }
    };
    load();

    // Refresh every 60 seconds
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading picks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-400">{error}</div>
    );
  }

  // Group picks by user
  const userMap = {};
  for (const pick of picks) {
    if (!userMap[pick.user_id]) {
      userMap[pick.user_id] = {
        userId: pick.user_id,
        username: pick.username,
        picks: [],
      };
    }
    userMap[pick.user_id].picks.push(pick);
  }

  const userGroups = Object.values(userMap);

  // Sort: current user first, then alphabetical
  userGroups.sort((a, b) => {
    if (a.userId === user.id) return -1;
    if (b.userId === user.id) return 1;
    return a.username.localeCompare(b.username);
  });

  if (userGroups.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No picks have been submitted for Week {week} yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Week {week} Picks</h2>
        <span className="text-sm text-gray-500">{season} Season</span>
      </div>

      <div className="space-y-3">
        {userGroups.map(({ userId, username, picks: userPicks }) => {
          const isMe = userId === user.id;
          const hasLoss = userPicks.some(p => p.result === 'loss');
          const allWins = userPicks.length > 0 && userPicks.every(p => p.result === 'win');

          return (
            <div
              key={userId}
              className={`bg-gray-900 border rounded-xl overflow-hidden ${
                isMe ? 'border-blue-700' : 'border-gray-800'
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${isMe ? 'text-blue-300' : 'text-white'}`}>
                    {username}
                  </span>
                  {isMe && <span className="text-xs text-blue-500">(you)</span>}
                </div>
                <div className="flex items-center gap-2">
                  {hasLoss && (
                    <span className="text-xs text-red-400 bg-red-950/50 border border-red-800 px-2 py-0.5 rounded">
                      LOSS
                    </span>
                  )}
                  {allWins && !hasLoss && (
                    <span className="text-xs text-green-400 bg-green-950/50 border border-green-800 px-2 py-0.5 rounded">
                      ALL WIN
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{userPicks.length} pick{userPicks.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {userPicks.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-600 italic">No picks submitted</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {userPicks.map(pick => (
                    <div key={pick.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ResultBadge result={pick.result} gameStatus={pick.game_status} />
                        <div>
                          <div className="text-sm font-semibold text-white">{pick.picked_team_name}</div>
                          <div className="text-xs text-gray-500">
                            vs {pick.picked_team === 'home' ? pick.away_team : pick.home_team}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {pick.game_status === 'complete' && pick.home_score !== null ? (
                          <div className="text-xs text-gray-400 font-mono">
                            {pick.away_score} - {pick.home_score}
                          </div>
                        ) : pick.game_status === 'in_progress' && pick.home_score !== null ? (
                          <div className="text-xs text-green-400 font-mono">
                            {pick.away_score} - {pick.home_score}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-600">
                            {new Date(pick.commence_time).toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
