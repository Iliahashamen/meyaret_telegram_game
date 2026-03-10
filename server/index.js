import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { Bot, webhookCallback } from 'grammy';

import { usersRouter }  from './routes/users.js';
import { scoresRouter } from './routes/scores.js';
import { spinRouter }   from './routes/spin.js';
import { storeRouter }  from './routes/store.js';
import { supabase }     from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & Middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
// CORS: allow GitHub Pages, Telegram WebView, and localhost.
// Security is enforced by HMAC initData validation in auth.js, not origin.
app.use(cors({
  origin: (origin, cb) => cb(null, true),   // allow all origins
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data'],
  credentials: false,
}));
app.options('*', cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Static Files ──────────────────────────────────────────────────────────────
console.log('[server] Serving static from:', PUBLIC_DIR);
app.use(express.static(PUBLIC_DIR));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/users',  usersRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/spin',   spinRouter);
app.use('/api/store',  storeRouter);

// ── Health Check — always responds even if DB is down ─────────────────────────
app.get('/health', (_req, res) => {
  const missing = [];
  if (!process.env.SUPABASE_URL)              missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.TELEGRAM_BOT_TOKEN)        missing.push('TELEGRAM_BOT_TOKEN');
  res.json({
    ok: missing.length === 0,
    ts: new Date().toISOString(),
    missing: missing.length ? missing : undefined,
  });
});

// ── Fallback: serve index.html for all non-API routes ─────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/bot')) return res.status(404).end();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Telegram Bot Setup ────────────────────────────────────────────────────────
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

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

// /start — welcome + play button
bot.command('start', async (ctx) => {
  const name = ctx.from?.first_name || 'Pilot';
  await ctx.reply(
    `*MEYARET*\n\n` +
    `Welcome, ${name}.\n\n` +
    `80s Synthwave · Asteroid Combat · Shmips Economy\n\n` +
    `Choose your Call Sign, survive the debris field, earn Shmips.\n` +
    `Daily Spin resets every 21 hours.\n\n` +
    `Tap the button below or the PLAY button in your chat bar.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'ENTER THE ARENA', web_app: { url: GAME_URL } }],
          [
            { text: 'Leaderboard', callback_data: 'leaderboard' },
            { text: 'Help',        callback_data: 'help'        },
          ],
        ],
      },
    },
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
    const base = process.env.NODE_ENV === 'production'
      ? `${process.env.WEBHOOK_URL}`
      : `http://localhost:${PORT}`;
    const response  = await fetch(`${base}/api/scores/leaderboard`);
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

// ── Admin Gift Command ─────────────────────────────────────────────────────────
const ADMIN_ID    = 1357754255;
const GIFT_AMOUNT = 250;

bot.command('gift', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.reply('Access denied.');
  if (!supabase) return ctx.reply('DB not connected.');

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('telegram_id, nickname, tele_name, shmips')
      .order('nickname');
    if (error) throw error;
    if (!users?.length) return ctx.reply('No players registered yet.');

    // Build inline keyboard: GIFT ALL + one button per player (max 50)
    const shown = users.slice(0, 50);
    const keyboard = [
      [{ text: `GIFT ALL ${users.length} PILOTS (+${GIFT_AMOUNT} shmips)`, callback_data: 'gift_all' }],
    ];
    for (let i = 0; i < shown.length; i += 2) {
      const row = [];
      const a = shown[i];
      const aLabel = a.tele_name ? `${a.tele_name} / ${a.nickname}` : a.nickname;
      row.push({ text: `${aLabel} (${Number(a.shmips).toFixed(0)}$$)`, callback_data: `gift1_${a.telegram_id}` });
      if (shown[i + 1]) {
        const b = shown[i + 1];
        const bLabel = b.tele_name ? `${b.tele_name} / ${b.nickname}` : b.nickname;
        row.push({ text: `${bLabel} (${Number(b.shmips).toFixed(0)}$$)`, callback_data: `gift1_${b.telegram_id}` });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: 'CANCEL', callback_data: 'gift_cancel' }]);

    const list = shown.map((u, i) => {
      const tele = u.tele_name ? ` _(${u.tele_name})_` : '';
      return `${i + 1}. *${u.nickname}*${tele} — ${Number(u.shmips).toFixed(0)} $$`;
    }).join('\n');
    await ctx.reply(
      `*ADMIN — GIFT ${GIFT_AMOUNT} SHMIPS*\n\n${list}${users.length > 50 ? `\n_(+ ${users.length - 50} more)_` : ''}\n\nTap a pilot to gift them, or gift everyone:`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } },
    );
  } catch (e) {
    console.error('[gift cmd]', e.message);
    await ctx.reply('Error: ' + e.message);
  }
});

