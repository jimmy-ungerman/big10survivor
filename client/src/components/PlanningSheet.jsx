import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/index.js';
import { BIG_TEN_TEAMS, normalizeBigTenName } from '../../../shared/bigTenTeams.js';

const TEAM_ABBR = {
  'Illinois': 'ILL', 'Indiana': 'IND', 'Iowa': 'IOWA', 'Maryland': 'MD',
  'Michigan': 'MICH', 'Michigan State': 'MSU', 'Minnesota': 'MINN',
  'Nebraska': 'NEB', 'Northwestern': 'NW', 'Ohio State': 'OSU',
  'Penn State': 'PSU', 'Purdue': 'PUR', 'Rutgers': 'RUT', 'Wisconsin': 'WIS',
  'Oregon': 'ORE', 'UCLA': 'UCLA', 'USC': 'USC', 'Washington': 'WASH',
};

export default function PlanningSheet() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scheduleData, setScheduleData] = useState(null);
  const [actualPicks, setActualPicks] = useState([]);
  const [planData, setPlanData] = useState({});

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const schedResult = await api.getSchedule();
        const picksResult = await api.getMySeasonPicks(schedResult.season);

        setScheduleData(schedResult);
        setActualPicks(picksResult.picks || []);

        const stored = localStorage.getItem(`big10survivor-plan-${schedResult.season}`);
        if (stored) {
          try { setPlanData(JSON.parse(stored)); } catch {}
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!scheduleData) return;
    localStorage.setItem(`big10survivor-plan-${scheduleData.season}`, JSON.stringify(planData));
  }, [planData, scheduleData]);

  // week -> team -> { opponentAbbr, isHome, game }
  const scheduleMap = useMemo(() => {
    if (!scheduleData) return {};
    const map = {};
    for (const [week, games] of Object.entries(scheduleData.schedule)) {
      map[week] = {};
      for (const game of games) {
        const homeName = normalizeBigTenName(game.homeTeam);
        const awayName = normalizeBigTenName(game.awayTeam);
        if (homeName) {
          map[week][homeName] = {
            opponentAbbr: awayName ? TEAM_ABBR[awayName] || game.awayAbbr : game.awayAbbr,
            isHome: true,
            game,
          };
        }
        if (awayName) {
          map[week][awayName] = {
            opponentAbbr: homeName ? TEAM_ABBR[homeName] || game.homeAbbr : game.homeAbbr,
            isHome: false,
            game,
          };
        }
      }
    }
    return map;
  }, [scheduleData]);

  // week -> teamName -> pick
  const actualPicksMap = useMemo(() => {
    const map = {};
    for (const pick of actualPicks) {
      const week = pick.week_number;
      if (!map[week]) map[week] = {};
      map[week][pick.picked_team_name] = pick;
    }
    return map;
  }, [actualPicks]);

  const actuallyUsedTeams = useMemo(
    () => new Set(actualPicks.map(p => p.picked_team_name)),
    [actualPicks]
  );

  const plannedTeams = useMemo(() => {
    const teams = new Set();
    for (const weekTeams of Object.values(planData)) {
      for (const t of weekTeams) teams.add(t);
    }
    return teams;
  }, [planData]);

  const weeks = useMemo(() => {
    if (!scheduleData) return [];
    return Object.keys(scheduleData.schedule).map(Number).sort((a, b) => a - b);
  }, [scheduleData]);

  function handleCellClick(week, team) {
    const weekKey = String(week);
    const weekPlan = planData[weekKey] || [];
    const isPlanned = weekPlan.includes(team);

    if (actualPicksMap[week]?.[team]) return;

    const entry = scheduleMap[weekKey]?.[team];
    if (!entry) return;
    if (entry.game.status !== 'scheduled') return;

    if (isPlanned) {
      setPlanData(prev => ({
        ...prev,
        [weekKey]: (prev[weekKey] || []).filter(t => t !== team),
      }));
    } else {
      const weekActualCount = Object.keys(actualPicksMap[week] || {}).length;
      if (weekPlan.length + weekActualCount >= 2) return;
      if (actuallyUsedTeams.has(team)) return;
      if (plannedTeams.has(team)) return;

      // Adding this pick would make this a double-pick week — check the 5-week cap
      if (weekPlan.length + weekActualCount === 1) {
        const doublePickWeeks = weeks.filter(w => {
          const wPlan = planData[String(w)] || [];
          const wActual = Object.keys(actualPicksMap[w] || {}).length;
          return wPlan.length + wActual === 2;
        }).length;
        if (doublePickWeeks >= 5) return;
      }

      setPlanData(prev => ({
        ...prev,
        [weekKey]: [...(prev[weekKey] || []), team],
      }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Loading full schedule...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 text-center py-10 text-sm">Failed to load schedule: {error}</div>
    );
  }

  const totalPlanned = Object.values(planData).reduce((acc, arr) => acc + arr.length, 0);
  const totalUsedTeams = actuallyUsedTeams.size + plannedTeams.size;
  const doublePickWeeksUsed = weeks.filter(w => {
    const wPlan = planData[String(w)] || [];
    const wActual = Object.keys(actualPicksMap[w] || {}).length;
    return wPlan.length + wActual === 2;
  }).length;
  const doublePickWeeksNeeded = Math.max(0, 5 - doublePickWeeksUsed);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">Season Plan — {scheduleData.season}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {actualPicks.length} locked · {totalPlanned} planned · {18 - totalUsedTeams} teams left
          </p>
          <p className={`text-xs mt-0.5 font-medium ${doublePickWeeksNeeded === 0 ? 'text-green-500' : 'text-amber-400'}`}>
            {doublePickWeeksNeeded === 0
              ? 'All 2-team weeks accounted for'
              : `${doublePickWeeksNeeded} more 2-team week${doublePickWeeksNeeded !== 1 ? 's' : ''} needed`}
          </p>
        </div>
        {totalPlanned > 0 && (
          <button
            onClick={() => setPlanData({})}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            Clear plan
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-900 border border-blue-600 inline-block" />
          Planned (click to remove)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-900 border border-green-700 inline-block" />
          Won
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-yellow-900 border border-yellow-800 inline-block" />
          Pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-900 border border-red-700 inline-block" />
          Lost
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gray-900 border border-gray-700 inline-block" />
          Bye / unavailable
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="border-collapse" style={{ minWidth: 'max-content', fontSize: '11px' }}>
          <thead>
            <tr className="bg-gray-900">
              <th className="sticky left-0 z-10 bg-gray-900 border-r border-gray-700 px-3 py-2 text-left text-gray-500 font-medium">
                Wk
              </th>
              {BIG_TEN_TEAMS.map(team => {
                const usedActual = actuallyUsedTeams.has(team);
                const usedPlan = plannedTeams.has(team);
                return (
                  <th
                    key={team}
                    title={team}
                    className={`px-2 py-2 text-center font-semibold border-r border-gray-800 whitespace-nowrap ${
                      usedActual ? 'text-gray-600 line-through' :
                      usedPlan ? 'text-blue-400' :
                      'text-gray-300'
                    }`}
                  >
                    {TEAM_ABBR[team]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {weeks.map(week => {
              const weekKey = String(week);
              const weekPlan = planData[weekKey] || [];
              const weekActualCount = Object.keys(actualPicksMap[week] || {}).length;
              const totalWeekPicks = weekPlan.length + weekActualCount;

              return (
                <tr key={week} className="border-t border-gray-800 hover:bg-gray-900/20">
                  <td className="sticky left-0 z-10 bg-gray-950 border-r border-gray-700 px-3 py-1 text-gray-500 font-medium whitespace-nowrap">
                    W{week}
                  </td>
                  {BIG_TEN_TEAMS.map(team => {
                    const entry = scheduleMap[weekKey]?.[team];
                    const actualPick = actualPicksMap[week]?.[team];
                    const isPlanned = weekPlan.includes(team);

                    // Actual pick — show result
                    if (actualPick) {
                      const style =
                        actualPick.result === 'win'
                          ? 'bg-green-900/60 text-green-300 border-green-700'
                          : actualPick.result === 'loss'
                          ? 'bg-red-900/60 text-red-300 border-red-700'
                          : 'bg-yellow-900/40 text-yellow-300 border-yellow-800';
                      return (
                        <td key={team} className="border-r border-gray-800 p-0.5">
                          <div className={`px-1.5 py-1 rounded text-center border ${style} whitespace-nowrap`}>
                            {entry ? (entry.isHome ? 'vs' : '@') + ' ' + entry.opponentAbbr : '—'}
                          </div>
                        </td>
                      );
                    }

                    // No game this week (bye)
                    if (!entry) {
                      return (
                        <td key={team} className="border-r border-gray-800 p-0.5">
                          <div className="px-1.5 py-1 rounded text-center text-gray-700">—</div>
                        </td>
                      );
                    }

                    const gameLocked = entry.game.status !== 'scheduled';

                    // Planned pick
                    if (isPlanned) {
                      return (
                        <td
                          key={team}
                          className="border-r border-gray-800 p-0.5 cursor-pointer"
                          onClick={() => handleCellClick(week, team)}
                        >
                          <div className="px-1.5 py-1 rounded text-center bg-blue-900/60 border border-blue-700 text-blue-300 hover:bg-blue-900/90 whitespace-nowrap transition-colors">
                            {entry.isHome ? 'vs' : '@'} {entry.opponentAbbr}
                          </div>
                        </td>
                      );
                    }

                    // Game locked (past), not picked
                    if (gameLocked) {
                      return (
                        <td key={team} className="border-r border-gray-800 p-0.5">
                          <div className="px-1.5 py-1 rounded text-center text-gray-700 whitespace-nowrap">
                            {entry.isHome ? 'vs' : '@'} {entry.opponentAbbr}
                          </div>
                        </td>
                      );
                    }

                    // Available to plan
                    const teamAlreadySpoken = actuallyUsedTeams.has(team) || plannedTeams.has(team);
                    const weekFull = totalWeekPicks >= 2;
                    // Adding a pick here would turn this into a 2-team week — but only
                    // 5 of those are allowed for the season.
                    const doubleWeekCapReached = totalWeekPicks === 1 && doublePickWeeksUsed >= 5;
                    const canPlan = !teamAlreadySpoken && !weekFull && !doubleWeekCapReached;

                    return (
                      <td
                        key={team}
                        className={`border-r border-gray-800 p-0.5 ${canPlan ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={() => canPlan && handleCellClick(week, team)}
                      >
                        <div
                          className={`px-1.5 py-1 rounded text-center whitespace-nowrap transition-colors ${
                            canPlan
                              ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                              : 'text-gray-700'
                          }`}
                        >
                          {entry.isHome ? 'vs' : '@'} {entry.opponentAbbr}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(actuallyUsedTeams.size > 0 || plannedTeams.size > 0) && (
        <div className="mt-3 text-xs text-gray-600">
          {[...actuallyUsedTeams].map(t => (
            <span key={t} className="mr-2 line-through">{t}</span>
          ))}
          {[...plannedTeams].map(t => (
            <span key={t} className="mr-2 text-blue-500">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
