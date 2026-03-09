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
