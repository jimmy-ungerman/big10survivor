import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/index.js';
import { ENTRY_FEE } from '../config.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const userId = req.user.userId;

  // Get current season
  const { rows: latestGame } = query(
    'SELECT season FROM games ORDER BY season DESC LIMIT 1'
  );
  if (latestGame.length === 0) {
    return res.json({ enabled: false });
  }
  const season = latestGame[0].season;

  // Total players and alive players
  const { rows: allUsers } = query(
    'SELECT id, is_eliminated FROM users WHERE is_admin = 0'
  );
  const totalPlayers = allUsers.length;
  const alivePlayers = allUsers.filter(u => u.is_eliminated === 0);
  const aliveCount = alivePlayers.length;
  const aliveIds = new Set(alivePlayers.map(u => u.id));

  // Current votes this season
  const { rows: votes } = query(
    'SELECT user_id, vote FROM split_votes WHERE season = $1',
    [season]
  );

  // Only count votes from currently alive players
  const aliveVotes = votes.filter(v => aliveIds.has(v.user_id));
  const yesVotes = aliveVotes.filter(v => v.vote === 1).length;
  const myVote = votes.find(v => v.user_id === userId);

  const totalPot = totalPlayers * ENTRY_FEE;
  const splitAmount = aliveCount > 0 ? Math.floor((totalPot / aliveCount) * 100) / 100 : 0;
  const consensus = aliveCount > 0 && yesVotes === aliveCount;

  res.json({
    season,
    entryFee: ENTRY_FEE,
    totalPlayers,
    aliveCount,
    totalPot,
    splitAmount,
    yesVotes,
    consensus,
    myVote: myVote ? myVote.vote === 1 : null,
  });
});

router.post('/', requireAuth, (req, res) => {
  const userId = req.user.userId;
  const { vote } = req.body;

  if (typeof vote !== 'boolean') {
    return res.status(400).json({ error: 'vote must be a boolean' });
  }

  // Must be alive to vote
  const { rows: userRows } = query('SELECT is_eliminated FROM users WHERE id = $1', [userId]);
  if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
  if (userRows[0].is_eliminated) {
    return res.status(400).json({ error: 'Eliminated players cannot vote' });
  }

  const { rows: latestGame } = query(
    'SELECT season FROM games ORDER BY season DESC LIMIT 1'
  );
  if (latestGame.length === 0) return res.status(400).json({ error: 'No active season' });
  const season = latestGame[0].season;

  query(
    `INSERT INTO split_votes (user_id, season, vote, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, season) DO UPDATE SET vote = $3, updated_at = CURRENT_TIMESTAMP`,
    [userId, season, vote ? 1 : 0]
  );

  res.json({ ok: true, vote });
});

export default router;
