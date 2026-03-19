import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Bot, webhookCallback } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';

import { usersRouter }  from './routes/users.js';
import { scoresRouter } from './routes/scores.js';
import { storeRouter }  from './routes/store.js';
import { supabase }     from './supabase.js';
import { requireTelegramAuth } from './middleware/auth.js';
import { scheduleWeeklyPayout, runWeeklyPayout } from './weeklyEvent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const app  = express();
const PORT = process.env.PORT || 3000;

// Keep the process alive — log unhandled errors instead of crashing
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException',  (err)    => console.error('[uncaughtException]',  err));

// ── Security & Middleware ──────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data'],
  credentials: false,
}));
app.options('*', cors());
app.use(express.json());

// ── Static Files ──────────────────────────────────────────────────────────────
console.log('[server] Serving static from:', PUBLIC_DIR);
app.use(express.static(PUBLIC_DIR));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/users',  usersRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/store',  storeRouter);

// ── Sandbox check — only ADMIN_TELEGRAM_ID gets sandbox (MEYARET 2 BETA)
app.get('/api/sandbox', requireTelegramAuth, (req, res) => {
  const sandboxId = Number(process.env.ADMIN_TELEGRAM_ID || 0);
  const tid = Number(req.telegramUserId);
  const isSandbox = sandboxId && tid === sandboxId;
  res.json({ sandbox: !!isSandbox });
});

// ── Public client config — serves anon key from env var, never from source ────
app.get('/api/config', (_req, res) => {
  // Railway / pasted env often includes trailing \n — breaks fetch() URL + JWT auth
  const rawUrl = (process.env.SUPABASE_URL || '').trim().replace(/\r?\n/g, '');
  const supaKey = (process.env.SUPABASE_ANON_KEY || '').trim().replace(/\r?\n/g, '');
  if (!rawUrl || !supaKey) {
    return res.status(503).json({ error: 'Server not configured yet.' });
  }
  const base = rawUrl.replace(/\/+$/, '');
  const supaUrl = `${base}/rest/v1`;
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ supaUrl, supaKey });
});

// ── Cron: weekly payout (external cron can hit this; set CRON_SECRET in env)
app.post('/api/cron/weekly-payout', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'] || req.query?.secret;
  if (!secret || provided !== secret) return res.status(403).json({ error: 'Forbidden' });
  try {
    await runWeeklyPayout(bot);
    res.json({ ok: true, msg: 'Weekly payout completed' });
  } catch (e) {
    console.error('[cron/weekly-payout]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const configured =
    !!process.env.SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !!process.env.TELEGRAM_BOT_TOKEN;
  res.json({ ok: configured, ts: new Date().toISOString() });
});

// ── Fallback: serve index.html for all non-API routes ─────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/bot')) return res.status(404).end();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Telegram Bot Setup ────────────────────────────────────────────────────────
// Trim token — Railway/env often adds trailing newline, which breaks API calls
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const bot = new Bot(BOT_TOKEN);

// Auto-retry on ETIMEDOUT — 1 retry, max 2s wait (avoids long hangs; 3 retries + backoff felt like "not responding")
bot.api.config.use(autoRetry({ maxRetryAttempts: 2, maxDelaySeconds: 3 }));

// Catch handler errors (ETIMEDOUT, etc.) so they don’t surface as unhandledRejection
bot.catch(async (err) => {
  const msg = err?.error?.message || err?.message || String(err);
  console.warn('[bot] Handler error:', msg);
  try {
    const ctx = err?.ctx;
    if (ctx?.chat?.id) await ctx.reply('Something went wrong. Try /start or /play again.').catch(() => {});
    if (ctx?.callbackQuery?.id) await ctx.answerCallbackQuery({ text: 'Error - try again' }).catch(() => {});
  } catch (_) {}
});

const GAME_URL = process.env.MINI_APP_URL;

async function setMenuButton() {
  if (!GAME_URL) { console.warn('[bot] MINI_APP_URL not set — skipping menu button'); return; }
  try {
    await bot.api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'PLAY', web_app: { url: GAME_URL } },
    });
    console.log('[bot] Menu button set → PLAY', GAME_URL);
  } catch (e) {
    console.warn('[bot] Could not set menu button:', e.message);
  }
}

