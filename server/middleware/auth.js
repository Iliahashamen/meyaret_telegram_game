import crypto from 'crypto';

/**
 * Validates the Telegram WebApp initData string via HMAC-SHA256.
 * Rejects requests with invalid signatures or stale auth tokens (>24h old).
 *
 * The client must send: X-Telegram-Init-Data: <raw initData string>
 */
const AUTH_MAX_AGE_S = 86400; // 24 hours

export function requireTelegramAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];

  if (!initData) {
    return res.status(401).json({ error: 'Missing Telegram auth header.' });
  }

  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) {
    console.error('[auth] ERROR — TELEGRAM_BOT_TOKEN not set in environment!');
    return res.status(500).json({ error: 'Server config error.' });
  }

  let parsed;
  try {
    parsed = Object.fromEntries(new URLSearchParams(initData));
  } catch {
    return res.status(401).json({ error: 'Malformed initData.' });
  }

  const { hash, ...dataWithoutHash } = parsed;

  let telegramUser = {};
  try { telegramUser = JSON.parse(dataWithoutHash.user || '{}'); } catch (_) {}
  const userId = telegramUser.id;

  if (!userId) return res.status(401).json({ error: 'No user in initData.' });
  if (!hash)   return res.status(401).json({ error: 'Missing hash in initData.' });

  // ── auth_date expiry check ────────────────────────────────────────────────────
  const authDate = Number(dataWithoutHash.auth_date || 0);
  const nowS     = Math.floor(Date.now() / 1000);
  if (!authDate || (nowS - authDate) > AUTH_MAX_AGE_S) {
    return res.status(401).json({ error: 'Telegram session expired. Reopen the game.' });
  }

  // ── HMAC-SHA256 Verification ─────────────────────────────────────────────────
  const dataCheckString = Object.keys(dataWithoutHash)
    .sort()
    .map((k) => `${k}=${dataWithoutHash[k]}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (expectedHash !== hash) {
    console.warn(`[auth] REJECT HMAC MISMATCH — user ${userId} auth_date=${authDate}`);
    return res.status(401).json({ error: 'Invalid Telegram signature.' });
  }

  req.telegramUser   = telegramUser;
  req.telegramUserId = userId;
  next();
}
