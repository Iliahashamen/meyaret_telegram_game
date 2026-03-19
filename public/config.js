// ── MEYARET Frontend Config ───────────────────────────────────────────────────
// Frontend (GitHub Pages) → API (Railway)
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  const host = window.location.hostname;

  if (host === 'iliahashamen.github.io') {
    // GitHub Pages: send API calls to the Railway backend
    window.MEYARET_API = 'https://meyarettelegramgame-production.up.railway.app';
  } else {
    // Railway or localhost: same-origin
    window.MEYARET_API = '';
  }

  console.log('[MEYARET] API base:', window.MEYARET_API || '(same origin)');

  // No cooldown / unlimited Bossman runs for this Telegram ID only (others: 4h)
  window.BOSSMAN_NO_COOLDOWN_USER_ID = 1357754255;
})();
