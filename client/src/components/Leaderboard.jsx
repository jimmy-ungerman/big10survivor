import React, { useState, useEffect } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../App.jsx';
import { BIG_TEN_TEAMS } from '../../../shared/bigTenTeams.js';

function StatusIcon({ player }) {
  if (player.isEliminated) {
    return (
      <span className="text-xs text-red-400 bg-red-950/50 border border-red-800 px-2 py-0.5 rounded font-medium">
        OUT W{player.eliminatedWeek}
      </span>
    );
  }
  const hasLoss = player.currentWeekPicks.some(p => p.result === 'loss');
  if (hasLoss) {
    return (
      <span className="text-xs text-red-400 bg-red-950/50 border border-red-800 px-2 py-0.5 rounded font-medium">
        LOSING
      </span>
    );
  }
  const allWin = player.currentWeekPicks.length > 0 && player.currentWeekPicks.every(p => p.result === 'win');
  if (allWin) {
    return (
      <span className="text-xs text-green-400 bg-green-950/50 border border-green-800 px-2 py-0.5 rounded font-medium">
        SAFE
      </span>
    );
  }
  const hasLive = player.currentWeekPicks.some(p => p.game_status === 'in_progress');
  if (hasLive) {
    return (
      <span className="text-xs text-yellow-400 bg-yellow-950/50 border border-yellow-800 px-2 py-0.5 rounded font-medium">
        LIVE
      </span>
    );
  }
  return null;
}

