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
})();
