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

  // Arcade mode: testing only — replace with your Telegram user ID
  window.ARCADE_TEST_USER_ID = 1357754255;
  window.BOSSMAN_TEST_USER_ID = 1357754255;
})();
