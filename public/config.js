// ── MEYARET Frontend Config ───────────────────────────────────────────────────
// This file is auto-rewritten by GitHub Actions when RAILWAY_URL secret is set.
// Do not edit manually unless you know what you're doing.
//
// Logic:
//   - GitHub Pages host  → API calls go to Railway (injected by CI)
//   - Railway host       → API calls go to same origin (empty string)
//   - localhost          → API calls go to same origin (empty string)
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const host = window.location.hostname;

  if (host === 'iliahashamen.github.io') {
    // GitHub Pages: backend is on Railway.
    // RAILWAY_URL is injected here by the GitHub Actions workflow
    // (set the RAILWAY_URL secret in repo Settings → Secrets → Actions).
    window.MEYARET_API = '__RAILWAY_URL__';   // replaced by CI; fallback below
    if (window.MEYARET_API === '__RAILWAY_URL__' || !window.MEYARET_API) {
      // Secret not yet set — show a one-time setup hint in console
      console.warn(
        '[MEYARET] RAILWAY_URL not injected yet.\n' +
        'Add RAILWAY_URL secret to your GitHub repo:\n' +
        '  github.com/Iliahashamen/meyaret_telegram_game\n' +
        '  → Settings → Secrets → Actions → New secret\n' +
        '  Name: RAILWAY_URL  Value: https://your-app.up.railway.app\n' +
        'Then re-run the GitHub Actions workflow.'
      );
      window.MEYARET_API = '';   // game still loads, API calls will fail gracefully
    }
  } else {
    // Railway or localhost: same-origin API
    window.MEYARET_API = '';
  }
})();
