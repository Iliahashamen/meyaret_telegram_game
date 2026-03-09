# MEYARET 🚀
**80s Synthwave Space Combat — Telegram Mini App**

An Asteroids-inspired shooter for Telegram, featuring momentum physics, neon synthwave aesthetics, Shmips economy, daily spin, and a persistent leaderboard.

---

## Full Setup Guide

### Step 1 — Create your Telegram Bot

1. Open Telegram and message **@BotFather**
2. Send `/newbot` and follow the prompts (pick any name and username)
3. Copy the **Bot Token** you receive (looks like `1234567890:AABBcc...`)
4. Send `/mybots` → select your bot → **Bot Settings** → **Menu Button** → **Configure menu button**
   - Set URL to your public app URL (Railway URL, or ngrok for testing)
5. Also run: `/setdomain` → enter your app domain so WebApp buttons work

---

### Step 2 — Create your Supabase Database

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** — choose a name and strong DB password
3. Once created, go to **SQL Editor** in the left sidebar
4. Paste the entire contents of `supabase-schema.sql` and click **Run**
5. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret → `SUPABASE_SERVICE_ROLE_KEY` *(keep this private!)*

---

### Step 3 — Set Up GitHub

```bash
# In the MEYARET folder:
git init
git add .
git commit -m "Initial MEYARET commit"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/meyaret.git
git branch -M main
git push -u origin main
```

---

### Step 4 — Deploy to Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo** → select `meyaret`
3. Railway auto-detects Node.js from `package.json`
4. Go to your service → **Variables** tab → add all variables:

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key |
| `NODE_ENV` | `production` |
| `MINI_APP_URL` | `https://your-app.up.railway.app` (set after first deploy) |
| `WEBHOOK_URL` | Same as MINI_APP_URL |

5. Click **Deploy** — Railway gives you a public URL like `https://meyaret-production.up.railway.app`
6. Go back and update `MINI_APP_URL` and `WEBHOOK_URL` with that URL, then redeploy

---

### Step 5 — Link Mini App to Bot

In BotFather:
```
/mybots → your bot → Bot Settings → Menu Button → Configure
URL: https://your-app.up.railway.app
Text: 🎮 MEYARET
```

Also set the domain:
```
/setdomain → your bot → your-app.up.railway.app
```

---

### Step 6 — Local Development

```bash
# Clone / open the project
cd MEYARET

# Install dependencies
npm install

# Copy and fill in your env file
copy .env.example .env
# (edit .env with your actual values)

# Install ngrok for local HTTPS tunnel (needed for Telegram WebApp)
# Download from https://ngrok.com or: npm install -g ngrok
ngrok http 3000

# In a second terminal, start the server
npm run dev
```

Set `MINI_APP_URL` in `.env` to your ngrok HTTPS URL (e.g. `https://abc123.ngrok.io`).

Open your bot in Telegram and tap the menu button — the game loads in the Mini App!

---

## Project Structure

```
MEYARET/
├── server/
│   ├── index.js              Express server + Telegram Bot (grammy)
│   ├── supabase.js           Supabase client
│   ├── middleware/
│   │   └── auth.js           Telegram WebApp initData validation
│   └── routes/
│       ├── users.js          GET /api/users/me, PATCH nickname
│       ├── scores.js         POST /api/scores, GET leaderboard
│       ├── spin.js           POST /api/spin, GET /api/spin/status
│       └── store.js          GET /api/store/catalog, POST /api/store/buy
├── public/                   Static files served as the Mini App
│   ├── index.html
│   ├── style.css             Synthwave CSS
│   └── game.js               Full game engine (Canvas API)
├── supabase-schema.sql        Run this in Supabase SQL Editor
├── railway.json               Railway deployment config
├── .env.example               Template for environment variables
├── .gitignore
└── package.json
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/users/me` | ✓ | Fetch or create user profile |
| PATCH | `/api/users/me/nickname` | ✓ | Change nickname (costs 1,000 Shmips) |
| POST | `/api/scores` | ✓ | Submit game score, earn Shmips |
| GET | `/api/scores/leaderboard` | — | Top 5 all-time best scores |
| GET | `/api/scores/me` | ✓ | Player's personal best 5 games |
| GET | `/api/spin/status` | ✓ | Check if daily spin is available |
| POST | `/api/spin` | ✓ | Perform daily spin (21hr cooldown) |
| GET | `/api/store/catalog` | — | Full item catalog |
| POST | `/api/store/buy` | ✓ | Purchase an item |

---

## Economy

- **1,000 game points = 1 Shmip ⬡**
- Multipliers from Daily Spin apply to point-to-Shmip conversion
- Nickname change: **1,000 Shmips** (first-time free)

## Daily Spin Odds

| Reward | Chance |
|---|---|
| 15 Shmips | 45% |
| 20 Shmips + 2× Points (1hr) | 30% |
| 3× Points (1hr) | 12% |
| Golden Plane (1 game) | 8% |
| Random Permanent Upgrade | 5% |

---

## Controls

| Input | Action |
|---|---|
| ◁ / A | Rotate Left |
| ▷ / D | Rotate Right |
| ▲ / W | Thrust |
| Space | Fire |
| F / Shift | Use Flare |

Mobile: on-screen buttons appear automatically on touch devices.
