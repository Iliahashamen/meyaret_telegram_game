# Woodland Camo Style (Final Update Reference)

When implementing or updating the THE CHUCK NORRIS skin for the final update, use this woodland camo style.

## Color Palette

- **tan** `#c4a574` — Base: large irregular background splotches
- **lime** `#7cb342` — Bright vibrant green: prominent blobs
- **olive** `#4a5d23` — Dark olive: mid-sized interlocking shapes
- **black** `#1a1a1a` — Small elongated branch-like accents
- **stroke** `#6b9a3a` — Jet outline/glow (visible on dark bg)

## Pattern Style

- Organic blobs using ellipses with rotation (0.3, -0.3, 0.7)
- Interlocking shapes that overlap
- Black shapes: thin elongated ellipses (branch-like)
- Canvas size: 80×80
- Colors tuned to pop on dark space background (#020008)

## Gold Star (center of jet)

- Position: (0, -sz * 0.25)
- Fill: #ffdd00, stroke: #ffcc00
- Radius: sz * 0.22, Glow: 10

## Code Location

`public/game.js` — CAMO const, getCamoPattern(), drawCamoStar()
Skin id: skin_chuck_norris
