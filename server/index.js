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
// Trust Railway's reverse proxy so express-rate-limit can read X-Forwarded-For
app.set('trust proxy', 1);
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

// ── Admin Tools ───────────────────────────────────────────────────────────────
// Use env var ADMIN_TELEGRAM_ID if set, otherwise fall back to hardcoded value
const ADMIN_ID = Number(process.env.ADMIN_TELEGRAM_ID || 1357754255);

// /ping — public debug command: replies with your Telegram ID so you can verify
bot.command('ping', async (ctx) => {
  const id   = ctx.from?.id;
  const name = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name;
  await ctx.reply(
    `*PONG*\n\nYour Telegram ID: \`${id}\`\nName: ${name}\nAdmin ID configured: \`${ADMIN_ID}\`\nMatch: ${id === ADMIN_ID ? 'YES — you are admin' : 'NO'}`,
    { parse_mode: 'Markdown' },
  );
});

function adminToolsKeyboard() {
  const keyboard = [];
  if (GAME_URL) keyboard.push([{ text: 'OPEN GAME', web_app: { url: GAME_URL } }]);
  keyboard.push([{ text: 'GIFT SHMIPS', callback_data: 'tools_gift' }]);
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

// ── Admin Gift Command ─────────────────────────────────────────────────────────

// Build the player-list message + keyboard for a given amount
async function buildGiftScreen(amount, note = '') {
  const { data: users, error } = await supabase
    .from('users')
    .select('telegram_id, nickname, tele_name, shmips')
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
      const label = u.tele_name ? `${u.tele_name} / ${u.nickname}` : u.nickname;
      row.push({ text: `${label} (${Number(u.shmips).toFixed(0)}$$)`, callback_data: `g1_${amount}_${u.telegram_id}` });
    }
    keyboard.push(row);
  }
  keyboard.push([
    { text: 'CHANGE AMOUNT', callback_data: 'gift_pick' },
    { text: 'CANCEL',        callback_data: 'gift_cancel' },
  ]);

  const list = shown.map((u, i) => {
    const tele = u.tele_name ? ` _(${u.tele_name})_` : '';
    return `${i + 1}. *${u.nickname}*${tele} — ${Number(u.shmips).toFixed(0)} $$`;
  }).join('\n');

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
        try {
          await bot.api.sendMessage(
            u.telegram_id,
            `You received *${amount} Shmips* from the admin!\n\nOpen the game to spend them.`,
            { parse_mode: 'Markdown' },
          );
        } catch { /* player may have blocked the bot */ }
      }
    }

    await ctx.editMessageText(
      `*GIFT COMPLETE!*\n\n${amount} shmips sent to ${gifted} pilots.\nThey've been notified.`,
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

    try {
      await bot.api.sendMessage(
        Number(targetId),
        `You received *${amount} Shmips* from the admin!\n\nOpen the game to spend them.`,
        { parse_mode: 'Markdown' },
      );
    } catch { /* player may have blocked the bot */ }

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