// ── Shared welcome message (used by /start and /announce) ─────────────────────
const WELCOME_MSG =
`🚀 *WELCOME TO MEYARET!*

Survive endless waves of asteroids, jets & rockets — shoot, dodge, collect upgrades and climb the leaderboard. Use flares to counter homing rockets and grab the green star for chaos mode!

📸 *Post the game on your Instagram Story, tag* @iliahashamen *and get 250$$ in-game shmips!* Every post after that earns you another 50$$ — just send me the story!

━━━━━━━━━━━━━━━━━━

🚀 *ברוכים הבאים למיירט!*

תפוצצו כמה שיותר אסטרואידים, התחמקו מטילים ותשמידו מטוסי קרב של האויב! תרוויחו שמיפס ותקנו מטוסים, שדרוגים ואפילו סקינים מיוחדים 🔥

📸 *פרסמו בסטורי את המשחק עם קישור ותייגו* @iliahashamen *— ותקבלו 250$$ שמיפס מתנה!* כל פרסום אחרי זה שווה עוד 50$$ כל עוד מתייגים אותי. תהנו חברים! 🎁`;

const WELCOME_KEYBOARD = {
  inline_keyboard: [[{ text: '🎮 PLAY MEYARET', web_app: { url: GAME_URL } }]],
};

// /start — welcome message for new (and returning) players
bot.command('start', async (ctx) => {
  await ctx.reply(WELCOME_MSG, {
    parse_mode: 'Markdown',
    reply_markup: WELCOME_KEYBOARD,
  });
});

// /announce — admin only: broadcast welcome message to ALL users in DB
bot.command('announce', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.reply('Access denied.');
  if (!supabase) return ctx.reply('DB not connected.');

  await ctx.reply('📡 Starting broadcast to all players...');

  const { data: users, error } = await supabase
    .from('users')
    .select('telegram_id');

  if (error || !users?.length) {
    return ctx.reply('No users found or DB error: ' + (error?.message || ''));
  }

  let sent = 0, failed = 0;
  for (const u of users) {
    try {
      await bot.api.sendMessage(u.telegram_id, WELCOME_MSG, {
        parse_mode: 'Markdown',
        reply_markup: WELCOME_KEYBOARD,
      });
      sent++;
      // Small delay to avoid Telegram rate limits
      await new Promise(r => setTimeout(r, 50));
    } catch {
      failed++; // player blocked bot or account deleted
    }
  }

  await ctx.reply(
    `*BROADCAST COMPLETE*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed} (blocked/deleted)`,
    { parse_mode: 'Markdown' },
  );
});

bot.callbackQuery('leaderboard', async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleLeaderboard(ctx);
});

bot.callbackQuery('help', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    '*MEYARET — Commands*\n\n' +
    '/start — Open the game\n' +
    '/play — Quick launch\n' +
    '/leaderboard — Top 5 pilots\n' +
    '/help — This message',
    { parse_mode: 'Markdown' },
  );
});

bot.command('play', async (ctx) => {
  await ctx.reply('Ready for launch.', {
    reply_markup: {
      inline_keyboard: [[{ text: 'PLAY MEYARET', web_app: { url: GAME_URL } }]],
    },
  });
});

bot.command('leaderboard', async (ctx) => { await handleLeaderboard(ctx); });

async function handleLeaderboard(ctx) {
  try {
    // Use localhost to avoid cold-start / network timeouts when bot calls own API
    const base = `http://127.0.0.1:${PORT}`;
    const response = await fetch(`${base}/api/scores/leaderboard`);
    const { leaderboard } = await response.json();

    if (!leaderboard || !leaderboard.length) {
      return ctx.reply('No scores yet — be the first to play! /play');
    }

    const medals = ['1.', '2.', '3.', '4.', '5.'];
    const lines  = leaderboard.map((e, i) =>
      `${medals[i]} *${e.nickname}*  —  ${Number(e.best_score).toLocaleString()} pts`,
    );

    await ctx.reply(
      `*MEYARET — TOP 5 PILOTS*\n\n${lines.join('\n')}\n\n_Live_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: 'Play Now', web_app: { url: GAME_URL } }]],
        },
      },
    );
  } catch (e) {
    console.error('[leaderboard]', e.message);
    await ctx.reply('Could not fetch leaderboard. Try again later.');
  }
}

bot.command('help', (ctx) =>
  ctx.reply(
    '*MEYARET — Commands*\n\n' +
    '/start — Open the game\n' +
    '/play — Quick launch\n' +
    '/leaderboard — Top 5 pilots\n' +
    '/help — This message',
    { parse_mode: 'Markdown' },
  ),
);

// ── Admin Tools ───────────────────────────────────────────────────────────────
// Admin ID must be set as ADMIN_TELEGRAM_ID environment variable in Railway.
const ADMIN_ID = Number(process.env.ADMIN_TELEGRAM_ID || 0);
if (!ADMIN_ID) console.warn('[bot] ADMIN_TELEGRAM_ID not set — admin tools will be inaccessible');

/** Admin multi-step flows (promo, set score, gift, …) */
const _adminState = {};

// /ping — returns your own Telegram ID only (does not reveal admin identity)
bot.command('ping', async (ctx) => {
  const id   = ctx.from?.id;
  const name = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name;
  await ctx.reply(
    `*PONG*\n\nYour Telegram ID: \`${id}\`\nName: ${name}`,
    { parse_mode: 'Markdown' },
  );
});

