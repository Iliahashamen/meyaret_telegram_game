// ============================================================
// MEYARET — Weekly Top 3 Event
// Resets each Tuesday 10:01 (WEEKLY_EVENT_TZ). Top 5 global is UNCHANGED.
// Display: bots fill empty slots until real users play.
// Prize: set WEEKLY_PRIZE_SHMIPS in env (default 6500).
// ============================================================

import cron from 'node-cron';
import { supabase } from './supabase.js';

const WEEKLY_EVENT_TZ = process.env.WEEKLY_EVENT_TZ || 'Asia/Jerusalem';
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID || 0);
const WEEKLY_PRIZE_SHMIPS = Number(process.env.WEEKLY_PRIZE_SHMIPS) || 6500;

const FAKE_CALLSIGNS = [
  'VIPER', 'GHOST', 'RAVEN', 'BLAZE', 'COBRA', 'STORM', 'PHANTOM', 'FALCON',
  'SABRE', 'AXIS', 'BOLT', 'FLARE', 'NOVA', 'ZERO', 'ECHO', 'APEX', 'SPARK',
  'CHROME', 'EMBER', 'PULSE', 'SLASH', 'WRAITH', 'SALVO', 'RICOCHET', 'VENOM',
];

function getNextTuesday1001() {
  const now = Date.now();
  const tz = WEEKLY_EVENT_TZ;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  for (let h = 0; h < 240; h++) {
    const cand = new Date(now + h * 60 * 60 * 1000);
    const parts = fmt.formatToParts(cand);
    const weekday = parts.find(p => p.type === 'weekday')?.value || '';
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);
    if (weekday === 'Tue' && hour === 10) {
      const targetMin = 1;
      const adjustMs = ((minute - targetMin) * 60 + second) * 1000;
      const tuesday1001 = new Date(cand.getTime() - adjustMs);
      if (tuesday1001.getTime() > now + 60000) return tuesday1001;
    }
  }
  return new Date(now + 7 * 24 * 60 * 60 * 1000);
}

