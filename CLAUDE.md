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

**`game.js` is the whole game**, written as module-level functions over module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`, plus `combo`, `maxCombo`, `pendingEntry` from the records section). `init()` resets every one of these (the records ones via the `resetRecordsState()` hook on its first line) and is also the restart handler, so any new piece of state must be reset there. `init()` means "start a game"; it must stay that way.

**Startup**: the script no longer calls `init()` at load. It ends with `showStartScreen()`, which sets `gameOver = true` (so the keyboard handler ignores game keys), leaves `current` undefined, paints an empty board and shows the `#start-screen` overlay with the records table. `draw()` returns right after painting the locked board when `current` is falsy; keep that guard if you touch `draw()`. "Jugar" (or Enter) hides the overlay and calls `init()`.

Key data conventions:
- `board` is `ROWS × COLS` of integers; `0` is empty, `1`–`7` is a piece type that indexes both `COLORS` and `PIECES`.
- Piece shape matrices store the piece's own type index in filled cells (not `1`), so `merge()` can copy cells straight into `board` and `drawBlock` can color from the cell value.
- `collide()` treats `y < 0` as in-bounds (pieces may spawn partially above the board) but `x` out of range or `y >= ROWS` as a collision.
- `rotateCW()` is transpose + row reverse; `tryRotate()` applies wall kicks of `0, ±1, ±2` columns and silently gives up if none fit.
- `clearLines()` splices the completed row and `unshift`s an empty one, then re-checks the same index (`r++` after the loop's `r--`). Its last line calls `trackCombo(cleared)` on every piece lock: `combo` increments when `cleared > 0` and resets to 0 otherwise; `maxCombo` is the per-game maximum.
- Records live in `localStorage` under `'tetris-records'` as `{ scores: [{ name, score, lines, level, date }], bestCombo, maxLines }` (top 5, sorted desc). `loadRecords()` always goes through `sanitizeRecords()` and falls back to `{ scores: [], bestCombo: 0, maxLines: 0 }` on corrupt data; all storage access is wrapped in `try/catch`. `endGame()` calls `showGameOverRecords()`, which updates the historical maxima, decides whether `score` qualifies (score > 0 and fewer than 5 entries or greater than the 5th) and, if so, shows the name input; `saveRecord()` inserts and re-renders with the new row highlighted (`.records-row--new`); if the player restarts with the name form still open, `resetRecordsState()` saves the pending entry first (typed name or "Anónimo"). `records` is re-read from storage before every write so a second tab cannot be clobbered. `renderRecords(container, highlightIndex)` is shared by the start screen and the game-over overlay. Reset is a two-click confirmation (no native `confirm()`).

Game loop: `loop(ts)` runs under `requestAnimationFrame`, accumulates elapsed ms into `dropAccum`, and drops one row when it exceeds `dropInterval`. Pause and game over work by `cancelAnimationFrame(animId)`; resume resets `lastTime` before re-entering `loop` so no time jump is applied. `dropInterval = max(100, 1000 − (level − 1) × 90)` and level is recomputed inside `clearLines()`.

Rendering: `draw()` clears and repaints everything each frame (grid, locked board, ghost piece at `globalAlpha 0.2`, current piece). The next-piece preview on `#next-canvas` is only repainted in `spawn()`.

## Coupling to watch

- The `<canvas id="board">` `width`/`height` in `index.html` are hardcoded to `COLS × BLOCK` by `ROWS × BLOCK` (300 × 600). Changing any of those constants requires updating both files.
- `#next-canvas` is 120 × 120 and `drawNext()` assumes a 4 × 4 cell area at 30 px; keep them in sync.
- `game.js` looks up DOM ids (`score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `next-canvas`, `theme-toggle`, and for records `records-combo`, `records-gameover`, `records-message`, `records-form`, `records-name`, `records-save-btn`, `records-table`, `records-reset-btn`, `start-screen`, `start-records`, `start-btn`, `start-reset-btn`) at load time, so renaming an element in `index.html` breaks the script.
- `#overlay` is shared by PAUSA and GAME OVER; the records block inside it (`#records-gameover`) is shown only by `showGameOverRecords()` and hidden again by `init()`, so pausing never shows stale records.
- Buttons call `blur()` in their click handlers so Space does not re-trigger them while playing; follow that pattern for new buttons.
- The 12-character name limit lives in `RECORDS_NAME_MAX` (`game.js`), which also sets `#records-name`'s `maxLength` at load; the `maxlength="12"` attribute in `index.html` is only the no-JS fallback.
- Keyboard input uses `e.code` (physical keys), not `e.key`.
