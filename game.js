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
  trackCombo(cleared); // récords: combo de limpiezas consecutivas
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
  comboEl.textContent = combo; // récords
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
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
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!current) return; // pantalla de inicio: solo tablero vacío

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
  showGameOverRecords(); // récords: tabla + alta de nombre si entra en el top
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
  resetRecordsState(); // récords: combo, formulario y pantalla de inicio
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
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
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

applyTheme(loadTheme());

// ---- Récords ----
const RECORDS_KEY = 'tetris-records';
const RECORDS_MAX = 5;
const RECORDS_NAME_MAX = 12;

const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const startBtn = document.getElementById('start-btn');
const startResetBtn = document.getElementById('start-reset-btn');
const comboEl = document.getElementById('records-combo');
const recordsGameOver = document.getElementById('records-gameover');
const recordsMessage = document.getElementById('records-message');
const recordsForm = document.getElementById('records-form');
const recordsNameInput = document.getElementById('records-name');
const recordsSaveBtn = document.getElementById('records-save-btn');
const recordsTableEl = document.getElementById('records-table');
const recordsResetBtn = document.getElementById('records-reset-btn');

let combo, maxCombo;     // combo actual y máximo de la partida (se resetean en init())
let pendingEntry = null; // puntuación a la espera de nombre en el game over
let records = loadRecords();

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

