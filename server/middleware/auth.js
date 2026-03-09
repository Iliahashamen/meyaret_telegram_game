import crypto from 'crypto';

/**
 * Validates the Telegram WebApp initData string.
 * Attach as middleware to any route that requires a logged-in Telegram user.
 *
 * The client must send the header:  X-Telegram-Init-Data: <raw initData string>
 * On success, req.telegramUser is populated with the parsed user object.
 */
export function requireTelegramAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];

  if (!initData) {
    return res.status(401).json({ error: 'Missing Telegram auth header.' });
  }

  try {
    const parsed = Object.fromEntries(new URLSearchParams(initData));
    const { hash, ...dataWithoutHash } = parsed;

    if (!hash) return res.status(401).json({ error: 'Missing hash in initData.' });

    // Build the data-check string (sorted key=value pairs joined by \n)
    const dataCheckString = Object.keys(dataWithoutHash)
      .sort()
      .map((k) => `${k}=${dataWithoutHash[k]}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.TELEGRAM_BOT_TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) {
      return res.status(401).json({ error: 'Invalid Telegram auth signature.' });
    }

    // Parse the user object embedded in initData
    req.telegramUser = JSON.parse(dataWithoutHash.user || '{}');
    req.telegramUserId = req.telegramUser.id;

    next();
  } catch (err) {
    console.error('[auth] Validation error:', err.message);
    return res.status(401).json({ error: 'Auth validation failed.' });
  }
}