function adminToolsKeyboard() {
  const keyboard = [];
  if (GAME_URL) keyboard.push([{ text: '🎮 OPEN GAME', web_app: { url: GAME_URL } }]);
  keyboard.push([{ text: '🎁 GIFT SHMIPS', callback_data: 'tools_gift' }]);
  keyboard.push([{ text: '🏆 SET SCORE', callback_data: 'tools_setscore' }]);
  keyboard.push([{ text: '🔄 RESET PLAYER', callback_data: 'tools_reset' }]);
  keyboard.push([{ text: '📣 ANNOUNCE', callback_data: 'tools_announce' }]);
  keyboard.push([{ text: '📨 PROMO MESSAGE', callback_data: 'tools_promo' }]);
  keyboard.push([{ text: '🏆 RUN WEEKLY PAYOUT', callback_data: 'tools_weekly_payout' }]);
  return keyboard;
}

bot.command('tools', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.reply('Access denied.');
  try {
    await ctx.reply('*MEYARET — ADMIN TOOLS*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: adminToolsKeyboard() },
    });
  } catch (e) {
    console.error('[/tools]', e.message);
    await ctx.reply('Error: ' + e.message);
  }
});

// ── SET SCORE flow ────────────────────────────────────────────────────────────
bot.callbackQuery('tools_setscore', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery();
  if (!supabase) return ctx.editMessageText('DB not connected.');

  const { data: users } = await supabase
    .from('users')
    .select('telegram_id, nickname, best_score')
    .order('best_score', { ascending: false });

  if (!users?.length) return ctx.editMessageText('No players found.');

  const keyboard = [];
  for (let i = 0; i < Math.min(users.length, 40); i += 2) {
    const row = [];
    for (const u of users.slice(i, i + 2)) {
      row.push({ text: `${u.nickname} (${Number(u.best_score).toLocaleString()})`, callback_data: `ss_pick_${u.telegram_id}` });
    }
    keyboard.push(row);
  }
  keyboard.push([{ text: 'BACK', callback_data: 'tools_back' }]);

  const list = users.slice(0, 40).map((u, i) =>
    `${i + 1}. *${u.nickname}* — ${Number(u.best_score).toLocaleString()}`
  ).join('\n');

  await ctx.editMessageText(
    `*ADMIN — SET SCORE*\n\nPick a player to update:\n\n${list}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } },
  );
});

bot.callbackQuery(/^ss_pick_(\d+)$/, async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery();
  const targetId = ctx.match[1];

  const { data: rows } = await supabase.from('users').select('nickname, best_score').eq('telegram_id', targetId).single();
  if (!rows) return ctx.editMessageText('Player not found.');

  _adminState[ADMIN_ID] = { step: 'awaiting_setscore', targetId, nickname: rows.nickname };

  await ctx.editMessageText(
    `*SET SCORE — ${rows.nickname}*\n\nCurrent best: *${Number(rows.best_score).toLocaleString()}*\n\nType the new score as a number:`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'CANCEL', callback_data: 'tools_back' }]] } },
  );
});

bot.callbackQuery('tools_gift', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageText(
      '*ADMIN — GIFT SHMIPS*\n\nHow many shmips do you want to send?',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '50 Shmips',  callback_data: 'gamt_50'  },
              { text: '250 Shmips', callback_data: 'gamt_250' },
            ],
            [{ text: 'BACK', callback_data: 'tools_back' }],
          ],
        },
      },
    );
  } catch (e) { console.error('[tools_gift]', e.message); }
});

// ── Admin Gift Command ─────────────────────────────────────────────────────────

// Build the player-list message + keyboard for a given amount
async function buildGiftScreen(amount, note = '') {
  const { data: users, error } = await supabase
    .from('users')
    .select('telegram_id, nickname, shmips')
    .order('nickname');
  if (error) throw error;
  if (!users?.length) return null;

  const shown = users.slice(0, 50);

  const keyboard = [
    [{ text: `GIFT ALL ${users.length} PILOTS  (+${amount} shmips)`, callback_data: `gall_${amount}` }],
  ];
  for (let i = 0; i < shown.length; i += 2) {
    const row = [];
    for (const u of shown.slice(i, i + 2)) {
      row.push({ text: `${u.nickname} (${Number(u.shmips).toFixed(0)}$$)`, callback_data: `g1_${amount}_${u.telegram_id}` });
    }
    keyboard.push(row);
  }
  keyboard.push([
    { text: 'CHANGE AMOUNT', callback_data: 'gift_pick' },
    { text: 'CANCEL',        callback_data: 'gift_cancel' },
  ]);

  const list = shown.map((u, i) =>
    `${i + 1}. *${u.nickname}* — ${Number(u.shmips).toFixed(0)} $$`
  ).join('\n');

  const extra = users.length > 50 ? `\n_(+ ${users.length - 50} more)_` : '';
  const footer = note ? `\n\n_${note}_` : '';
  const text = `*ADMIN — GIFT ${amount} SHMIPS*\n\n${list}${extra}${footer}\n\nTap a pilot or gift everyone:`;

  return { text, keyboard, users };
}

// Step 1 — /gift → pick amount (also reachable from /tools)
bot.command('gift', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.reply('Access denied.');
  if (!supabase) return ctx.reply('DB not connected.');

  await ctx.reply(
    '*ADMIN — GIFT SHMIPS*\n\nHow many shmips do you want to send?',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '50 Shmips',  callback_data: 'gamt_50'  },
            { text: '250 Shmips', callback_data: 'gamt_250' },
          ],
          [{ text: 'CANCEL', callback_data: 'gift_cancel' }],
        ],
      },
    },
  );
});

// Step 2 — amount chosen → show player list
bot.callbackQuery(/^gamt_(\d+)$/, async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  const amount = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  if (!supabase) return ctx.editMessageText('DB not connected.');

  try {
    const screen = await buildGiftScreen(amount);
    if (!screen) return ctx.editMessageText('No players registered yet.');
    await ctx.editMessageText(screen.text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: screen.keyboard } });
  } catch (e) {
    console.error('[gamt]', e.message);
    await ctx.editMessageText('Error: ' + e.message);
  }
});

// "Change amount" — go back to amount picker
bot.callbackQuery('gift_pick', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    '*ADMIN — GIFT SHMIPS*\n\nHow many shmips do you want to send?',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '50 Shmips',  callback_data: 'gamt_50'  },
            { text: '250 Shmips', callback_data: 'gamt_250' },
          ],
          [{ text: 'BACK', callback_data: 'tools_back' }],
        ],
      },
    },
  );
});

// Gift ALL players
bot.callbackQuery(/^gall_(\d+)$/, async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  const amount = Number(ctx.match[1]);
  await ctx.answerCallbackQuery('Sending gifts...');
  if (!supabase) return ctx.editMessageText('DB not connected.');

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('telegram_id, shmips, nickname');
    if (error) throw error;
    if (!users?.length) return ctx.editMessageText('No players to gift.');

    let gifted = 0;
    for (const u of users) {
      const { error: upErr } = await supabase
        .from('users')
        .update({ shmips: Math.round((Number(u.shmips) + amount) * 100) / 100 })
        .eq('telegram_id', u.telegram_id);
      if (!upErr) {
        gifted++;
        // Notify each player
        try {
          await bot.api.sendMessage(
            u.telegram_id,
            `🎁 *YOU GOT A GIFT!*\n\n+${amount} shmips added to your account.\n\n_Reload the game to receive your shmips!_`,
            { parse_mode: 'Markdown' },
          );
        } catch { /* player may have blocked bot */ }
      }
    }

    await ctx.editMessageText(
      `*GIFT COMPLETE!*\n\n${amount} shmips sent to ${gifted} pilots.`,
      { parse_mode: 'Markdown' },
    );
  } catch (e) {
    console.error('[gall]', e.message);
    await ctx.editMessageText('Failed: ' + e.message);
  }
});

// Gift ONE player  — callback_data: g1_<amount>_<telegram_id>
bot.callbackQuery(/^g1_(\d+)_(.+)$/, async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  const amount   = Number(ctx.match[1]);
  const targetId = ctx.match[2];
  if (!supabase) return ctx.answerCallbackQuery('DB not connected.');

  try {
    const { data: rows } = await supabase
      .from('users')
      .select('shmips, nickname')
      .eq('telegram_id', targetId);
    const user = rows?.[0];
    if (!user) return ctx.answerCallbackQuery('Player not found.');

    await supabase
      .from('users')
      .update({ shmips: Math.round((Number(user.shmips) + amount) * 100) / 100 })
      .eq('telegram_id', targetId);

    // Notify the recipient
    try {
      await bot.api.sendMessage(
        targetId,
        `🎁 *YOU GOT A GIFT!*\n\n+${amount} shmips added to your account.\n\n_Reload the game to receive your shmips!_`,
        { parse_mode: 'Markdown' },
      );
    } catch { /* player may have blocked bot */ }

    await ctx.answerCallbackQuery(`Gifted ${amount} shmips to ${user.nickname}!`);

    // Refresh the list with updated balances
    try {
      const screen = await buildGiftScreen(amount, `Gifted ${amount} to ${user.nickname}`);
      if (screen) {
        await ctx.editMessageText(screen.text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: screen.keyboard } });
      }
    } catch { /* message may be unchanged */ }
  } catch (e) {
    console.error('[g1]', e.message);
    await ctx.answerCallbackQuery('Failed: ' + e.message);
  }
});

// Cancel — return to tools menu
bot.callbackQuery('gift_cancel', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery('Cancelled.');
  try {
    await ctx.editMessageText('*MEYARET — ADMIN TOOLS*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: adminToolsKeyboard() },
    });
  } catch (e) { console.error('[gift_cancel]', e.message); }
});

// ── RESET PLAYER ──────────────────────────────────────────────────────────────

// Step 1 — show player list to pick who to reset
bot.callbackQuery('tools_reset', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery();
  if (!supabase) return ctx.editMessageText('DB not connected.');

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('telegram_id, nickname, shmips')
      .order('nickname', { ascending: true })
      .limit(50);
    if (error) throw error;
    if (!users?.length) return ctx.editMessageText('No players found.');

    const keyboard = users.map(u => ([{
      text: `${u.nickname}  (${Math.round(u.shmips)}$$)`,
      callback_data: `reset_pick_${u.telegram_id}`,
    }]));
    keyboard.push([{ text: '« BACK', callback_data: 'tools_back' }]);

    await ctx.editMessageText(
      '*RESET PLAYER*\n\nChoose a player to reset\\. This will clear their upgrades, skins, jets and shmips\\. High scores are kept\\.',
      { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: keyboard } },
    );
  } catch (e) {
    console.error('[tools_reset]', e.message);
    await ctx.editMessageText('Error: ' + e.message);
  }
});

// Step 2 — confirm screen for chosen player
bot.callbackQuery(/^reset_pick_(.+)$/, async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery();
  const targetId = ctx.match[1];

  const { data: rows } = await supabase
    .from('users')
    .select('nickname, shmips, best_score')
    .eq('telegram_id', targetId)
    .limit(1);
  const u = rows?.[0];
  if (!u) return ctx.editMessageText('Player not found.');

  await ctx.editMessageText(
    `*RESET: ${u.nickname}*\n\nShmips: ${Math.round(u.shmips)}$$\nBest score: ${u.best_score?.toLocaleString()}\n\n⚠️ This will wipe all upgrades, skins, jets and shmips\\. High scores stay\\.`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ CONFIRM RESET', callback_data: `reset_confirm_${targetId}` }],
          [{ text: '« BACK', callback_data: 'tools_reset' }],
        ],
      },
    },
  );
});

// Step 3 — execute reset
bot.callbackQuery(/^reset_confirm_(.+)$/, async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery('Resetting...');
  const targetId = ctx.match[1];

  try {
    // Wipe upgrades
    await supabase.from('user_upgrades').delete().eq('telegram_id', targetId);
    // Zero shmips and clear gift cooldown
    await supabase.from('users')
      .update({ shmips: 0, last_spin_at: null })
      .eq('telegram_id', targetId);

    const { data: rows } = await supabase
      .from('users').select('nickname').eq('telegram_id', targetId).limit(1);
    const nick = rows?.[0]?.nickname || targetId;

    // Notify the player
    try {
      await bot.api.sendMessage(
        targetId,
        `🔄 *Your account has been reset by the admin.*\n\nUpgrades, skins and shmips have been cleared\\. Your scores are safe\\. Reload the game to continue\\.`,
        { parse_mode: 'MarkdownV2' },
      );
    } catch { /* blocked */ }

    await ctx.editMessageText(
      `*RESET COMPLETE*\n\n${nick}'s upgrades and shmips have been cleared\\.\n\nWant to send them some starter shmips?`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: [
          [
            { text: '50$$',  callback_data: `rgift_50_${targetId}`  },
            { text: '100$$', callback_data: `rgift_100_${targetId}` },
            { text: '250$$', callback_data: `rgift_250_${targetId}` },
          ],
          [{ text: '✏️ CUSTOM AMOUNT', callback_data: `rgift_custom_${targetId}` }],
          [{ text: '« BACK TO TOOLS',  callback_data: 'tools_back' }],
        ]},
      },
    );
  } catch (e) {
    console.error('[reset_confirm]', e.message);
    await ctx.editMessageText('Reset failed: ' + e.message);
  }
});