// Devuelve siempre un objeto con la forma esperada, descartando datos corruptos.
function sanitizeRecords(raw) {
  const clean = emptyRecords();
  if (!raw || typeof raw !== 'object') return clean;
  if (Array.isArray(raw.scores)) {
    clean.scores = raw.scores
      .filter(e => e && typeof e === 'object' && typeof e.name === 'string' && Number.isFinite(e.score) && e.score > 0)
      .map(e => ({
        name: e.name.trim().slice(0, RECORDS_NAME_MAX) || 'Anónimo',
        score: toCount(e.score),
        lines: toCount(e.lines),
        level: Math.max(1, toCount(e.level)),
        date: typeof e.date === 'string' ? e.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RECORDS_MAX);
  }
  clean.bestCombo = toCount(raw.bestCombo);
  clean.maxLines = toCount(raw.maxLines);
  return clean;
}

function loadRecords() {
  try {
    return sanitizeRecords(JSON.parse(localStorage.getItem(RECORDS_KEY)));
  } catch (e) {
    return emptyRecords(); // JSON corrupto o almacenamiento bloqueado
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    // sin persistencia; los récords viven solo durante la sesión
  }
}

function qualifies(s) {
  if (s <= 0) return false;
  return records.scores.length < RECORDS_MAX || s > records.scores[RECORDS_MAX - 1].score;
}

// Inserta la entrada ordenada por puntuación (los empates van detrás) y devuelve su posición.
function insertRecord(entry) {
  let i = records.scores.findIndex(e => e.score < entry.score);
  if (i === -1) i = records.scores.length;
  records.scores.splice(i, 0, entry);
  records.scores.length = Math.min(records.scores.length, RECORDS_MAX);
  return i < RECORDS_MAX ? i : -1;
}

// Máximos históricos de la partida actual (combo y líneas).
function updateRecordMaxima() {
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

// Pinta la tabla (top 5 + mejor combo + máx. líneas) en `container`,
// resaltando la fila `highlightIndex` si es >= 0.
function renderRecords(container, highlightIndex = -1) {
  container.replaceChildren();
  if (records.scores.length === 0) {
    container.appendChild(el('p', 'records-empty', 'Todavía no hay récords. ¡Sé el primero!'));
  } else {
    const table = el('table', 'records-table');
    const head = table.createTHead().insertRow();
    ['#', 'Nombre', 'Puntos', 'Líneas', 'Nivel'].forEach(h => head.appendChild(el('th', null, h)));
    const body = table.createTBody();
    records.scores.forEach((e, i) => {
      const row = body.insertRow();
      if (i === highlightIndex) row.classList.add('records-row--new');
      if (e.date) row.title = new Date(e.date).toLocaleString();
      [i + 1, e.name, e.score.toLocaleString(), e.lines, e.level]
        .forEach(v => row.appendChild(el('td', null, v)));
    });
    container.appendChild(table);
  }
  const stats = el('p', 'records-stats');
  stats.appendChild(el('span', null, `Mejor combo: ${records.bestCombo}`));
  stats.appendChild(el('span', null, `Máx. líneas: ${records.maxLines}`));
  container.appendChild(stats);
}

// Llamado desde clearLines() en cada bloqueo de pieza.
function trackCombo(cleared) {
  combo = cleared > 0 ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  comboEl.textContent = combo;
}

// Llamado desde endGame(): actualiza máximos históricos y muestra la tabla en el overlay.
function showGameOverRecords() {
  records = loadRecords(); // por si otra pestaña ha guardado mientras tanto
  updateRecordMaxima();
  saveRecords();
  pendingEntry = null;
  if (qualifies(score)) {
    pendingEntry = { name: '', score, lines, level, date: '' };
    recordsMessage.textContent = '¡Has entrado en el top 5! Escribe tu nombre:';
    recordsNameInput.value = '';
    recordsForm.classList.remove('hidden');
  } else {
    recordsMessage.textContent = '';
    recordsForm.classList.add('hidden');
  }
  renderRecords(recordsTableEl);
  recordsGameOver.classList.remove('hidden');
  if (pendingEntry) recordsNameInput.focus();
}

function saveRecord() {
  if (!pendingEntry) return;
  const entry = {
    ...pendingEntry,
    name: recordsNameInput.value.trim().slice(0, RECORDS_NAME_MAX) || 'Anónimo',
    date: new Date().toISOString(),
  };
  pendingEntry = null;
  records = loadRecords();
  updateRecordMaxima();
  const index = insertRecord(entry);
  saveRecords();
  recordsForm.classList.add('hidden');
  recordsMessage.textContent = '¡Récord guardado!';
  renderRecords(recordsTableEl, index);
}

// Reset en dos clicks (sin confirm() nativo): el botón pasa a "¿Seguro?" y se
// desarma solo a los 3 s o al pulsar cualquier otra cosa.
function bindResetButton(btn) {
  const label = btn.textContent;
  let timer = null;
  const disarm = () => {
    clearTimeout(timer);
    timer = null;
    btn.textContent = label;
    btn.classList.remove('records-reset--confirm');
  };
  btn.addEventListener('click', e => {
    e.currentTarget.blur(); // evita que Space reactive el botón
    if (timer === null) {
      btn.textContent = '¿Seguro?';
      btn.classList.add('records-reset--confirm');
      timer = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    records = emptyRecords();
    saveRecords();
    renderRecords(startRecordsEl);
    renderRecords(recordsTableEl);
  });
  document.addEventListener('click', e => { if (timer !== null && e.target !== btn) disarm(); });
  document.addEventListener('keydown', e => { if (timer !== null && e.target !== btn) disarm(); });
}

// Hook al principio de init(): estado nuevo de la partida y UI de récords oculta.
function resetRecordsState() {
  if (pendingEntry) saveRecord(); // Reiniciar sin guardar: se guarda con el nombre escrito (o "Anónimo")
  combo = 0;
  maxCombo = 0;
  pendingEntry = null;
  startScreen.classList.add('hidden');
  recordsGameOver.classList.add('hidden');
}

// Arranque: tablero vacío debajo y pantalla de inicio con la tabla; sin loop ni pieza.
function showStartScreen() {
  cancelAnimationFrame(animId);
  gameOver = true; // bloquea las teclas del juego hasta pulsar Jugar
  paused = false;
  current = undefined;
  board = createBoard();
  draw();
  overlay.classList.add('hidden');
  recordsGameOver.classList.add('hidden');
  records = loadRecords();
  renderRecords(startRecordsEl);
  startScreen.classList.remove('hidden');
}

startBtn.addEventListener('click', e => {
  e.currentTarget.blur();
  init(); // init() oculta la pantalla de inicio vía resetRecordsState()
});

recordsSaveBtn.addEventListener('click', e => {
  e.currentTarget.blur();
  saveRecord();
});

recordsNameInput.maxLength = RECORDS_NAME_MAX;
recordsNameInput.addEventListener('keydown', e => {
  if (e.isComposing) return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    saveRecord();
  }
});

// Enter en la pantalla de inicio = Jugar (salvo con foco en un botón/input, que ya disparan su click).
document.addEventListener('keydown', e => {
  if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
  if (startScreen.classList.contains('hidden')) return;
  if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return;
  init();
});

bindResetButton(startResetBtn);
bindResetButton(recordsResetBtn);

showStartScreen();