// Gift ALL players
bot.callbackQuery('gift_all', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
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
        .update({ shmips: Math.round((Number(u.shmips) + GIFT_AMOUNT) * 100) / 100 })
        .eq('telegram_id', u.telegram_id);
      if (!upErr) {
        gifted++;
        // Notify each player via bot message
        try {
          await bot.api.sendMessage(
            u.telegram_id,
            `You received *${GIFT_AMOUNT} Shmips* from the admin!\n\nOpen the game to spend them.`,
            { parse_mode: 'Markdown' },
          );
        } catch { /* user may have blocked the bot */ }
      }
    }

    await ctx.editMessageText(
      `*GIFT COMPLETE!*\n\n${GIFT_AMOUNT} shmips sent to ${gifted} pilots.\nThey've been notified.`,
      { parse_mode: 'Markdown' },
    );
  } catch (e) {
    console.error('[gift_all]', e.message);
    await ctx.editMessageText('Failed: ' + e.message);
  }
});

// Gift ONE player
bot.callbackQuery(/^gift1_(.+)$/, async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery('Unauthorized.');
  const targetId = ctx.match[1];
  if (!supabase) return ctx.answerCallbackQuery('DB not connected.');

  try {
    const { data: rows } = await supabase
      .from('users')
      .select('shmips, nickname')
      .eq('telegram_id', targetId);
    const user = rows?.[0];
    if (!user) return ctx.answerCallbackQuery('Player not found.');

    const newShmips = Math.round((Number(user.shmips) + GIFT_AMOUNT) * 100) / 100;
    await supabase.from('users').update({ shmips: newShmips }).eq('telegram_id', targetId);

    // Notify the player
    try {
      await bot.api.sendMessage(
        Number(targetId),
        `You received *${GIFT_AMOUNT} Shmips* from the admin!\n\nOpen the game to spend them.`,
        { parse_mode: 'Markdown' },
      );
    } catch { /* player may have blocked the bot */ }

    await ctx.answerCallbackQuery(`Gifted ${GIFT_AMOUNT} shmips to ${user.nickname}!`);

    // Refresh the message so balances stay up to date
    const { data: allUsers } = await supabase
      .from('users')
      .select('telegram_id, nickname, tele_name, shmips')
      .order('nickname');
    const shown = (allUsers || []).slice(0, 50);
    const list  = shown.map((u, i) => {
      const tele = u.tele_name ? ` _(${u.tele_name})_` : '';
      return `${i + 1}. *${u.nickname}*${tele} — ${Number(u.shmips).toFixed(0)} $$`;
    }).join('\n');
    const keyboard = [
      [{ text: `GIFT ALL ${(allUsers||[]).length} PILOTS (+${GIFT_AMOUNT} shmips)`, callback_data: 'gift_all' }],
    ];
    for (let i = 0; i < shown.length; i += 2) {
      const row = [];
      const a = shown[i];
      const aLabel = a.tele_name ? `${a.tele_name} / ${a.nickname}` : a.nickname;
      row.push({ text: `${aLabel} (${Number(a.shmips).toFixed(0)}$$)`, callback_data: `gift1_${a.telegram_id}` });
      if (shown[i + 1]) {
        const b = shown[i + 1];
        const bLabel = b.tele_name ? `${b.tele_name} / ${b.nickname}` : b.nickname;
        row.push({ text: `${bLabel} (${Number(b.shmips).toFixed(0)}$$)`, callback_data: `gift1_${b.telegram_id}` });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: 'CANCEL', callback_data: 'gift_cancel' }]);
    try {
      await ctx.editMessageText(
        `*ADMIN — GIFT ${GIFT_AMOUNT} SHMIPS*\n\n${list}\n\n_Gifted ${GIFT_AMOUNT} to ${user.nickname}_\n\nTap a pilot to gift them, or gift everyone:`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } },
      );
    } catch { /* message unchanged, that's fine */ }
  } catch (e) {
    console.error('[gift1]', e.message);
    await ctx.answerCallbackQuery('Failed: ' + e.message);
  }
});

// Cancel
bot.callbackQuery('gift_cancel', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery('Cancelled.');
  await ctx.editMessageText('Gift cancelled.');
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
  const webhookPath = `/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  app.use(webhookPath, webhookCallback(bot, 'express'));

  app.listen(PORT, async () => {
    console.log(`[server] Listening on port ${PORT}`);
    console.log(`[server] Public dir: ${PUBLIC_DIR}`);
    await bot.api.setWebhook(`${process.env.WEBHOOK_URL}${webhookPath}`);
    console.log('[bot] Webhook set');
    await setMenuButton();
  });
} else {
  app.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT}`);
    console.log(`[server] Public dir: ${PUBLIC_DIR}`);
  });
  bot.start({ onStart: () => setMenuButton() }).catch(console.error);
}

export default app;
