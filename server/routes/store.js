import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireTelegramAuth } from '../middleware/auth.js';

export const storeRouter = Router();

// Catalog — single source of truth for all purchasable items
export const CATALOG = [
  // ── Gameplay Upgrades ──────────────────────────────────────
  { id: 'extra_life',   name: 'Extra Life',      category: 'upgrade', cost: 500,  description: '+1 life per game',         icon: '❤️'  },
  { id: 'extra_flare',  name: 'Extra Flare',     category: 'upgrade', cost: 300,  description: '+1 flare per game',        icon: '🔥'  },
  { id: 'rapid_fire',   name: 'Rapid Fire',      category: 'upgrade', cost: 800,  description: '2× bullet fire rate',      icon: '⚡'  },
  { id: 'laser',        name: 'Laser Cannon',    category: 'upgrade', cost: 1500, description: 'Replaces bullets w/ laser', icon: '🔴'  },
  { id: 'shield',       name: 'Shield Module',   category: 'upgrade', cost: 1000, description: 'Absorbs one hit per game', icon: '🛡️' },

  // ── Ship Skins ────────────────────────────────────────────
  { id: 'ship_purple',      name: 'Purple Wing',      category: 'skin', cost: 5,   description: 'Classic purple hull',    color: '#bf5fff' },
  { id: 'ship_cyan',        name: 'Cyan Blade',       category: 'skin', cost: 5,   description: 'Electric cyan body',     color: '#00ffff' },
  { id: 'ship_orange',      name: 'Orange Inferno',   category: 'skin', cost: 10,  description: 'Fiery orange shell',     color: '#ff6600' },
  { id: 'ship_pink',        name: 'Neon Pink',        category: 'skin', cost: 15,  description: 'Hot pink chrome',        color: '#ff00cc' },
  { id: 'ship_purple_gold', name: 'Royal Hunter',     category: 'skin', cost: 50,  description: 'Purple + gold trim',     color: '#bf5fff', accent: '#ffd700' },
  { id: 'ship_green_purple',name: 'Synthwave Reaper', category: 'skin', cost: 50,  description: 'Green + purple gradient', color: '#00ff41', accent: '#bf5fff' },
  { id: 'ship_gold',        name: 'Gold Commander',   category: 'skin', cost: 200, description: 'Full gold prestige hull', color: '#ffd700' },

  // ── Planes (full plane upgrades) ──────────────────────────
  { id: 'plane_stealth', name: 'Stealth Viper',  category: 'plane', cost: 2000, description: '4 lives · 4 flares · Rapid Fire',  lives: 4, flares: 4, rapidFire: true  },
  { id: 'plane_titan',   name: 'Titan Fortress', category: 'plane', cost: 5000, description: '6 lives · Shield · Laser',          lives: 6, flares: 2, shield: true, laser: true },
];

// GET /api/store/catalog  — public, no auth
storeRouter.get('/catalog', (_req, res) => {
  res.json({ catalog: CATALOG });
});

// POST /api/store/buy  — purchase an item
storeRouter.post('/buy', requireTelegramAuth, async (req, res) => {
  const tid       = req.telegramUserId;
  const { itemId } = req.body;

  const item = CATALOG.find((c) => c.id === itemId);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('shmips')
    .eq('telegram_id', tid)
    .single();

  if (userErr) return res.status(500).json({ error: userErr.message });

  if (user.shmips < item.cost) {
    return res.status(402).json({
      error: `Not enough Shmips. Need ${item.cost}, have ${user.shmips}.`,
    });
  }

  // Check if already owned (for non-stackable items)
  const stackable = ['extra_life', 'extra_flare'];
  if (!stackable.includes(item.id)) {
    const { data: existing } = await supabase
      .from('user_upgrades')
      .select('id')
      .eq('telegram_id', tid)
      .eq('upgrade_id', item.id)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'You already own this item.' });
    }
  }

  // Deduct cost
  const { error: deductErr } = await supabase
    .from('users')
    .update({ shmips: user.shmips - item.cost })
    .eq('telegram_id', tid);

  if (deductErr) return res.status(500).json({ error: deductErr.message });

  // Grant the item
  const { data: existing } = await supabase
    .from('user_upgrades')
    .select('quantity')
    .eq('telegram_id', tid)
    .eq('upgrade_id', item.id)
    .single();

  if (existing) {
    await supabase
      .from('user_upgrades')
      .update({ quantity: existing.quantity + 1 })
      .eq('telegram_id', tid)
      .eq('upgrade_id', item.id);
  } else {
    await supabase.from('user_upgrades').insert({
      telegram_id: tid,
      upgrade_id:  item.id,
      quantity:    1,
    });
  }

  res.json({
    purchased:   item,
    newBalance:  user.shmips - item.cost,
  });
});
