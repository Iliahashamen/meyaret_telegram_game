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
    var injected = '__RAILWAY_URL__';
    // Valid app URL must end in .up.railway.app or be a custom domain
    // NOT the railway.com/project/... dashboard URL
    var isValid = injected !== '__RAILWAY_URL__'
      && !injected.includes('railway.com/project')
      && injected.startsWith('https://');

    if (isValid) {
      window.MEYARET_API = injected;
      console.log('[MEYARET] API →', window.MEYARET_API);
    } else {
      console.warn(
        '[MEYARET] RAILWAY_URL secret is not set correctly.\n' +
        'It must be your app URL like: https://your-app.up.railway.app\n' +
        'NOT the Railway dashboard URL (railway.com/project/...).\n' +
        'Go to Railway → your service → Settings → Networking → copy the domain.'
      );
      window.MEYARET_API = '';
    }
  } else {
    // Railway or localhost: same-origin API
    window.MEYARET_API = '';
  }
})();
