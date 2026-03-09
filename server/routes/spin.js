import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireTelegramAuth } from '../middleware/auth.js';

export const spinRouter = Router();

// Spin reward table — 18 prizes, weights sum to 100
// Includes 5 separate "5 $$" prizes by request.
const REWARDS = [
  { id: 'cash_5_a',        weight: 8, label: '5 $$',              type: 'shmips', value: 5 },
  { id: 'cash_5_b',        weight: 8, label: '5 $$',              type: 'shmips', value: 5 },
  { id: 'cash_5_c',        weight: 8, label: '5 $$',              type: 'shmips', value: 5 },
  { id: 'cash_5_d',        weight: 8, label: '5 $$',              type: 'shmips', value: 5 },
  { id: 'cash_5_e',        weight: 8, label: '5 $$',              type: 'shmips', value: 5 },
  { id: 'cash_10',         weight: 11, label: '10 $$',            type: 'shmips', value: 10 },
  { id: 'cash_15',         weight: 8,  label: '15 $$',            type: 'shmips', value: 15 },
  { id: 'cash_20',         weight: 6,  label: '20 $$',            type: 'shmips', value: 20 },
  { id: 'cash_30',         weight: 3,  label: '30 $$',            type: 'shmips', value: 30 },
  { id: 'cash_50',         weight: 1,  label: '50 $$',            type: 'shmips', value: 50 },
  { id: 'multi_2x_15',     weight: 6,  label: '2x Points (15m)',  type: 'multi',  multi: 2.0, duration: 15 },
  { id: 'multi_2x_30',     weight: 5,  label: '2x Points (30m)',  type: 'multi',  multi: 2.0, duration: 30 },
  { id: 'multi_2x_60',     weight: 4,  label: '2x Points (1h)',   type: 'multi',  multi: 2.0, duration: 60 },
  { id: 'multi_3x_20',     weight: 2,  label: '3x Points (20m)',  type: 'multi',  multi: 3.0, duration: 20 },
  { id: 'multi_3x_60',     weight: 1,  label: '3x Points (1h)',   type: 'multi',  multi: 3.0, duration: 60 },
  { id: 'golden_plane',    weight: 1,  label: 'Golden Plane',     type: 'golden_plane' },
  { id: 'random_upgrade_a',weight: 6,  label: 'Random Upgrade',   type: 'upgrade' },
  { id: 'random_upgrade_b',weight: 6,  label: 'Random Upgrade',   type: 'upgrade' },
];

// Random pool of permanent upgrades given via spin
const UPGRADE_POOL = ['extra_life', 'extra_flare', 'rapid_fire', 'laser', 'ship_purple', 'ship_gold'];

function pickReward() {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const r of REWARDS) {
    cumulative += r.weight;
    if (roll < cumulative) return r;
  }
  return REWARDS[0];
}

// POST /api/spin  — attempt a daily spin
spinRouter.post('/', requireTelegramAuth, async (req, res) => {
  const tid = req.telegramUserId;

  const { data: user, error } = await supabase
    .from('users')
    .select('shmips, last_spin_at, multiplier_value, multiplier_end')
    .eq('telegram_id', tid)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Check cooldown: 6 hours from last spin
  const now = new Date();
  if (user.last_spin_at) {
    const lastSpin      = new Date(user.last_spin_at);
    const cooldownMs    = 6 * 60 * 60 * 1000;
    const nextAvailable = new Date(lastSpin.getTime() + cooldownMs);
    if (now < nextAvailable) {
      return res.status(429).json({
        error: 'Spin not available yet.',
        nextAvailableAt: nextAvailable.toISOString(),
        remainingMs: nextAvailable - now,
      });
    }
  }

  const reward = pickReward();
  const updates = { last_spin_at: now.toISOString() };

  // Apply reward effects
  let grantedUpgrade = null;

  if (reward.type === 'shmips') {
    updates.shmips = user.shmips + reward.value;

  } else if (reward.type === 'multi') {
    updates.multiplier_value = reward.multi;
    updates.multiplier_end   = new Date(now.getTime() + reward.duration * 60 * 1000).toISOString();

  } else if (reward.type === 'golden_plane') {
    updates.has_golden_plane = true;

  } else if (reward.type === 'upgrade') {
    grantedUpgrade = UPGRADE_POOL[Math.floor(Math.random() * UPGRADE_POOL.length)];
    // Upsert upgrade (increment quantity if already owned)
    const { data: existing } = await supabase
      .from('user_upgrades')
      .select('quantity')
      .eq('telegram_id', tid)
      .eq('upgrade_id', grantedUpgrade)
      .single();

    if (existing) {
      await supabase
        .from('user_upgrades')
        .update({ quantity: existing.quantity + 1 })
        .eq('telegram_id', tid)
        .eq('upgrade_id', grantedUpgrade);
    } else {
      await supabase.from('user_upgrades').insert({
        telegram_id: tid,
        upgrade_id:  grantedUpgrade,
        quantity:    1,
      });
    }
  }

  await supabase.from('users').update(updates).eq('telegram_id', tid);

  res.json({
    reward: {
      id:    reward.id,
      label: reward.label,
      type:  reward.type,
      upgrade: grantedUpgrade,
    },
    nextAvailableAt: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
  });
});

// GET /api/spin/status  — check if spin is available
spinRouter.get('/status', requireTelegramAuth, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('last_spin_at')
    .eq('telegram_id', req.telegramUserId)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const now = new Date();
  if (!user.last_spin_at) {
    return res.json({ available: true, remainingMs: 0 });
  }

  const nextAvailable = new Date(new Date(user.last_spin_at).getTime() + 6 * 60 * 60 * 1000);
  const available     = now >= nextAvailable;

  res.json({
    available,
    remainingMs:     available ? 0 : nextAvailable - now,
    nextAvailableAt: nextAvailable.toISOString(),
  });
});
