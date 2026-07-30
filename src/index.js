import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import { initDb } from './db/index.js';
import authRouter from './routes/auth.js';
import gamesRouter from './routes/games.js';
import picksRouter from './routes/picks.js';
import leaderboardRouter from './routes/leaderboard.js';
import adminRouter from './routes/admin.js';
import splitRouter from './routes/split.js';
import { startScoreUpdater } from './jobs/scoreUpdater.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3002;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5174';

const app = express();

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// API routes
app.use('/api/auth', authRouter);
app.use('/api/games', gamesRouter);
app.use('/api/picks', picksRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/split', splitRouter);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist');
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Initialize DB and start server
initDb();
startScoreUpdater();

app.listen(PORT, () => {
  console.log(`Big 10 Survivor server running on port ${PORT}`);
});