// Post-reset quick gift (preset amounts)
bot.callbackQuery(/^rgift_(\d+)_(.+)$/, async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  const amount   = Number(ctx.match[1]);
  const targetId = ctx.match[2];
  await ctx.answerCallbackQuery(`Sending ${amount}$$...`);

  try {
    const { data: rows } = await supabase.from('users').select('nickname, shmips').eq('telegram_id', targetId).limit(1);
    const u = rows?.[0];
    if (!u) return ctx.editMessageText('Player not found.');

    await supabase.from('users')
      .update({ shmips: Math.round((Number(u.shmips) + amount) * 100) / 100 })
      .eq('telegram_id', targetId);

    try {
      await bot.api.sendMessage(targetId,
        `🎁 *YOU GOT A GIFT!*\n\n+${amount} shmips added to your account\\.\n\n_Reload the game to receive your shmips\\!_`,
        { parse_mode: 'MarkdownV2' });
    } catch { /* blocked */ }

    await ctx.editMessageText(
      `*DONE!*\n\n${amount}$$ sent to ${u.nickname}\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: [[{ text: '« BACK TO TOOLS', callback_data: 'tools_back' }]] } },
    );
  } catch (e) {
    console.error('[rgift]', e.message);
    await ctx.answerCallbackQuery('Failed: ' + e.message);
  }
});

// Post-reset custom amount — ask admin to type it
bot.callbackQuery(/^rgift_custom_(.+)$/, async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery();
  const targetId = ctx.match[1];
  _adminState[ADMIN_ID] = { step: 'awaiting_rgift_amount', targetId };
  try {
    await ctx.editMessageText(
      '*CUSTOM GIFT*\n\nType the amount of shmips to send\\:',
      { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: [[{ text: '« CANCEL', callback_data: 'tools_back' }]] } },
    );
  } catch { /* ignore */ }
});

// All text messages — admin flows or fallback for everyone
bot.on('message:text', async (ctx) => {
  const isAdmin = ctx.from?.id === ADMIN_ID;
  const state = isAdmin ? _adminState[ADMIN_ID] : null;

  if (state?.step === 'awaiting_setscore') {
    const newScore = Number(ctx.message.text.trim().replace(/,/g, ''));
    if (!newScore || newScore <= 0 || !Number.isInteger(newScore)) {
      return ctx.reply('Please enter a valid whole number (e.g. 600900).');
    }
    const { targetId, nickname } = state;
    delete _adminState[ADMIN_ID];

    try {
      // Update best_score on users table
      await supabase.from('users')
        .update({ best_score: newScore })
        .eq('telegram_id', targetId);

      // Insert a score record so the leaderboard view picks it up
      await supabase.from('scores').insert({
        telegram_id: Number(targetId),
        score: newScore,
        shmips_earned: Math.round(newScore / 1000 * 100) / 100,
      });

      await ctx.reply(`✅ Score for *${nickname}* set to *${newScore.toLocaleString()}*`, { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.reply('Failed: ' + e.message);
    }
    return;
  }

  if (state?.step === 'awaiting_rgift_amount') {
    const amount = Number(ctx.message.text.trim());
    if (!amount || amount <= 0) return ctx.reply('Please enter a valid number.');
    const targetId = state.targetId;
    delete _adminState[ADMIN_ID];

    try {
      const { data: rows } = await supabase.from('users').select('nickname, shmips').eq('telegram_id', targetId).limit(1);
      const u = rows?.[0];
      if (!u) return ctx.reply('Player not found.');

      await supabase.from('users')
        .update({ shmips: Math.round((Number(u.shmips) + amount) * 100) / 100 })
        .eq('telegram_id', targetId);

      try {
        await bot.api.sendMessage(targetId,
          `🎁 *YOU GOT A GIFT!*\n\n+${amount} shmips added to your account.\n\n_Reload the game to receive your shmips!_`,
          { parse_mode: 'Markdown' });
      } catch { /* blocked */ }

      await ctx.reply(`✅ ${amount}$$ sent to ${u.nickname}!`);
    } catch (e) {
      await ctx.reply('Failed: ' + e.message);
    }
    return;
  }

  // Fallback: non-admin or admin with no active step — always respond so bot never feels "dead"
  if (!state?.step) {
    return ctx.reply(
      '🎮 *MEYARET* — Tap below to play!\n\n/start — Open game\n/leaderboard — Top 5',
      { parse_mode: 'Markdown', reply_markup: GAME_URL ? { inline_keyboard: [[{ text: '🎮 PLAY', web_app: { url: GAME_URL } }]] } : undefined },
    ).catch(() => {});
  }

  // Promo flow (admin only, state.awaiting_promo)
  if (state?.step === 'awaiting_promo') {
    const text = ctx.message.text;
    if (text === '/cancel') {
      delete _adminState[ADMIN_ID];
      return ctx.reply('Promo cancelled. Back to /tools');
    }
    const existingPhoto = state.promoPhotoFileId ?? null;
    _adminState[ADMIN_ID] = { step: 'confirming_promo', promoText: text, promoPhotoFileId: existingPhoto };
    const header = existingPhoto ? '*PREVIEW (photo + caption):*' : '*PREVIEW — this is what all players will receive:*';
    await ctx.reply(
      `${header}\n\n${text}\n\n_Send to all players?_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ SEND TO ALL', callback_data: 'promo_confirm' }],
            [{ text: '❌ CANCEL',      callback_data: 'promo_cancel'  }],
          ],
        },
      },
    );
  }
});

