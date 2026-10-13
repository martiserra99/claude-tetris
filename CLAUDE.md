# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A vanilla-JavaScript Tetris rendered on HTML5 Canvas. There is no `package.json`, bundler, transpiler, linter, or test suite. The README and all user-facing strings are in Spanish; keep new UI text in Spanish.

## Running

No build step. Open `index.html` directly or serve the folder with any static server:

```bash
open index.html
python3 -m http.server 8000   # then http://localhost:8000
```

Verification is manual: load the page in a browser and play (controls: arrows, `X`/`↑` rotate, `Space` hard drop, `P` pause).

## Architecture

Three files, loaded in order by `index.html`: `style.css`, then `game.js` as a classic (non-module) script at the end of `<body>`.

**`game.js` is the whole game**, written as module-level functions over module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`). `init()` resets every one of these and is also the restart handler, so any new piece of state must be reset there.

Key data conventions:
- `board` is `ROWS × COLS` of integers; `0` is empty, `1`–`7` is a piece type that indexes both `COLORS` and `PIECES`.
- Piece shape matrices store the piece's own type index in filled cells (not `1`), so `merge()` can copy cells straight into `board` and `drawBlock` can color from the cell value.
- `collide()` treats `y < 0` as in-bounds (pieces may spawn partially above the board) but `x` out of range or `y >= ROWS` as a collision.
- `rotateCW()` is transpose + row reverse; `tryRotate()` applies wall kicks of `0, ±1, ±2` columns and silently gives up if none fit.
- `clearLines()` splices the completed row and `unshift`s an empty one, then re-checks the same index (`r++` after the loop's `r--`).

Game loop: `loop(ts)` runs under `requestAnimationFrame`, accumulates elapsed ms into `dropAccum`, and drops one row when it exceeds `dropInterval`. Pause and game over work by `cancelAnimationFrame(animId)`; resume resets `lastTime` before re-entering `loop` so no time jump is applied. `dropInterval = max(100, 1000 − (level − 1) × 90)` and level is recomputed inside `clearLines()`.

Rendering: `draw()` clears and repaints everything each frame (skin background if any, grid, locked board, ghost piece at `globalAlpha 0.2`, current piece). The next-piece preview on `#next-canvas` is only repainted in `spawn()` and `applySkin()`.

Skins (`// ---- Skins ----` section at the end of `game.js`): `SKINS = { retro, neon, pastel, pixel }`, each `{ label, colors, canvasBg, grid, drawBlock(context, x, y, type, size, alpha) }`. `drawBlock()` keeps the `if (!colorIndex) return;` guard and the `globalAlpha = 1` reset but delegates the actual painting to `currentSkin.drawBlock`; `retro.colors` is the `COLORS` array and `retro.drawBlock` is the original flat-block renderer. `canvasBg: null` means the CSS `--canvas-bg` shows through (so the skin follows the light/dark theme); `grid: null` means the CSS `--grid` var is used, resolved by `refreshGridColor()` (called from both `applyTheme()` and `applySkin()`). To add a skin: add an entry to `SKINS` and an `<option>` to `#skin-select`; `applySkin()` validates the name with `Object.hasOwn` and falls back to `retro` for unknown values. `#skin-select` stops `keydown` propagation so arrows / `P` / `Space` do not reach the game handler while it has focus. Skin choice is persisted under `localStorage` key `tetris-skin` and is not game state (it is not reset in `init()`).

## Coupling to watch

- The `<canvas id="board">` `width`/`height` in `index.html` are hardcoded to `COLS × BLOCK` by `ROWS × BLOCK` (300 × 600). Changing any of those constants requires updating both files.
- `#next-canvas` is 120 × 120 and `drawNext()` assumes a 4 × 4 cell area at 30 px; keep them in sync.
- `game.js` looks up DOM ids (`score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `next-canvas`, `theme-toggle`, `skin-select`) at load time, so renaming an element in `index.html` breaks the script.
- `#skin-select` `<option value>`s must match the keys of `SKINS`; `.theme-toggle` and `.skin-select` sit inside the fixed `.top-controls` container, which overrides the button's own `position: fixed`.
- Skin `drawBlock` implementations that touch `shadowBlur` / `shadowColor` (Neon) must reset them before returning, or the glow bleeds into the grid and the next block.
- Keyboard input uses `e.code` (physical keys), not `e.key`.