function PickChip({ pick }) {
  if (pick.locked && !pick.picked_team_name) {
    return (
      <span className="text-xs px-2 py-0.5 rounded border font-medium text-gray-600 bg-gray-800/50 border-gray-700">
        Pick hidden
      </span>
    );
  }

  const resultClass = {
    win: 'text-green-300 bg-green-950/40 border-green-800',
    loss: 'text-red-300 bg-red-950/40 border-red-800',
    pending: 'text-gray-300 bg-gray-800 border-gray-700',
  }[pick.result] || 'text-gray-300 bg-gray-800 border-gray-700';

  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${resultClass}`}>
      {pick.picked_team_name}
      {pick.result === 'win' ? ' W' : pick.result === 'loss' ? ' L' : ''}
      {pick.game_status === 'in_progress' && pick.result === 'pending' ? ' •' : ''}
    </span>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingPaid, setTogglingPaid] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getLeaderboard();
        setLeaderboard(data.leaderboard || []);
        setCurrentWeek(data.currentWeek);
        setSeason(data.season);
      } catch (err) {
        setError('Failed to load standings');
      } finally {
        setLoading(false);
      }
    };
    load();

    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleTogglePaid = async (player) => {
    setTogglingPaid(player.id);
    try {
      await api.setUserPaid(player.id, !player.isPaid);
      setLeaderboard(prev => prev.map(p =>
        p.id === player.id ? { ...p, isPaid: !player.isPaid } : p
      ));
    } catch {}
    setTogglingPaid(null);
  };

  const startEditingName = (player) => {
    setEditingName(player.id);
    setNameDraft(player.fullName || '');
  };

  const handleSaveName = async (player) => {
    if (nameDraft.trim().length < 2) return;
    setSavingName(true);
    try {
      const { fullName } = await api.setUserFullName(player.id, nameDraft.trim());
      setLeaderboard(prev => prev.map(p =>
        p.id === player.id ? { ...p, fullName } : p
      ));
      setEditingName(null);
    } catch {}
    setSavingName(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-12 text-red-400">{error}</div>;
  }

  const activePlayers = leaderboard.filter(p => !p.isEliminated);
  const eliminatedPlayers = leaderboard.filter(p => p.isEliminated);

  const renderPlayer = (player) => {
    const isMe = player.id === user.id;

    return (
      <div
        key={player.id}
        className={`bg-gray-900 border rounded-xl px-4 py-3 ${
          isMe ? 'border-blue-700' : 'border-gray-800'
        } ${player.isEliminated ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left: name, this week's picks, used teams */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold ${
                player.isEliminated
                  ? 'text-gray-500 line-through'
                  : isMe ? 'text-blue-300' : 'text-white'
              }`}>
                {player.username}
              </span>
              {player.fullName && (
                <span className="text-xs text-gray-500">{player.fullName}</span>
              )}
              {isMe && <span className="text-xs text-blue-500">(you)</span>}
              {player.isAdmin && <span className="text-xs text-purple-400">admin</span>}
              {user.isAdmin && (player.isPaid
                ? <span className="text-xs text-green-400 bg-green-950/40 border border-green-800 px-1.5 py-0.5 rounded font-medium">Paid</span>
                : <span className="text-xs text-red-400 bg-red-950/40 border border-red-800 px-1.5 py-0.5 rounded font-medium">Unpaid</span>
              )}
              {user.isAdmin && (
                <button
                  onClick={() => handleTogglePaid(player)}
                  disabled={togglingPaid === player.id}
                  className="text-xs text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-40"
                >
                  {togglingPaid === player.id ? '...' : (player.isPaid ? 'Mark unpaid' : 'Mark paid')}
                </button>
              )}
              {user.isAdmin && editingName !== player.id && (
                <button
                  onClick={() => startEditingName(player)}
                  className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
                >
                  {player.fullName ? 'Edit name' : 'Add name'}
                </button>
              )}
            </div>

            {user.isAdmin && editingName === player.id && (
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName(player)}
                  placeholder="Full name"
                  autoFocus
                  minLength={2}
                  maxLength={60}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => handleSaveName(player)}
                  disabled={savingName || nameDraft.trim().length < 2}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40"
                >
                  {savingName ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingName(null)}
                  className="text-xs text-gray-600 hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* This week's picks */}
            {player.currentWeekPicks.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {player.currentWeekPicks.map(pick => (
                  <PickChip key={pick.id} pick={pick} />
                ))}
              </div>
            )}
            {player.currentWeekPicks.length === 0 && !player.isEliminated && (
              <div className="text-xs text-gray-600 mt-1">No picks yet this week</div>
            )}

            {/* All 18 teams — green if used, dim if not */}
            <div className="flex flex-wrap gap-1 mt-2">
              {BIG_TEN_TEAMS.map(team => {
                const used = player.usedTeams.includes(team);
                return (
                  <span
                    key={team}
                    className={`text-xs px-1.5 py-0.5 rounded border font-medium ${
                      used
                        ? 'text-green-300 bg-green-950/40 border-green-800'
                        : 'text-gray-700 bg-gray-800/40 border-gray-800'
                    }`}
                  >
                    {team}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Right: status + weeks survived */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <StatusIcon player={player} />
            {!player.isEliminated && (
              <div className="text-xs text-gray-600">{player.teamsRemaining} teams left</div>
            )}
          </div>
        </div>

        {player.needsDoublePick && !player.isEliminated && (
          <div className="mt-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800 rounded px-3 py-1.5">
            Must double-pick every remaining week
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Still Alive</h2>
        <span className="text-sm text-gray-500">Week {currentWeek} · {season}</span>
      </div>

      {activePlayers.length === 0 && eliminatedPlayers.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No players registered yet.
        </div>
      )}

      {/* Active players */}
      {activePlayers.length > 0 && (
        <div className="space-y-2">
          {activePlayers.map(player => renderPlayer(player))}
        </div>
      )}

      {/* Eliminated players */}
      {eliminatedPlayers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wide px-1">
            Lost — {eliminatedPlayers.length} player{eliminatedPlayers.length !== 1 ? 's' : ''}
          </h3>
          <div className="space-y-2">
            {eliminatedPlayers.map(player => (
              <div
                key={player.id}
                className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 opacity-75"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-500 line-through">
                        {player.username}
                      </span>
                      {player.fullName && (
                        <span className="text-xs text-gray-600">{player.fullName}</span>
                      )}
                      <span className="text-xs text-red-500 bg-red-950/40 border border-red-900 px-1.5 py-0.5 rounded font-medium">
                        Out — Week {player.eliminatedWeek}
                      </span>
                      {user.isAdmin && editingName !== player.id && (
                        <button
                          onClick={() => startEditingName(player)}
                          className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
                        >
                          {player.fullName ? 'Edit name' : 'Add name'}
                        </button>
                      )}
                    </div>

                    {user.isAdmin && editingName === player.id && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <input
                          type="text"
                          value={nameDraft}
                          onChange={e => setNameDraft(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveName(player)}
                          placeholder="Full name"
                          autoFocus
                          minLength={2}
                          maxLength={60}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => handleSaveName(player)}
                          disabled={savingName || nameDraft.trim().length < 2}
                          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40"
                        >
                          {savingName ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingName(null)}
                          className="text-xs text-gray-600 hover:text-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Losing picks */}
                    {player.eliminationPicks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {player.eliminationPicks.map((pick, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs bg-red-950/30 border border-red-900 rounded px-2 py-1">
                            <span className="text-red-400 font-semibold">{pick.pickedTeamName}</span>
                            <span className="text-gray-600">lost to</span>
                            <span className="text-gray-400 font-medium">{pick.opponentName}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Teams they used */}
                    {player.usedTeams.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {BIG_TEN_TEAMS.map(team => {
                          const used = player.usedTeams.includes(team);
                          const wasLosingPick = player.eliminationPicks.some(p => p.pickedTeamName === team);
                          if (!used) return null;
                          return (
                            <span
                              key={team}
                              className={`text-xs px-1.5 py-0.5 rounded border font-medium ${
                                wasLosingPick
                                  ? 'text-red-400 bg-red-950/40 border-red-800'
                                  : 'text-gray-600 bg-gray-800/40 border-gray-800'
                              }`}
                            >
                              {team}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-gray-600 flex-shrink-0">
                    {player.weeksSurvived} wk{player.weeksSurvived !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
