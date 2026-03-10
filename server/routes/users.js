import { Router } from 'express';
import { supabase, DB_OK } from '../supabase.js';
import { requireTelegramAuth } from '../middleware/auth.js';

export const usersRouter = Router();
const dbGuard = (_req, res, next) => DB_OK ? next() : res.status(503).json({ error: 'Database not configured. Check Railway env vars.' });

// GET /api/users/me  — fetch or auto-create the calling user's profile
usersRouter.get('/me', dbGuard, requireTelegramAuth, async (req, res) => {
  const tid  = req.telegramUserId;
  const tgUser = req.telegramUser || {};
  // Build a readable Telegram display name: "@username" or "First Last"
  const teleName = tgUser.username
    ? `@${tgUser.username}`
    : [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || null;

  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', tid)
    .single();

  if (error && error.code === 'PGRST116') {
    // User does not exist yet — create with defaults
    const { data: newUser, error: createErr } = await supabase
      .from('users')
      .insert({ telegram_id: tid, nickname: 'ACE', tele_name: teleName })
      .select()
      .single();

    if (createErr) return res.status(500).json({ error: createErr.message });
    return res.json({ user: newUser, isNew: true });
  }

  if (error) return res.status(500).json({ error: error.message });

  // Keep tele_name in sync every login (Telegram name can change)
  if (teleName && teleName !== user.tele_name) {
    await supabase.from('users').update({ tele_name: teleName }).eq('telegram_id', tid);
    user.tele_name = teleName;
  }

  // Fetch user's upgrades
  const { data: upgrades } = await supabase
    .from('user_upgrades')
    .select('upgrade_id, quantity')
    .eq('telegram_id', tid);

  res.json({ user, upgrades: upgrades || [], isNew: false });
});

// PATCH /api/users/me/nickname  — change nickname (costs 1000 shmips)
usersRouter.patch('/me/nickname', dbGuard, requireTelegramAuth, async (req, res) => {
  const tid = req.telegramUserId;
  const { nickname } = req.body;

  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ error: 'Nickname is required.' });
  }
  const clean = nickname.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 12);
  if (!clean) return res.status(400).json({ error: 'Invalid nickname.' });

  // Fetch current shmips
  const { data: user, error: fetchErr } = await supabase
    .from('users')
    .select('shmips, nickname')
    .eq('telegram_id', tid)
    .single();

  if (fetchErr) return res.status(500).json({ error: fetchErr.message });

  // First-time nickname set is free; subsequent changes cost 1000
  const isFirstSet = user.nickname === 'ACE';
  if (!isFirstSet && user.shmips < 1000) {
    return res.status(402).json({ error: 'Not enough Shmips. Costs 1,000 Shmips.' });
  }

  const newShmips = isFirstSet ? user.shmips : user.shmips - 1000;

  const { data: updated, error: updateErr } = await supabase
    .from('users')
    .update({ nickname: clean, shmips: newShmips })
    .eq('telegram_id', tid)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  res.json({ user: updated });
});
