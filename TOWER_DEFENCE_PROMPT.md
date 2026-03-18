# Cursor Prompt: Retro Tower Defence Game (MEYARET Style)

Copy the prompt below into a **new Cursor project** to create a basic retro tower defence game. Do not modify MEYARET.

---

## PROMPT (copy everything between the quotes)

Create a very basic, test-ready retro tower defence game with the following requirements:

**STYLE & DESIGN (match MEYARET aesthetic):**
- Retro synthwave / arcade: dark background (#020008), neon glow effects
- Color palette: Magenta (#ff0077), Cyan (#00ffcc), Yellow (#ffee00), Purple (#8800ff)
- Font: Press Start 2P (pixel / retro)
- UI: Pixelated borders, glowing text shadows, optional CRT scanline overlay
- Buttons: Transparent with colored outlines, matching text color, box-shadow glow
- Layout: Centered screens, safe-area padding for mobile notch/home bar

**PLATFORM:**
- Targets: Telegram Mini App (mobile) + big screen PC
- Viewport: Responsive for small mobile and large desktop
- Input: Touch (tap, drag) for mobile; mouse for PC

**PHASE 1 - Localhost Testing:**
- Run on localhost first (e.g. http://localhost:3000)
- No Telegram integration yet - just HTML/CSS/JS canvas game
- Simple Express or Vite dev server for local testing

**GAME MECHANICS (minimal, for testing):**
1. Map: Single path (enemies walk from A to B)
2. Towers: 2-3 basic types (e.g. cannon, laser, slow) - click to place on grid
3. Enemies: Simple wave-based spawns, move along path, take damage, die
4. Resources: Starting gold, earn more per kill
5. Win/lose: Lose if N enemies reach the end; win if all waves cleared

**TECH:**
- Vanilla HTML5 Canvas
- Plain JS modules, no framework
- Structure: index.html, style.css, game.js, optional config.js

**DELIVERABLES:**
- Playable prototype on localhost
- Main menu: PLAY, simple level select optional
- In-game: Tower placement, waves, basic UI (gold, lives, wave number)
- Styling consistent with MEYARET (dark, neon, pixel font)

Keep it minimal - enough to test core loop and feel before adding Telegram or backend.

---

## Reference: MEYARET Tech Stack

- Frontend: HTML + CSS + vanilla JS (ES modules)
- Font: Press Start 2P from Google Fonts
- Viewport meta: maximum-scale=1.0, user-scalable=no, viewport-fit=cover
- CSS vars: --magenta, --cyan, --yellow, --font, --glow-m, --glow-c
- Telegram: telegram-web-app.js (add later, not for initial localhost build)
