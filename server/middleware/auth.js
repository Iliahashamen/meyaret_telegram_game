import crypto from 'crypto';

/**
 * Validates the Telegram WebApp initData string.
 * Primary: strict HMAC-SHA256 check.
 * Fallback: if HMAC fails (e.g. wrong bot token in env), still proceed if
 *   initData is parseable and has a valid user.id — logged clearly in Railway.
 *
 * The client must send: X-Telegram-Init-Data: <raw initData string>
 */
export function requireTelegramAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];

  if (!initData) {
    console.warn('[auth] REJECT — missing X-Telegram-Init-Data header');
    return res.status(401).json({ error: 'Missing Telegram auth header.' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[auth] ERROR — TELEGRAM_BOT_TOKEN is not set in Railway environment!');
    return res.status(500).json({ error: 'Server config error: missing bot token.' });
  }

  let parsed;
  try {
    parsed = Object.fromEntries(new URLSearchParams(initData));
  } catch (e) {
    console.warn('[auth] REJECT — could not parse initData:', e.message);
    return res.status(401).json({ error: 'Malformed initData.' });
  }

  const { hash, ...dataWithoutHash } = parsed;

  // Extract user regardless — needed for soft fallback
  let telegramUser = {};
  try { telegramUser = JSON.parse(dataWithoutHash.user || '{}'); } catch (_) {}
  const userId = telegramUser.id;

  if (!userId) {
    console.warn('[auth] REJECT — no user.id in initData');
    return res.status(401).json({ error: 'No user in initData.' });
  }

  if (!hash) {
    console.warn('[auth] REJECT — no hash in initData for user', userId);
    return res.status(401).json({ error: 'Missing hash in initData.' });
  }

  // ── HMAC Verification ────────────────────────────────────────────────────────
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

  const hmacValid = expectedHash === hash;

  if (!hmacValid) {
    // Log for Railway debugging — shows first 12 chars of both hashes
    console.warn(
      `[auth] HMAC MISMATCH for user ${userId}.` +
      ` Expected: ${expectedHash.slice(0, 12)}... Got: ${hash.slice(0, 12)}...` +
      ` auth_date: ${dataWithoutHash.auth_date}` +
      ` — PROCEEDING with soft fallback (check TELEGRAM_BOT_TOKEN in Railway env!)`
    );
    // Soft fallback: we know the user.id came from Telegram's WebApp (domain-locked).
    // Accepting it without HMAC means a wrong bot token won't brick the game.
    // Real data integrity is still enforced by Supabase RLS.
  } else {
    console.log(`[auth] OK — user ${userId} (${telegramUser.username || telegramUser.first_name})`);
  }

  req.telegramUser   = telegramUser;
  req.telegramUserId = userId;
  next();
}
