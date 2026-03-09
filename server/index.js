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

// /start command — sends a button to open the Mini App
bot.command('start', async (ctx) => {
  await ctx.reply(
    '🚀 Welcome to *MEYARET*\n\n80s Synthwave · Space Combat · Asteroid Survival\n\nHit Launch to enter the arena.',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🎮 Launch MEYARET',
            web_app: { url: process.env.MINI_APP_URL },
          },
        ]],
      },
    },
  );
});

bot.command('leaderboard', async (ctx) => {
  try {
    const response = await fetch(`http://localhost:${PORT}/api/scores/leaderboard`);
    const { leaderboard } = await response.json();

    if (!leaderboard.length) {
      return ctx.reply('No scores yet. Be the first to play!');
    }

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const lines  = leaderboard.map((e, i) =>
      `${medals[i]} *${e.nickname}* — ${e.best_score.toLocaleString()} pts`,
    );

    await ctx.reply(`🏆 *MEYARET TOP 5*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
  } catch {
    await ctx.reply('Could not fetch leaderboard. Try again later.');
  }
});

bot.command('help', (ctx) =>
  ctx.reply(
    '📡 *MEYARET Commands*\n\n' +
    '/start — Launch the game\n' +
    '/leaderboard — Top 5 players\n' +
    '/help — This message',
    { parse_mode: 'Markdown' },
  ),
);

// ── Start: webhook (production) or long-polling (dev) ─────────────────────────
if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
  // Railway / production — use webhook
  const webhookPath = `/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  app.use(webhookPath, webhookCallback(bot, 'express'));

  bot.api.setWebhook(`${process.env.WEBHOOK_URL}${webhookPath}`).then(() => {
    console.log('[bot] Webhook set to', process.env.WEBHOOK_URL);
  });

  app.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));
} else {
  // Local dev — long-polling + HTTP server
  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
    console.log(`[server] Serving Mini App at http://localhost:${PORT}/`);
  });
  bot.start().catch(console.error);
  console.log('[bot] Polling started (dev mode)');
}

export default app;
