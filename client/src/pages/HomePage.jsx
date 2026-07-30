import React, { useState } from 'react';
import { useAuth } from '../App.jsx';
import WeekPicker from '../components/WeekPicker.jsx';
import WeekView from '../components/WeekView.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import PlanningSheet from '../components/PlanningSheet.jsx';
import AdminPanel from '../components/AdminPanel.jsx';

const TABS = [
  { id: 'pick', label: 'Make Picks' },
  { id: 'week', label: 'This Week' },
  { id: 'standings', label: 'Standings' },
  { id: 'plan', label: 'Plan' },
  { id: 'admin', label: 'Admin', adminOnly: true },
];

export default function HomePage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('pick');

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">Big Ten Survivor</h1>
            {user?.isEliminated && (
              <span className="bg-red-900/40 text-red-400 text-xs font-medium px-2 py-0.5 rounded-full border border-red-800">
                Eliminated
              </span>
            )}
            {user?.isAdmin && !user?.isEliminated && (
              <span className="bg-blue-900/40 text-blue-400 text-xs font-medium px-2 py-0.5 rounded-full border border-blue-800">
                Admin
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 hidden sm:block">{user?.username}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-4xl mx-auto px-4 flex gap-0 border-t border-gray-800">
          {TABS.filter(tab => !tab.adminOnly || user?.isAdmin).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Eliminated banner */}
      {user?.isEliminated && (
        <div className="bg-red-950/50 border-b border-red-900 py-3">
          <div className="max-w-4xl mx-auto px-4 text-center text-red-400 text-sm">
            You were eliminated in Week {user.eliminatedWeek}. You can still view picks and standings.
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'pick' && <WeekPicker />}
        {activeTab === 'week' && <WeekView />}
        {activeTab === 'standings' && <Leaderboard />}
        {activeTab === 'plan' && <PlanningSheet />}
        {activeTab === 'admin' && user?.isAdmin && <AdminPanel />}
      </main>
    </div>
  );
}
