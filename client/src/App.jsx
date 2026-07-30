import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { api } from './api/index.js';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import HomePage from './pages/HomePage.jsx';

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-400 text-lg">Loading...</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.me()
      .then(data => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const data = await api.login(username, password);
    setUser(data.user);
    navigate('/');
  };

  const register = async (username, password) => {
    const data = await api.register(username, password);
    setUser(data.user);
    navigate('/');
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        } />
      </Routes>
    </AuthContext.Provider>
  );
}
