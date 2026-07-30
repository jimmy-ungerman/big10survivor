import React, { useState, useEffect } from 'react';
import { api } from '../api/index.js';

export default function AdminPanel() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(new Set());

  useEffect(() => {
    api.getLeaderboard()
      .then(data => setPlayers(data.leaderboard || []))
      .catch(() => setError('Failed to load players'))
      .finally(() => setLoading(false));
  }, []);

  const setPaid = async (player, paid) => {
    setSaving(prev => new Set(prev).add(player.id));
    try {
      await api.setUserPaid(player.id, paid);
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, isPaid: paid } : p));
    } catch {
      setError(`Failed to update ${player.username}`);
    }
    setSaving(prev => { const s = new Set(prev); s.delete(player.id); return s; });
  };

  const bulkSetPaid = async (paid) => {
    const targets = players.filter(p => p.isPaid !== paid);
    for (const player of targets) {
      await setPaid(player, paid);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const paidCount = players.filter(p => p.isPaid).length;
  const unpaidCount = players.length - paidCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Admin Panel</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {paidCount} paid · {unpaidCount} unpaid · {players.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => bulkSetPaid(true)}
            disabled={unpaidCount === 0}
            className="text-xs px-3 py-1.5 rounded border border-green-800 text-green-400 hover:bg-green-950/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Mark all paid
          </button>
          <button
            onClick={() => bulkSetPaid(false)}
            disabled={paidCount === 0}
            className="text-xs px-3 py-1.5 rounded border border-red-800 text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Mark all unpaid
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-3 text-red-400 text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="text-red-300 hover:text-white ml-3">✕</button>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Player</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-center px-4 py-3 font-medium">Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {players.map(player => (
              <tr key={player.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${player.isEliminated ? 'text-gray-500 line-through' : 'text-white'}`}>
                      {player.username}
                    </span>
                    {player.isAdmin && (
                      <span className="text-xs text-purple-400 bg-purple-950/40 border border-purple-800 px-1.5 py-0.5 rounded">admin</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  {player.isEliminated
                    ? <span className="text-xs text-red-400 bg-red-950/40 border border-red-800 px-2 py-0.5 rounded">Out W{player.eliminatedWeek}</span>
                    : <span className="text-xs text-green-400 bg-green-950/40 border border-green-800 px-2 py-0.5 rounded">Alive</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setPaid(player, !player.isPaid)}
                      disabled={saving.has(player.id)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                        player.isPaid ? 'bg-green-600' : 'bg-gray-700'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        player.isPaid ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </button>
                    <span className={`text-xs w-12 ${player.isPaid ? 'text-green-400' : 'text-gray-500'}`}>
                      {saving.has(player.id) ? '...' : player.isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
