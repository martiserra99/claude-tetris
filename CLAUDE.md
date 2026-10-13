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

Verification is manual: load the page in a browser and play (controls: arrows, `X`/`↑` rotate, `Space` hard drop, `P`/`Escape` pause menu).

## Architecture

Three files, loaded in order by `index.html`: `style.css`, then `game.js` as a classic (non-module) script at the end of `<body>`.

**`game.js` is the whole game**, written as module-level functions over module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`, plus `startLevel` and `baseLevel` in the pause-menu section). `init()` resets every one of these and is also the restart handler, so any new piece of state must be reset there. `startLevel` is the exception: it is a user preference persisted in `localStorage` (`'tetris-start-level'`) that `init()` copies into `baseLevel` rather than resets, so changing the selector mid-game only affects the next game.

Key data conventions:
- `board` is `ROWS × COLS` of integers; `0` is empty, `1`–`7` is a piece type that indexes both `COLORS` and `PIECES`.
- Piece shape matrices store the piece's own type index in filled cells (not `1`), so `merge()` can copy cells straight into `board` and `drawBlock` can color from the cell value.
- `collide()` treats `y < 0` as in-bounds (pieces may spawn partially above the board) but `x` out of range or `y >= ROWS` as a collision.
- `rotateCW()` is transpose + row reverse; `tryRotate()` applies wall kicks of `0, ±1, ±2` columns and silently gives up if none fit.
- `clearLines()` splices the completed row and `unshift`s an empty one, then re-checks the same index (`r++` after the loop's `r--`).

Game loop: `loop(ts)` runs under `requestAnimationFrame`, accumulates elapsed ms into `dropAccum`, and drops one row when it exceeds `dropInterval`. Pause and game over work by `cancelAnimationFrame(animId)`; resume resets `lastTime` before re-entering `loop` so no time jump is applied. `dropInterval = max(100, 1000 − (level − 1) × 90)` (also applied in `init()` for the chosen start level) and `level = baseLevel + floor(lines / 10)` is recomputed inside `clearLines()`.

Pause menu (`// ---- Menú de pausa ----` section at the end of `game.js`): `togglePause()` (bound to `KeyP` and `Escape`, no-op when `gameOver`) stops the loop and calls `setPauseMenu(paused)`, which shows/hides `#pause-menu`; `#overlay` is only used for game over. The menu's buttons call `togglePause()`, `init()` and `setPauseControls()`; the `#pause-start-level` `<select>` (options 1–15 generated at load) updates `startLevel` and saves it. While paused, the `keydown` handler returns immediately if the `<select>` has focus (so its arrows/Esc work natively), otherwise calls `blockGameKeys(e)` to `preventDefault()` game keys before returning, so nothing moves or scrolls; `Space` is still allowed on a focused menu button for keyboard use. Opening the menu focuses the Reanudar button; every menu button calls `blur()` after click so a later `Space` does not re-trigger it.

Rendering: `draw()` clears and repaints everything each frame (grid, locked board, ghost piece at `globalAlpha 0.2`, current piece). The next-piece preview on `#next-canvas` is only repainted in `spawn()`.

## Coupling to watch

- The `<canvas id="board">` `width`/`height` in `index.html` are hardcoded to `COLS × BLOCK` by `ROWS × BLOCK` (300 × 600). Changing any of those constants requires updating both files.
- `#next-canvas` is 120 × 120 and `drawNext()` assumes a 4 × 4 cell area at 30 px; keep them in sync.
- `game.js` looks up DOM ids (`score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `next-canvas`, `theme-toggle`, `pause-menu`, `pause-resume-btn`, `pause-restart-btn`, `pause-controls-btn`, `pause-controls`, `pause-start-level`) at load time, so renaming an element in `index.html` breaks the script.
- Keyboard input uses `e.code` (physical keys), not `e.key`.
