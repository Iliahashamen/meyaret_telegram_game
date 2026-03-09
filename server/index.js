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
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & Middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));   // CSP disabled for game canvas
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Static Files (the Mini App game) ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/users',  usersRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/spin',   spinRouter);
app.use('/api/store',  storeRouter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Telegram Bot Setup ────────────────────────────────────────────────────────
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

const GAME_URL = process.env.MINI_APP_URL || 'https://t.me';

// Persistent menu button (shows as a glowing button in the chat bar)
async function setMenuButton() {
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '🎮 PLAY',
        web_app: { url: GAME_URL },
      },
    });
    console.log('[bot] Menu button set → 🎮 PLAY');
  } catch (e) {
    console.warn('[bot] Could not set menu button:', e.message);
  }
}

// /start — welcome message with large Play button
bot.command('start', async (ctx) => {
  const name = ctx.from?.first_name || 'Pilot';
  await ctx.reply(
    `✦ *MEYARET* ✦\n\n` +
    `Welcome, ${name}.\n\n` +
    `_80s Synthwave · Asteroid Combat · Shmips Economy_\n\n` +
    `Choose your Call Sign, survive the debris field, earn Shmips.\n` +
    `Daily Spin resets every 21 hours.\n\n` +
    `Tap the button below — or the *PLAY* button in your chat bar.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀  ENTER THE ARENA', web_app: { url: GAME_URL } }],
          [
            { text: '🏆 Leaderboard', callback_data: 'leaderboard' },
            { text: '❓ Help',         callback_data: 'help'        },
          ],
        ],
      },
    },
  );
});

// Inline button callbacks (leaderboard + help without needing a new message)
bot.callbackQuery('leaderboard', async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleLeaderboard(ctx);
});

bot.callbackQuery('help', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    '📡 *MEYARET — Commands*\n\n' +
    '/start — Open the game\n' +
    '/play — Quick-launch button\n' +
    '/leaderboard — Top 5 pilots\n' +
    '/help — This message\n\n' +
    '_You can also tap the *PLAY* button in your chat bar at any time._',
    { parse_mode: 'Markdown' },
  );
});

// /play — fastest path to the game (single big button)
bot.command('play', async (ctx) => {
  await ctx.reply('Ready for launch.', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🚀  PLAY MEYARET', web_app: { url: GAME_URL } },
      ]],
    },
  });
});

// /leaderboard command
bot.command('leaderboard', async (ctx) => { await handleLeaderboard(ctx); });

async function handleLeaderboard(ctx) {
  try {
    const response = await fetch(`http://localhost:${PORT}/api/scores/leaderboard`);
    const { leaderboard } = await response.json();

    if (!leaderboard || !leaderboard.length) {
      return ctx.reply('No scores yet — be the first to play! /play');
    }

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const lines  = leaderboard.map((e, i) =>
      `${medals[i]} *${e.nickname}*  —  ${Number(e.best_score).toLocaleString()} pts`,
    );

    await ctx.reply(
      `🏆 *MEYARET — TOP 5 PILOTS*\n\n${lines.join('\n')}\n\n_Updated live_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Play Now', web_app: { url: GAME_URL } },
          ]],
        },
      },
    );
  } catch {
    await ctx.reply('Could not fetch leaderboard. Try again later.');
  }
}

bot.command('help', (ctx) =>
  ctx.reply(
    '📡 *MEYARET — Commands*\n\n' +
    '/start — Open the game\n' +
    '/play — Quick-launch button\n' +
    '/leaderboard — Top 5 pilots\n' +
    '/help — This message\n\n' +
    '_Tap the *PLAY* button in your chat bar anytime._',
    { parse_mode: 'Markdown' },
  ),
);

// ── Start: webhook (production) or long-polling (dev) ─────────────────────────
if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
  // Railway / production — use webhook
  const webhookPath = `/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  app.use(webhookPath, webhookCallback(bot, 'express'));

  app.listen(PORT, async () => {
    console.log(`[server] Listening on port ${PORT}`);
    await bot.api.setWebhook(`${process.env.WEBHOOK_URL}${webhookPath}`);
    console.log('[bot] Webhook set to', process.env.WEBHOOK_URL);
    await setMenuButton();
  });
} else {
  // Local dev — long-polling + HTTP server
  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
    console.log(`[server] Serving Mini App at http://localhost:${PORT}/`);
  });
  bot.start({ onStart: () => setMenuButton() }).catch(console.error);
  console.log('[bot] Polling started (dev mode)');
}

export default app;
