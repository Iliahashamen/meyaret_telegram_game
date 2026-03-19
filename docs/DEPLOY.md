# MEYARET deploy checklist

## One bot = one webhook (why “everything died” after two deploys)

Telegram allows **exactly one** `setWebhook` URL per **BOT_TOKEN**.

- If you run **two Railway services** (or Railway + another host) with the **same** `TELEGRAM_BOT_TOKEN` and both have `NODE_ENV=production` + `WEBHOOK_URL`, **each deploy overwrites the webhook**.
- The instance that “lost” the webhook **stops receiving updates** — looks like the bot and “whole system” are down.

**Fix:**

1. **Only one** backend should set the webhook for that bot (usually **one Railway service**).
2. **GitHub Pages** is fine for the **mini-app HTML** only — it must **not** call `setWebhook` (no `WEBHOOK_URL` there).
3. **Frontend URL** (`MINI_APP_URL`) can be GitHub Pages **or** Railway; **API** (`MEYARET_API` in `config.js`) must point at the **same** Railway host that has the DB and `/api/config`.

## Minimal production layout (recommended)

| Piece            | Where              | Env notes |
|-----------------|--------------------|-----------|
| Mini App UI     | GitHub Pages       | No secrets |
| REST API + bot  | Railway            | All secrets; `WEBHOOK_URL` = this service public URL (no trailing path) |

## After changing env on Railway

- Redeploy or restart so `/api/config` and Supabase URLs are correct (no stray newlines in `SUPABASE_URL`).

## Local smoke test

```bash
npm run test:all
NODE_ENV=development node server/index.js
# Visit http://localhost:3000/health
```

`npm run test:all` does **not** import `server/index.js` (that would start the server in the test process).
