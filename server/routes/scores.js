import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireTelegramAuth } from '../middleware/auth.js';
import { getWeeklyEventData } from '../weeklyEvent.js';

export const scoresRouter = Router();

// POST /api/scores  — submit score at game over
scoresRouter.post('/', requireTelegramAuth, async (req, res) => {
  const tid = req.telegramUserId;
  const { score, level } = req.body;

  if (typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'Invalid score.' });
  }

  // Fetch user for multiplier and best_score
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('shmips, best_score, total_games, multiplier_value, multiplier_end, has_golden_plane')
    .eq('telegram_id', tid)
    .single();

  if (userErr) return res.status(500).json({ error: userErr.message });

  // Apply active multiplier
  const now = new Date();
  const multiplierActive =
    user.multiplier_end && new Date(user.multiplier_end) > now;
  const effectiveMultiplier = multiplierActive ? Number(user.multiplier_value) : 1.0;
  const adjustedScore = Math.floor(score * effectiveMultiplier);

  // 1000 pts = 1 shmip (decimal — 650 pts = 0.65 shmips)
  const shmipsEarned = Math.round((adjustedScore / 1000) * 100) / 100;
  const newShmips    = Math.round((Number(user.shmips) + shmipsEarned) * 100) / 100;
  const newBest      = Math.max(user.best_score, adjustedScore);

  // Insert score record
  await supabase.from('scores').insert({
    telegram_id:   tid,
    score:         adjustedScore,
    level:         level || 1,
    shmips_earned: shmipsEarned,
  });

  // Update user stats; consume golden plane if used
  const updates = {
    shmips:      newShmips,
    best_score:  newBest,
    total_games: user.total_games + 1,
    has_golden_plane: false,   // golden plane is single-use
  };

  await supabase.from('users').update(updates).eq('telegram_id', tid);

  res.json({
    originalScore:    score,
    effectiveScore:   adjustedScore,
    multiplierUsed:   effectiveMultiplier,
    shmipsEarned,
    totalShmips:      newShmips,
    newBestScore:     newBest,
  });
});

// GET /api/scores/weekly  — 6-weekly event: top 3, countdown, no auth required
scoresRouter.get('/weekly', async (_req, res) => {
  try {
    const data = await getWeeklyEventData();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/scores/leaderboard  — top 5, no auth required
scoresRouter.get('/leaderboard', async (_req, res) => {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('nickname, best_score, games_played');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ leaderboard: data || [] });
});

// GET /api/scores/me  — personal best 5 games
scoresRouter.get('/me', requireTelegramAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('scores')
    .select('score, level, shmips_earned, played_at')
    .eq('telegram_id', req.telegramUserId)
    .order('score', { ascending: false })
    .limit(5);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ scores: data || [] });
});
