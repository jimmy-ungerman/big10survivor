import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../App.jsx';

const BIG_TEN_TEAMS = [
  'Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan', 'Michigan State',
  'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State', 'Penn State',
  'Purdue', 'Rutgers', 'Wisconsin', 'Oregon', 'UCLA', 'USC', 'Washington'
];

function formatKickoff(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
}

function getStatusLabel(status) {
  if (status === 'in_progress') return { label: 'LIVE', className: 'text-green-400 bg-green-900/30 border-green-700' };
  if (status === 'complete') return { label: 'FINAL', className: 'text-gray-400 bg-gray-800 border-gray-700' };
  return null;
}

function TeamButton({ teamSide, teamName, teamAbbr, isBigTen, isUsed, isSelected, isGameLocked, isGameComplete, isDoubleCapped, onSelect, pickedSide }) {
  if (!isBigTen) {
    return (
      <div className="flex-1 px-3 py-4 text-center">
        <div className="text-xs text-gray-600 uppercase font-medium mb-1">{teamAbbr}</div>
        <div className="text-sm text-gray-500 font-medium">{teamName}</div>
        <div className="text-xs text-gray-600 mt-1">Non-Big Ten</div>
      </div>
    );
  }

  const isPickedByMe = pickedSide === teamSide;
  const isDisabled = isUsed || isGameLocked || isGameComplete || (pickedSide && !isPickedByMe) || (isDoubleCapped && !isPickedByMe);

  let buttonClass = 'flex-1 px-3 py-4 rounded-lg text-center transition-all border ';
  if (isPickedByMe) {
    buttonClass += 'bg-blue-600/20 border-blue-500 text-blue-300';
  } else if (isDisabled) {
    buttonClass += 'bg-gray-800/50 border-gray-700 text-gray-500 cursor-not-allowed opacity-60';
  } else {
    buttonClass += 'bg-gray-800 border-gray-700 hover:border-blue-500 hover:bg-blue-900/20 text-gray-200 cursor-pointer';
  }

  return (
    <button
      onClick={() => !isDisabled && onSelect(teamSide)}
      disabled={isDisabled}
      className={buttonClass}
    >
      <div className="text-xs text-gray-400 uppercase font-medium mb-1">{teamAbbr}</div>
      <div className="text-sm font-semibold">{teamName}</div>
      {isUsed && !isPickedByMe && (
        <div className="text-xs text-amber-500/80 mt-1">Already used</div>
      )}
      {isPickedByMe && (
        <div className="text-xs text-blue-400 mt-1 font-medium">Your pick</div>
      )}
    </button>
  );
}