function getCurrentWeekBounds() {
  const next = getNextTuesday1001();
  const end = new Date(next);
  const start = new Date(next);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

function getPreviousWeekBounds() {
  const { start } = getCurrentWeekBounds();
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(start);
  return { start: prevStart, end: prevEnd };
}

function pickBotEntry(rank, usedFake) {
  let callsign = FAKE_CALLSIGNS[rank % FAKE_CALLSIGNS.length];
  let j = 0;
  while (usedFake.has(callsign) && j < FAKE_CALLSIGNS.length) {
    callsign = FAKE_CALLSIGNS[(rank + j) % FAKE_CALLSIGNS.length];
    j++;
  }
  usedFake.add(callsign);
  const fakeScore = Math.floor(50000 - rank * 12000 + Math.random() * 3000);
  return {
    rank: rank + 1,
    nickname: callsign,
    best_score: fakeScore,
    telegram_id: null,
    isBot: true,
  };
}

export async function getWeeklyTop3(weekBounds, options = {}) {
  const { start, end } = weekBounds;
  const { forDisplay = false } = options;
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const result = supabase
    ? await supabase.from('scores').select('telegram_id, score')
      .gte('played_at', startIso).lt('played_at', endIso)
    : { data: [], error: null };
  const scores = result?.data || [];
  const err = result?.error;

  if (err) return { top3: [], error: err.message };

  const byUser = new Map();
  for (const row of scores) {
    if (row.telegram_id === ADMIN_TELEGRAM_ID) continue;
    const tid = row.telegram_id;
    const prev = byUser.get(tid) || 0;
    byUser.set(tid, Math.max(prev, row.score));
  }

  const entries = Array.from(byUser.entries())
    .map(([telegram_id, best_score]) => ({ telegram_id, best_score }))
    .sort((a, b) => b.best_score - a.best_score)
    .slice(0, 3);

  // Bots fill empty slots until real users play (no 24h blank)
  const realIds = entries.map(e => e.telegram_id).filter(Boolean);
  const nickMap = new Map();
  if (realIds.length && supabase) {
    const { data: users } = await supabase
      .from('users')
      .select('telegram_id, nickname')
      .in('telegram_id', realIds);
    for (const u of users || []) nickMap.set(u.telegram_id, u.nickname);
  }

  const top3 = [];
  const usedFake = new Set();
  const realCount = entries.length;
  const fillWithBots = !forDisplay || realCount === 0 || realCount < 3;

  for (let i = 0; i < 3; i++) {
    if (entries[i]) {
      top3.push({
        rank: i + 1,
        nickname: nickMap.get(entries[i].telegram_id) || 'ACE',
        best_score: entries[i].best_score,
        telegram_id: entries[i].telegram_id,
        isBot: false,
      });
    } else if (fillWithBots) {
      top3.push(pickBotEntry(i, usedFake));
    }
  }
  return { top3, error: null };
}

export async function runWeeklyPayout(bot) {
  if (!supabase) {
    console.warn('[weekly] No supabase - skipping payout');
    return;
  }
  const { start, end } = getPreviousWeekBounds();
  const { top3, error } = await getWeeklyTop3({ start, end });
  if (error) {
    console.error('[weekly] getWeeklyTop3 error:', error);
    return;
  }
  const realWinners = top3.filter(e => !e.isBot).slice(0, 3);
  for (const w of realWinners) {
    const { data: user } = await supabase
      .from('users')
      .select('shmips, nickname')
      .eq('telegram_id', w.telegram_id)
      .single();
    if (!user) continue;
    const newShmips = Math.round((Number(user.shmips) + WEEKLY_PRIZE_SHMIPS) * 100) / 100;
    await supabase.from('users').update({ shmips: newShmips }).eq('telegram_id', w.telegram_id);
    if (bot) {
      try {
        await bot.api.sendMessage(
          w.telegram_id,
          '🏆 *WEEKLY TOP 3 — YOU WON!*\n\nYou placed #' + w.rank + ' in last week\'s event. +' + WEEKLY_PRIZE_SHMIPS.toLocaleString() + ' $$ has been added to your account!\n\n_Reload the game to see your shmips._',
          { parse_mode: 'Markdown' },
        );
      } catch (e) {
        console.warn('[weekly] Failed to notify', w.telegram_id, e.message);
      }
    }
  }
  console.log('[weekly] Payout complete. ' + realWinners.length + ' pilots received ' + WEEKLY_PRIZE_SHMIPS + ' $$ each.');
}

export async function getWeeklyEventData() {
  const { start, end } = getCurrentWeekBounds();
  const nextClose = getNextTuesday1001();
  const countdownMs = Math.max(0, nextClose.getTime() - Date.now());
  const { top3 } = await getWeeklyTop3({ start, end }, { forDisplay: true });
  return {
    closesAt: nextClose.toISOString(),
    countdownMs,
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    prizeShmips: WEEKLY_PRIZE_SHMIPS,
    top3: top3.map(({ rank, nickname, best_score, isBot }) =>
      ({ rank, nickname, best_score, isBot })),
  };
}

export function scheduleWeeklyReminder(bot) {
  if (!ADMIN_TELEGRAM_ID) return;
  cron.schedule('0 8 * * 2', async () => {
    try {
      await bot.api.sendMessage(
        ADMIN_TELEGRAM_ID,
        '⏰ *WEEKLY PAYOUT REMINDER*\n\nRun the payout in ~2 hours (closes 10:01). Top 3 only.',
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🏆 RUN WEEKLY PAYOUT', callback_data: 'tools_weekly_payout' }]] },
        },
      );
    } catch (e) {
      console.warn('[weekly] Reminder failed:', e.message);
    }
  }, { timezone: WEEKLY_EVENT_TZ });
  console.log('[weekly] Reminder scheduled: Tuesdays 08:00', WEEKLY_EVENT_TZ);
}

export function scheduleWeeklyPayout(bot) {
  cron.schedule('1 10 * * 2', async () => {
    console.log('[weekly] Cron: Running payout...');
    await runWeeklyPayout(bot);
  }, { timezone: WEEKLY_EVENT_TZ });
  console.log('[weekly] Payout scheduled: Tuesdays 10:01', WEEKLY_EVENT_TZ);
}