// Admin: promo with image (+ optional caption, or add text later)
bot.on('message:photo', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return;
  const state = _adminState[ADMIN_ID];
  if (state?.step !== 'awaiting_promo') return;
  const photos = ctx.message.photo;
  if (!photos?.length) return;
  const fileId = photos[photos.length - 1].file_id;
  const caption = (ctx.message.caption || '').trim();
  if (caption === '/cancel') {
    delete _adminState[ADMIN_ID];
    return ctx.reply('Promo cancelled. Back to /tools');
  }
  if (caption) {
    _adminState[ADMIN_ID] = { step: 'confirming_promo', promoText: caption, promoPhotoFileId: fileId };
    await ctx.reply(
      `PREVIEW (photo + caption):\n\n${caption}\n\nSend this to all players?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ SEND TO ALL', callback_data: 'promo_confirm' }],
            [{ text: '❌ CANCEL', callback_data: 'promo_cancel' }],
          ],
        },
      },
    );
  } else {
    _adminState[ADMIN_ID] = { step: 'awaiting_promo', promoPhotoFileId: fileId };
    await ctx.reply('Photo saved. Now send the text for this promo (or /cancel to abort).');
  }
});

// Back to tools menu (shared)
bot.callbackQuery('tools_back', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageText('*MEYARET — ADMIN TOOLS*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: adminToolsKeyboard() },
    });
  } catch (e) { console.error('[tools_back]', e.message); }
});

// ── RUN WEEKLY PAYOUT (manual reset) ───────────────────────────────────────────
bot.callbackQuery('tools_weekly_payout', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery('Running payout...');
  try {
    await runWeeklyPayout(bot);
    await ctx.editMessageText(
      '*WEEKLY PAYOUT DONE*\n\nTop 3 from last week have been paid 6,500 $$ each. Weekly Top 3 display will show the new week.',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '« BACK', callback_data: 'tools_back' }]] } },
    );
  } catch (e) {
    console.error('[tools_weekly_payout]', e);
    await ctx.editMessageText('Error: ' + e.message, { reply_markup: { inline_keyboard: [[{ text: '« BACK', callback_data: 'tools_back' }]] } });
  }
});

// ── ANNOUNCE ──────────────────────────────────────────────────────────────────

bot.callbackQuery('tools_announce', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery('Broadcasting...');
  if (!supabase) return ctx.editMessageText('DB not connected.');

  const { data: users, error } = await supabase.from('users').select('telegram_id');
  if (error || !users?.length) return ctx.editMessageText('No users found.');

  let sent = 0, failed = 0;
  for (const u of users) {
    try {
      await bot.api.sendMessage(u.telegram_id, WELCOME_MSG, {
        parse_mode: 'Markdown',
        reply_markup: WELCOME_KEYBOARD,
      });
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch { failed++; }
  }

  try {
    await ctx.editMessageText(
      `*ANNOUNCE COMPLETE*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed} (blocked/deleted)`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '« BACK', callback_data: 'tools_back' }]] } },
    );
  } catch { /* ignore edit errors */ }
});

// ── PROMO MESSAGE ─────────────────────────────────────────────────────────────

bot.callbackQuery('tools_promo', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  await ctx.answerCallbackQuery();
  _adminState[ADMIN_ID] = { step: 'awaiting_promo' };
  try {
    await ctx.editMessageText(
      'PROMO MESSAGE\n\nSend text, or a photo (with caption), or a photo first — then send the text separately. I\'ll show a preview before broadcasting.\n\nSend /cancel to abort.',
      { reply_markup: { inline_keyboard: [[{ text: '« BACK', callback_data: 'tools_back_promo' }]] } },
    );
  } catch { /* ignore */ }
});

// Cancel promo from back button
bot.callbackQuery('tools_back_promo', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  delete _adminState[ADMIN_ID];
  await ctx.answerCallbackQuery('Cancelled.');
  try {
    await ctx.editMessageText('*MEYARET — ADMIN TOOLS*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: adminToolsKeyboard() },
    });
  } catch { /* ignore */ }
});

// Confirm promo — send to all (text and/or photo)
bot.callbackQuery('promo_confirm', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  const st = _adminState[ADMIN_ID];
  const promoText = st?.promoText ?? '';
  const promoPhotoFileId = st?.promoPhotoFileId;
  if (!promoText && !promoPhotoFileId) return ctx.answerCallbackQuery('Nothing to send.');
  await ctx.answerCallbackQuery('Sending promo...');
  delete _adminState[ADMIN_ID];

  const { data: users } = await supabase.from('users').select('telegram_id');
  let sent = 0, failed = 0;
  for (const u of (users || [])) {
    try {
      if (promoPhotoFileId) {
        await bot.api.sendPhoto(u.telegram_id, promoPhotoFileId, {
          caption: promoText || undefined,
        });
      } else {
        await bot.api.sendMessage(u.telegram_id, promoText, { parse_mode: 'Markdown' });
      }
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch { failed++; }
  }

  try {
    await ctx.editMessageText(
      `*PROMO SENT*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '« BACK', callback_data: 'tools_back' }]] } },
    );
  } catch { /* ignore */ }
});