export default function WeekPicker() {
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [week, setWeek] = useState(null);
  const [season, setSeason] = useState(null);
  const [myPicks, setMyPicks] = useState([]);
  const [usedTeams, setUsedTeams] = useState([]);
  const [remainingTeams, setRemainingTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState('');
  const [showRemainingTeams, setShowRemainingTeams] = useState(false);
  const [splitData, setSplitData] = useState(null);
  const [votingInProgress, setVotingInProgress] = useState(false);
  const [doublePickWeeksUsed, setDoublePickWeeksUsed] = useState(0);

  const loadData = useCallback(async () => {
    try {
      setError('');
      const [gamesData, picksData, splitResult] = await Promise.all([
        api.getGames(),
        api.getPicks(),
        api.getSplit().catch(() => null),
      ]);

      setGames(gamesData.games || []);
      setWeek(gamesData.week);
      setSeason(gamesData.season);

      const picks = picksData.picks || [];
      const myWeekPicks = picks.filter(p => p.user_id === user.id);
      setMyPicks(myWeekPicks);

      if (splitResult) setSplitData(splitResult);

      // Load my teams + season picks (for double-pick week count)
      if (gamesData.season) {
        const [teamsData, seasonPicksData] = await Promise.all([
          api.getMyTeams(gamesData.season),
          api.getMySeasonPicks(gamesData.season),
        ]);
        setUsedTeams(teamsData.usedTeams || []);
        setRemainingTeams(teamsData.remainingTeams || []);

        const weekCounts = {};
        for (const p of (seasonPicksData.picks || [])) {
          weekCounts[p.week_number] = (weekCounts[p.week_number] || 0) + 1;
        }
        setDoublePickWeeksUsed(Object.values(weekCounts).filter(c => c >= 2).length);
      }
    } catch (err) {
      setError('Failed to load games. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePick = async (gameId, pickedTeam) => {
    if (user.isEliminated) return;
    setSubmitting(true);
    setWarning('');
    try {
      const data = await api.submitPick(gameId, pickedTeam);
      if (data.warning) setWarning(data.warning);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to submit pick');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (pickId) => {
    if (user.isEliminated) return;
    setSubmitting(true);
    try {
      await api.deletePick(pickId);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to remove pick');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSplitVote = async (vote) => {
    setVotingInProgress(true);
    try {
      await api.castSplitVote(vote);
      const updated = await api.getSplit();
      setSplitData(updated);
    } catch (err) {
      setError(err.message || 'Failed to cast vote');
    } finally {
      setVotingInProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading games...</div>
      </div>
    );
  }

  const myPicksByGameId = {};
  for (const pick of myPicks) {
    myPicksByGameId[pick.game_id] = pick;
  }

  const TOTAL_WEEKS = 13;
  const weeksRemaining = week ? TOTAL_WEEKS - week : 0;
  const teamsRemaining = remainingTeams.length;
  const needsDoublePick = teamsRemaining <= weeksRemaining && weeksRemaining > 0;
  const atDoubleCap = doublePickWeeksUsed >= 5 && myPicks.length >= 1;
  const doublePickWeeksNeeded = Math.max(0, 5 - doublePickWeeksUsed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Week {week} Picks</h2>
          <p className="text-sm text-gray-400 mt-0.5">{season} Season</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-300">
            <span className="font-semibold text-white">{myPicks.length}</span>
            <span className="text-gray-500">/2</span> picks this week
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{teamsRemaining} teams remaining</div>
          <div className={`text-xs mt-0.5 font-medium ${doublePickWeeksNeeded === 0 ? 'text-green-500' : 'text-amber-400'}`}>
            {doublePickWeeksNeeded === 0
              ? 'All 2-team weeks accounted for'
              : `${doublePickWeeksNeeded} more 2-team week${doublePickWeeksNeeded !== 1 ? 's' : ''} needed`}
          </div>
        </div>
      </div>

      {/* Eliminated banner */}
      {user.isEliminated && (
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 text-red-400 text-sm text-center">
          You have been eliminated. Picks are view-only.
        </div>
      )}

      {/* Warning banner */}
      {(warning || needsDoublePick) && !user.isEliminated && (
        <div className="bg-amber-950/50 border border-amber-700 rounded-xl p-4 text-amber-300 text-sm">
          {warning || `You only have ${teamsRemaining} teams remaining for ${weeksRemaining} weeks. You must double-pick every remaining week!`}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-300 hover:text-white">Dismiss</button>
        </div>
      )}

      {/* Current picks summary */}
      {myPicks.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Your picks this week</h3>
          <div className="space-y-2">
            {myPicks.map(pick => {
              const kickoff = new Date(pick.commence_time);
              const canDelete = !user.isEliminated && new Date() < kickoff && pick.result === 'pending';
              const resultColors = {
                win: 'text-green-400',
                loss: 'text-red-400',
                pending: 'text-gray-400',
              };

              return (
                <div key={pick.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold w-4 ${resultColors[pick.result]}`}>
                      {pick.result === 'win' ? 'W' : pick.result === 'loss' ? 'L' : ''}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-white">{pick.picked_team_name}</div>
                      <div className="text-xs text-gray-500">
                        vs {pick.picked_team === 'home' ? pick.away_team : pick.home_team}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pick.game_status === 'in_progress' && (
                      <span className="text-xs text-green-400 font-medium">LIVE</span>
                    )}
                    {pick.game_status === 'complete' && (
                      <span className="text-xs text-gray-500">
                        {pick.home_score} - {pick.away_score}
                      </span>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(pick.id)}
                        disabled={submitting}
                        className="text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Games list */}
      <div className="space-y-3">
        {games.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No games available for this week.
          </div>
        )}
        {games.map(game => {
          const myPick = myPicksByGameId[game.id];
          const kickoff = new Date(game.commence_time);
          const isLocked = new Date() >= kickoff;
          const isComplete = game.status === 'complete';
          const isInProgress = game.status === 'in_progress';
          const statusInfo = getStatusLabel(game.status);

          const homeUsed = game.home_big_ten_name && usedTeams.includes(game.home_big_ten_name) && myPick?.picked_team !== 'home';
          const awayUsed = game.away_big_ten_name && usedTeams.includes(game.away_big_ten_name) && myPick?.picked_team !== 'away';

          // Both teams used or game locked without pick
          const bothBigTenUsed = game.home_is_big_ten && game.away_is_big_ten && homeUsed && awayUsed;
          const noBigTenAvailable = !game.home_is_big_ten && !game.away_is_big_ten;

          const cardOpacity = (isLocked && !myPick) || bothBigTenUsed ? 'opacity-50' : '';

          return (
            <div
              key={game.id}
              className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden ${cardOpacity}`}
            >
              {/* Game header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
                <div className="text-xs text-gray-500">
                  {isLocked ? (isInProgress ? 'In progress' : formatKickoff(game.commence_time)) : formatKickoff(game.commence_time)}
                </div>
                <div className="flex items-center gap-2">
                  {isInProgress && game.home_score !== null && (
                    <span className="text-xs text-gray-300 font-mono">
                      {game.away_score} - {game.home_score}
                    </span>
                  )}
                  {isComplete && game.home_score !== null && (
                    <span className="text-xs text-gray-400 font-mono">
                      {game.away_score} - {game.home_score}
                    </span>
                  )}
                  {statusInfo && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${statusInfo.className}`}>
                      {statusInfo.label}
                    </span>
                  )}
                  {isLocked && !statusInfo && (
                    <span className="text-xs text-gray-500 font-medium">LOCKED</span>
                  )}
                </div>
              </div>

              {/* Teams */}
              <div className="flex items-stretch gap-2 p-3">
                <TeamButton
                  teamSide="away"
                  teamName={game.away_big_ten_name || game.away_team}
                  teamAbbr={game.away_abbr}
                  isBigTen={game.away_is_big_ten}
                  isUsed={awayUsed}
                  isSelected={myPick?.picked_team === 'away'}
                  isGameLocked={isLocked}
                  isGameComplete={isComplete}
                  isDoubleCapped={atDoubleCap}
                  onSelect={(side) => handlePick(game.id, side)}
                  pickedSide={myPick?.picked_team}
                />

                <div className="flex items-center text-gray-600 font-bold text-sm px-1">
                  @
                </div>

                <TeamButton
                  teamSide="home"
                  teamName={game.home_big_ten_name || game.home_team}
                  teamAbbr={game.home_abbr}
                  isBigTen={game.home_is_big_ten}
                  isUsed={homeUsed}
                  isSelected={myPick?.picked_team === 'home'}
                  isGameLocked={isLocked}
                  isGameComplete={isComplete}
                  isDoubleCapped={atDoubleCap}
                  onSelect={(side) => handlePick(game.id, side)}
                  pickedSide={myPick?.picked_team}
                />
              </div>

              {noBigTenAvailable && (
                <div className="px-4 pb-3 text-center text-xs text-gray-600">
                  Neither team is Big Ten — not eligible for picks
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Split the pot */}
      {splitData && (
        <div className={`border rounded-xl overflow-hidden ${
          splitData.consensus
            ? 'bg-green-950/20 border-green-700'
            : 'bg-gray-900 border-gray-800'
        }`}>
          <div className="px-4 py-3 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Split the Pot?</h3>
                <p className="text-xs text-gray-500 mt-0.5">Requires 100% agreement from all alive players</p>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-white">${splitData.totalPot.toLocaleString()} total</div>
                <div className="text-xs text-gray-400">${splitData.splitAmount.toLocaleString()} each ({splitData.aliveCount} players)</div>
              </div>
            </div>
          </div>

          <div className="px-4 py-3">
            {splitData.consensus ? (
              <div className="text-center py-2">
                <div className="text-green-400 font-semibold text-sm">All players agree — split the pot!</div>
                <div className="text-green-300 text-lg font-bold mt-1">${splitData.splitAmount.toLocaleString()} each</div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs text-gray-400">
                  {splitData.yesVotes} of {splitData.aliveCount} alive player{splitData.aliveCount !== 1 ? 's' : ''} voted yes
                </div>
                {!user.isEliminated && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleSplitVote(true)}
                      disabled={votingInProgress || splitData.myVote === true}
                      className={`text-sm px-4 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                        splitData.myVote === true
                          ? 'bg-green-700/40 border-green-600 text-green-300'
                          : 'border-green-800 text-green-400 hover:bg-green-950/40'
                      }`}
                    >
                      {splitData.myVote === true ? 'Voted Yes' : 'Yes'}
                    </button>
                    <button
                      onClick={() => handleSplitVote(false)}
                      disabled={votingInProgress || splitData.myVote === false}
                      className={`text-sm px-4 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                        splitData.myVote === false
                          ? 'bg-red-900/40 border-red-700 text-red-300'
                          : 'border-gray-700 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      {splitData.myVote === false ? 'Voted No' : 'No'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remaining teams panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowRemainingTeams(!showRemainingTeams)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
        >
          <span className="text-sm font-semibold text-gray-300">
            Remaining Teams ({teamsRemaining} of 18)
          </span>
          <span className="text-gray-500 text-sm">{showRemainingTeams ? '▲' : '▼'}</span>
        </button>

        {showRemainingTeams && (
          <div className="px-4 pb-4 border-t border-gray-800">
            <div className="mt-3 flex flex-wrap gap-1.5">
              {BIG_TEN_TEAMS.map(team => {
                const isUsed = usedTeams.includes(team);
                return (
                  <span
                    key={team}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                      isUsed
                        ? 'bg-gray-800/40 border-gray-700 text-gray-600 line-through'
                        : 'bg-blue-900/20 border-blue-800 text-blue-300'
                    }`}
                  >
                    {team}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
