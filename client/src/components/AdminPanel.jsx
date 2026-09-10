import React, { useState, useEffect } from 'react';
import { api } from '../api/index.js';

function generateTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `b10-${s}`;
}

function StatusBadge({ player }) {
  return player.isEliminated
    ? <span className="text-xs text-red-400 bg-red-950/40 border border-red-800 px-2 py-0.5 rounded">Out W{player.eliminatedWeek}</span>
    : <span className="text-xs text-green-400 bg-green-950/40 border border-green-800 px-2 py-0.5 rounded">Alive</span>;
}

function PlayerName({ player }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`font-medium ${player.isEliminated ? 'text-gray-500 line-through' : 'text-white'}`}>
        {player.username}
      </span>
      {player.isAdmin && (
        <span className="text-xs text-purple-400 bg-purple-950/40 border border-purple-800 px-1.5 py-0.5 rounded">admin</span>
      )}
      {player.mustChangePassword && (
        <span className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800 px-1.5 py-0.5 rounded">temp pw</span>
      )}
    </div>
  );
}

function PaidToggle({ player, busy, onToggle }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggle}
        disabled={busy}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
          player.isPaid ? 'bg-green-600' : 'bg-gray-700'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          player.isPaid ? 'translate-x-4' : 'translate-x-1'
        }`} />
      </button>
      <span className={`text-xs w-12 ${player.isPaid ? 'text-green-400' : 'text-gray-500'}`}>
        {busy ? '...' : player.isPaid ? 'Paid' : 'Unpaid'}
      </span>
    </div>
  );
}

function ResetButton({ player, confirmReset, resetting, onReset }) {
  return (
    <button
      onClick={onReset}
      disabled={resetting === player.id}
      className={`text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-40 whitespace-nowrap ${
        confirmReset === player.id
          ? 'border-amber-700 text-amber-300 bg-amber-950/40'
          : 'border-gray-700 text-gray-400 hover:bg-gray-800'
      }`}
    >
      {resetting === player.id
        ? 'Resetting...'
        : confirmReset === player.id
          ? 'Confirm reset?'
          : 'Reset password'}
    </button>
  );
}

function ResetResultBanner({ result, onDismiss }) {
  return (
    <div className="bg-green-950/40 border border-green-800 rounded-lg p-3 text-sm text-green-300 flex items-start justify-between gap-3">
      <div>
        Reset <span className="font-semibold">{result.username}</span>. Send them this
        temp password — they'll set their own on next login:
        <div className="mt-1.5 font-mono text-base text-white bg-gray-800 rounded px-3 py-1.5 inline-block select-all">
          {result.tempPassword}
        </div>
      </div>
      <button onClick={onDismiss} className="text-green-300 hover:text-white">✕</button>
    </div>
  );
}

export default function AdminPanel() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(new Set());

  const [form, setForm] = useState({ fullName: '', username: '', tempPassword: generateTempPassword(), isPaid: true });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null); // { username, tempPassword }

  const [confirmReset, setConfirmReset] = useState(null); // player id awaiting confirm
  const [resetting, setResetting] = useState(null); // player id in flight
  const [resetResult, setResetResult] = useState(null); // { id, username, tempPassword }

  const refresh = () =>
    api.getLeaderboard()
      .then(data => setPlayers(data.leaderboard || []))
      .catch(() => setError('Failed to load players'));

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const createPlayer = async (e) => {
    e.preventDefault();
    setError('');
    setCreated(null);
    setCreating(true);
    try {
      const { user } = await api.createUser(form);
      setCreated({ username: user.username, tempPassword: form.tempPassword });
      setForm({ fullName: '', username: '', tempPassword: generateTempPassword(), isPaid: true });
      await refresh();
    } catch (err) {
      setError(err.message || 'Failed to create player');
    }
    setCreating(false);
  };

  const resetPassword = async (player) => {
    if (confirmReset !== player.id) {
      setConfirmReset(player.id);
      return;
    }
    setConfirmReset(null);
    setError('');
    setResetResult(null);
    setResetting(player.id);
    try {
      const tempPassword = generateTempPassword();
      await api.resetUserPassword(player.id, tempPassword);
      setResetResult({ id: player.id, username: player.username, tempPassword });
      await refresh();
    } catch (err) {
      setError(err.message || `Failed to reset ${player.username}'s password`);
    }
    setResetting(null);
  };

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

      {/* Add a player manually (for people who paid/picked after registration locked) */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Add player</h3>
        <form onSubmit={createPlayer} className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={form.fullName}
            onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="Full name"
            required minLength={2} maxLength={60}
          />
          <input
            type="text"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="Username"
            required minLength={2} maxLength={30}
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={form.tempPassword}
              onChange={e => setForm(f => ({ ...f, tempPassword: e.target.value }))}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
              placeholder="Temp password"
              required minLength={4}
            />
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, tempPassword: generateTempPassword() }))}
              className="text-xs px-2 py-2 rounded border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors"
            >
              Generate
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={form.isPaid}
              onChange={e => setForm(f => ({ ...f, isPaid: e.target.checked }))}
              className="accent-green-600"
            />
            Mark as paid
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-400 text-white font-semibold transition-colors"
            >
              {creating ? 'Adding...' : 'Add player'}
            </button>
          </div>
        </form>

        {created && (
          <div className="mt-3 bg-green-950/40 border border-green-800 rounded-lg p-3 text-sm text-green-300">
            Created <span className="font-semibold">{created.username}</span>. Send them this temp password —
            they'll be forced to change it on first login:
            <div className="mt-1.5 font-mono text-base text-white bg-gray-800 rounded px-3 py-1.5 inline-block select-all">
              {created.tempPassword}
            </div>
          </div>
        )}
      </div>

      {/* Mobile: stacked cards */}
      <div className="space-y-2 sm:hidden">
        {players.map(player => (
          <div key={player.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <PlayerName player={player} />
              <StatusBadge player={player} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <PaidToggle
                player={player}
                busy={saving.has(player.id)}
                onToggle={() => setPaid(player, !player.isPaid)}
              />
              <ResetButton
                player={player}
                confirmReset={confirmReset}
                resetting={resetting}
                onReset={() => resetPassword(player)}
              />
            </div>
            {resetResult?.id === player.id && (
              <ResetResultBanner result={resetResult} onDismiss={() => setResetResult(null)} />
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Player</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-center px-4 py-3 font-medium">Paid</th>
              <th className="text-right px-4 py-3 font-medium">Password</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {players.map(player => (
              <React.Fragment key={player.id}>
              <tr className="hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3">
                  <PlayerName player={player} />
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge player={player} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <PaidToggle
                      player={player}
                      busy={saving.has(player.id)}
                      onToggle={() => setPaid(player, !player.isPaid)}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <ResetButton
                    player={player}
                    confirmReset={confirmReset}
                    resetting={resetting}
                    onReset={() => resetPassword(player)}
                  />
                </td>
              </tr>
              {resetResult?.id === player.id && (
                <tr>
                  <td colSpan={4} className="px-4 pb-3">
                    <ResetResultBanner result={resetResult} onDismiss={() => setResetResult(null)} />
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