// Cancel promo from confirm screen
bot.callbackQuery('promo_cancel', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  delete _adminState[ADMIN_ID];
  await ctx.answerCallbackQuery('Cancelled.');
  try {
    await ctx.editMessageText('*MEYARET — ADMIN TOOLS*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: adminToolsKeyboard() },
    });
  } catch { /* ignore */ }
});

// Catch-all for unmatched callbacks (stale buttons) — clear loading state
bot.on('callback_query', async (ctx) => ctx.answerCallbackQuery().catch(() => {}));

// ── Start ─────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
  const WEBHOOK_BASE = (process.env.WEBHOOK_URL || '').trim();
  const webhookPath  = `/bot${BOT_TOKEN}`;
  console.warn(
    '[bot] Webhook mode: Telegram allows ONE webhook per BOT_TOKEN. If another service uses the same token with WEBHOOK_URL, this deploy will steal updates from that service. See docs/DEPLOY.md'
  );
  app.use(webhookPath, webhookCallback(bot, 'express'));

  app.listen(PORT, async () => {
    console.log(`[server] Listening on port ${PORT}`);
    console.log(`[server] Public dir: ${PUBLIC_DIR}`);
    const fullUrl = `${WEBHOOK_BASE}${webhookPath}`;

    // Retry setWebhook up to 5 times to handle 429 during rolling deploys
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const info = await bot.api.getWebhookInfo();
        if (info.url === fullUrl) {
          console.log('[bot] Webhook already set →', fullUrl);
          break;
        }
        await bot.api.setWebhook(fullUrl);
        console.log('[bot] Webhook set →', fullUrl);
        break;
      } catch (err) {
        const msg = err?.description || err?.message || String(err);
        const retryAfter = err?.parameters?.retry_after ?? attempt * 2;
        if (attempt < 5) {
          console.warn(`[bot] setWebhook attempt ${attempt} failed (${msg}), retrying in ${retryAfter}s…`);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
        } else {
          console.error('[bot] setWebhook failed after 5 attempts:', msg);
        }
      }
    }

    await setMenuButton();
    scheduleWeeklyPayout(bot);
  });
} else {
  app.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT}`);
    console.log(`[server] Public dir: ${PUBLIC_DIR}`);
  });
  bot.start({
    onStart: () => {
      setMenuButton();
      scheduleWeeklyPayout(bot);
    },
  }).catch(console.error);
}

export default app;
