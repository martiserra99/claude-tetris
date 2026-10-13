'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');

let gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  currentSkin.drawBlock(context, x, y, colorIndex, size, alpha ?? 1);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSkinBackground(ctx, canvas);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawSkinBackground(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  // Frame rezagado tras endGame()/togglePause(): no avanzar ni reprogramar.
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      // Si al bloquear la pieza spawn() ha terminado la partida, endGame() no
      // puede cancelar este frame (ya se está ejecutando). Pintamos el estado
      // final y salimos sin pedir otro frame; si no, el bucle seguiría vivo y
      // apilaría piezas sobre el tablero con gameOver = true.
      if (gameOver) { draw(); return; }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Tema claro / oscuro ----
const THEME_KEY = 'tetris-theme';

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch (e) {
    return 'dark'; // almacenamiento bloqueado (modo privado, etc.)
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    // sin persistencia; el toggle sigue funcionando durante la sesión
  }
}

function applyTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = light ? '🌙 Modo oscuro' : '☀️ Modo claro';
  themeBtn.setAttribute('aria-pressed', String(light));
  refreshGridColor();
  if (paused || gameOver) draw();
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  saveTheme(theme);
}

themeBtn.addEventListener('click', e => {
  e.currentTarget.blur(); // evita que Space reactive el botón
  toggleTheme();
});

// ---- Skins ----
// Cada skin define su paleta (indexada por tipo de pieza 1–7), un fondo de
// canvas opcional (null → se usa el --canvas-bg del tema CSS), un color de
// cuadrícula opcional (null → CSS var --grid) y cómo se pinta un bloque.
// drawBlock() recibe el contexto, la celda (x, y), el tipo, el tamaño en px
// y el alpha ya resuelto (1 por defecto; 0.2 para la pieza fantasma).
const SKIN_KEY = 'tetris-skin';

function roundedRectPath(context, x, y, w, h, r) {
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Patrón 3×3 del skin pixel art: esquinas oscuras, centro claro, highlight
// arriba-izquierda y sombra abajo-derecha (capas translúcidas sobre el color base).
const PIXEL_SHADES = [
  ['rgba(0,0,0,0.30)',       'rgba(255,255,255,0.35)', 'rgba(0,0,0,0.30)'],
  ['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.18)', 'rgba(0,0,0,0.22)'],
  ['rgba(0,0,0,0.30)',       'rgba(0,0,0,0.22)',       'rgba(0,0,0,0.45)'],
];

const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    canvasBg: null,
    grid: null,
    drawBlock(context, x, y, type, size, alpha) {
      context.globalAlpha = alpha;
      context.fillStyle = this.colors[type];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    },
  },

  neon: {
    label: 'Neón',
    colors: [null, '#00f0ff', '#fff200', '#ff2bd6', '#39ff14', '#ff3131', '#3d8bff', '#ff8c00'],
    canvasBg: '#000',
    grid: '#151515',
    drawBlock(context, x, y, type, size, alpha) {
      const color = this.colors[type];
      const px = x * size + 2, py = y * size + 2, w = size - 4;
      // Relleno oscuro teñido del color (sin glow, para no emborronar el interior)
      context.globalAlpha = alpha * 0.28;
      context.fillStyle = color;
      context.fillRect(px, py, w, w);
      // Borde brillante con glow
      context.globalAlpha = alpha;
      context.shadowColor = color;
      context.shadowBlur = 10;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px, py, w, w);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
    },
  },

  pastel: {
    label: 'Pastel',
    colors: [null, '#a8dadc', '#ffe5a0', '#d7b8f3', '#b9e4b4', '#f6b8b8', '#b8d4f5', '#ffd1a8'],
    canvasBg: null,
    grid: null,
    drawBlock(context, x, y, type, size, alpha) {
      const px = x * size + 1.5, py = y * size + 1.5, w = size - 3;
      const r = size * 0.25;
      context.globalAlpha = alpha;
      context.fillStyle = this.colors[type];
      roundedRectPath(context, px, py, w, w, r);
      context.fill();
      // Borde interior sutil más claro
      context.strokeStyle = 'rgba(255,255,255,0.45)';
      context.lineWidth = 1.5;
      roundedRectPath(context, px + 2, py + 2, w - 4, w - 4, Math.max(1, r - 2));
      context.stroke();
    },
  },

  pixel: {
    label: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8d870', '#b060f8', '#58d854', '#f83830', '#4878f8', '#fc9838'],
    canvasBg: null,
    grid: null,
    drawBlock(context, x, y, type, size, alpha) {
      const x0 = x * size + 1, y0 = y * size + 1, w = size - 2;
      context.globalAlpha = alpha;
      context.fillStyle = this.colors[type];
      context.fillRect(x0, y0, w, w);
      // Subceldas 3×3 con coordenadas enteras (sin antialias)
      for (let r = 0; r < 3; r++) {
        const sy = y0 + Math.floor((w * r) / 3);
        const sh = y0 + Math.floor((w * (r + 1)) / 3) - sy;
        for (let c = 0; c < 3; c++) {
          const sx = x0 + Math.floor((w * c) / 3);
          const sw = x0 + Math.floor((w * (c + 1)) / 3) - sx;
          context.fillStyle = PIXEL_SHADES[r][c];
          context.fillRect(sx, sy, sw, sh);
        }
      }
    },
  },
};

const skinSelect = document.getElementById('skin-select');
let currentSkin = SKINS.retro;

function refreshGridColor() {
  gridColor = currentSkin.grid
    || getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
}

function drawSkinBackground(context, target) {
  if (!currentSkin.canvasBg) return;
  context.fillStyle = currentSkin.canvasBg;
  context.fillRect(0, 0, target.width, target.height);
}

function loadSkin() {
  try {
    return localStorage.getItem(SKIN_KEY); // applySkin() valida el valor
  } catch (e) {
    return null; // almacenamiento bloqueado (modo privado, etc.)
  }
}

function saveSkin(name) {
  try {
    localStorage.setItem(SKIN_KEY, name);
  } catch (e) {
    // sin persistencia; el skin sigue aplicado durante la sesión
  }
}

function applySkin(name) {
  // hasOwn: un valor manipulado como 'constructor' no debe colarse como skin.
  const key = typeof name === 'string' && Object.hasOwn(SKINS, name) ? name : 'retro';
  currentSkin = SKINS[key];
  skinSelect.value = key;
  refreshGridColor();
  // La vista previa solo se repinta en spawn(): forzarla siempre. El tablero
  // lo repinta el loop en juego; en pausa / game over hay que forzarlo.
  if (next) drawNext();
  if ((paused || gameOver) && current) draw();
}

skinSelect.addEventListener('change', e => {
  const name = e.currentTarget.value;
  applySkin(name);
  saveSkin(name);
  e.currentTarget.blur(); // evita que Space / flechas vuelvan a abrir el selector
});

// Mientras el selector tiene el foco, sus teclas (flechas, P, Space) son para
// él y no deben llegar al listener de juego del documento.
skinSelect.addEventListener('keydown', e => e.stopPropagation());

applySkin(loadSkin());
applyTheme(loadTheme());
init();
