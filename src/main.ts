import './style.css';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { Chess } from 'chess.js';
import type { Key } from '@lichess-org/chessground/types';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

import {
  initBoard, setPosition, setMovable, lockBoard, makeMove, setFen,
  flipBoard, showArrows, clearArrows, getLegalDests, showPromotionPicker,
} from './board';
import { parsePgnText, pgnFileId, fetchLichessGame } from './pgn';
import { savePgn, loadAllPgns, deletePgn, loadSettings, saveSettings, saveAttempt, loadAttempts, loadAllAttempts } from './storage';
import { TrainSession } from './game';
import { Engine } from './engine';
import type { PgnGame, TrainSettings, MoveResult } from './types';

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const screenUpload  = $('screen-upload');
const screenTrain   = $('screen-train');
const screenFinish  = $('screen-finish');
const screenStats   = $('screen-stats');

const dropZone      = $('drop-zone');
const pgnInput      = $<HTMLInputElement>('pgn-input');
const lichessInput  = $<HTMLInputElement>('lichess-input');
const btnLichess    = $('btn-lichess');
const uploadLoading = $('upload-loading');
const uploadLoadingText = $('upload-loading-text');
const uploadError   = $('upload-error');
const uploadErrorText = $('upload-error-text');
const recentPgns    = $('recent-pgns');
const recentList    = $('recent-pgn-list');

const modalSettings   = $<HTMLDialogElement>('modal-settings');
const settingsStart     = $<HTMLInputElement>('settings-start');
const settingsWhiteRad  = $<HTMLInputElement>('settings-white');
const settingsBlackRad  = $<HTMLInputElement>('settings-black');
const settingsWhiteName = $('settings-white-name');
const settingsBlackName = $('settings-black-name');
const settingsDepth     = $<HTMLInputElement>('settings-depth');
const settingsArrow     = $<HTMLInputElement>('settings-arrow');
const btnStart          = $('btn-start');

const moveFeedback = $('move-feedback');
const moveListEl   = $('move-list');
const moveCounter  = $('move-counter');
const progressBar  = $<HTMLProgressElement>('progress-bar');
const statMatchGame   = $('stat-match-game');
const statMatchEngine = $('stat-match-engine');
const statusMsg    = $('status-msg');
const statusText   = $('status-text');
const gameWhiteEl  = $('game-white');
const gameBlackEl  = $('game-black');
const gameMetaEl   = $('game-meta');
const youPlayAs    = $('you-play-as');
const startMoveBadge = $('start-move-badge');
const btnFlip      = $('btn-flip');
const btnHint      = $<HTMLButtonElement>('btn-hint');

const reviewControls = $('review-controls');
const reviewCounter  = $('review-counter');
const btnReviewPrev  = $<HTMLButtonElement>('btn-review-prev');
const btnReviewNext  = $<HTMLButtonElement>('btn-review-next');
const btnReviewDone  = $<HTMLButtonElement>('btn-review-done');

const finishSubtitle  = $('finish-subtitle');
const finishMatchGame   = $('finish-match-game');
const finishMatchEngine  = $('finish-match-engine');
const finishMatchGameDiff   = $('finish-match-game-diff');
const finishMatchEngineDiff  = $('finish-match-engine-diff');
const finishFirstTry    = $('finish-first-try');
const finishAvgTime     = $('finish-avg-time');
const finishAvgAttempts = $('finish-avg-attempts');
const btnRetry        = $('btn-retry');
const btnReviewErrors = $('btn-review-errors');
const btnNewGame      = $('btn-new-game');

const navTrain = $('nav-train');
const navStats = $('nav-stats');

// ── App state ─────────────────────────────────────────────────────────────────
let boardReady    = false;
let engine        = new Engine();
let engineReady   = false;
let session: TrainSession | null = null;
let currentGame: PgnGame | null  = null;
let currentSettings: TrainSettings = loadSettings();

// Per-move review state
let reviewMoves:  MoveResult[] = [];
let reviewIdx     = 0;
let isReviewMode  = false;

type Screen = 'upload' | 'train' | 'finish' | 'stats';
let lastScreen: Screen = 'upload';

// ── Screen switching ──────────────────────────────────────────────────────────
function showScreen(name: Screen): void {
  if (name !== 'stats') lastScreen = name;
  screenUpload.classList.toggle('hidden', name !== 'upload');
  screenTrain.classList.toggle('hidden',  name !== 'train');
  screenFinish.classList.toggle('hidden', name !== 'finish');
  screenStats.classList.toggle('hidden',  name !== 'stats');

  const app = document.getElementById('app');
  if (app) {
    app.classList.toggle('justify-center', name !== 'stats');
    app.classList.toggle('justify-start',  name === 'stats');
  }

  if (name === 'train' && !boardReady) {
    initBoard($('board'));
    boardReady = true;
  }
}

navTrain.addEventListener('click', () => showScreen(lastScreen));
navStats.addEventListener('click', () => { renderStats(); showScreen('stats'); });

// ── Upload ────────────────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => pgnInput.click());
pgnInput.addEventListener('change', () => {
  const file = pgnInput.files?.[0];
  pgnInput.value = '';
  if (file && file.name.toLowerCase().endsWith('.pgn')) handleFile(file);
});
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-primary', 'bg-base-200');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-primary', 'bg-base-200'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-primary', 'bg-base-200');
  const file = e.dataTransfer?.files[0];
  if (file && file.name.toLowerCase().endsWith('.pgn')) handleFile(file);
});

btnLichess.addEventListener('click', () => {
  const url = lichessInput.value.trim();
  if (!url) return;
  setLoading(true, 'Загружаю с Lichess...');
  clearError();
  fetchLichessGame(url)
    .then((game) => {
      setLoading(false);
      const id = pgnFileId(game.id, [game]);
      savePgn(id, `lichess: ${game.white} vs ${game.black}`, [game]);
      renderRecentPgns();
      openSettingsModal(game);
    })
    .catch((e: Error) => {
      setLoading(false);
      showError(e.message);
    });
});

lichessInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnLichess.click();
});

function handleFile(file: File): void {
  clearError();
  setLoading(true, 'Обрабатываю PGN...');
  const reader = new FileReader();
  reader.onerror = () => { setLoading(false); showError('Ошибка чтения файла'); };
  reader.onload = (e) => {
    requestAnimationFrame(() => setTimeout(() => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') { setLoading(false); showError('Пустой файл'); return; }
        const { games, errors } = parsePgnText(text);
        if (errors.length) console.warn('[MCG] PGN warnings:', errors);
        if (games.length === 0) { setLoading(false); showError('Партии не найдены в PGN файле'); return; }

        const id = pgnFileId(file.name, games);
        savePgn(id, file.name, games);
        renderRecentPgns();
        setLoading(false);

        // If single game — open settings immediately; otherwise show list
        if (games.length === 1) {
          openSettingsModal(games[0]);
        } else {
          renderRecentPgns();
        }
      } catch (err) {
        setLoading(false);
        showError('Ошибка обработки PGN');
        console.error(err);
      }
    }, 30));
  };
  reader.readAsText(file, 'utf-8');
}

function setLoading(on: boolean, text = 'Обрабатываю...'): void {
  dropZone.classList.toggle('hidden', on);
  uploadLoading.classList.toggle('hidden', !on);
  uploadLoadingText.textContent = text;
}

function showError(msg: string): void {
  uploadErrorText.textContent = msg;
  uploadError.classList.remove('hidden');
}

function clearError(): void {
  uploadError.classList.add('hidden');
}

function renderRecentPgns(): void {
  const pgns = loadAllPgns().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  recentPgns.classList.toggle('hidden', pgns.length === 0);
  recentList.innerHTML = '';

  for (const pgn of pgns) {
    const row = document.createElement('div');
    row.className = 'flex flex-col gap-1';

    const header = document.createElement('div');
    header.className = 'flex gap-2 items-center';

    const nameBtn = document.createElement('button');
    nameBtn.className = 'btn btn-outline btn-sm justify-between gap-2 flex-1 text-left min-w-0';
    nameBtn.innerHTML = `<span class="truncate flex-1">${pgn.name}</span><span class="badge badge-ghost badge-sm shrink-0">${pgn.games.length} партий</span>`;
    nameBtn.addEventListener('click', () => {
      if (pgn.games.length === 1) {
        openSettingsModal(pgn.games[0]);
      } else {
        renderGamePicker(pgn.games, row);
      }
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-sm btn-square text-error shrink-0';
    delBtn.title = 'Удалить';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => { deletePgn(pgn.id); renderRecentPgns(); });

    header.append(nameBtn, delBtn);
    row.appendChild(header);
    recentList.appendChild(row);
  }
}

function renderGamePicker(games: PgnGame[], container: HTMLElement): void {
  // Remove existing picker
  container.querySelector('.game-picker')?.remove();

  const picker = document.createElement('div');
  picker.className = 'game-picker flex flex-col gap-1 pl-2 border-l-2 border-base-content/10 mt-1 max-h-48 overflow-y-auto';

  for (const game of games) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-xs justify-start text-left';
    btn.textContent = `${game.white} vs ${game.black}${game.date ? ` (${game.date.match(/^\d{4}/)?.[0] ?? ''})` : ''}`;
    btn.addEventListener('click', () => openSettingsModal(game));
    picker.appendChild(btn);
  }
  container.appendChild(picker);
}

// ── Settings modal ────────────────────────────────────────────────────────────
function openSettingsModal(game: PgnGame): void {
  currentGame = game;
  const s = loadSettings();

  const year = game.date?.match(/^\d{4}/)?.[0];
  const setEl = (id: string, val: string | undefined) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = val ?? ''; el.classList.toggle('hidden', !val); }
  };
  const titleOf = (name: string, title?: string) => title ? `${title} ${name}` : name;
  setEl('settings-white-player', titleOf(game.white, game.whiteTitle));
  setEl('settings-black-player', titleOf(game.black, game.blackTitle));
  setEl('settings-elo-white', game.whiteElo);
  setEl('settings-elo-black', game.blackElo);
  setEl('settings-info-event', game.event);
  setEl('settings-info-site', game.site);
  setEl('settings-info-date', year ? `📅 ${year}` : undefined);
  setEl('settings-info-round', game.round && game.round !== '?' ? `Тур ${game.round}` : undefined);
  setEl('settings-info-eco', game.eco ? `ECO: ${game.eco}` : undefined);

  const maxStart = Math.max(1, Math.floor(game.uciMoves.length / 2));
  settingsStart.max = String(maxStart);
  settingsStart.value = String(Math.min(s.startMove, maxStart));

  settingsWhiteName.textContent = game.white;
  settingsBlackName.textContent = game.black;
  if (s.playerColor === 'b') settingsBlackRad.checked = true;
  else settingsWhiteRad.checked = true;

  settingsDepth.value = String(s.engineDepth);
  settingsArrow.checked = s.showEngineArrow;

  modalSettings.showModal();
}


btnStart.addEventListener('click', () => {
  if (!currentGame) return;
  const settings: TrainSettings = {
    startMove:       parseInt(settingsStart.value),
    playerColor:     settingsWhiteRad.checked ? 'w' : 'b',
    engineDepth:     parseInt(settingsDepth.value),
    showEngineArrow: settingsArrow.checked,
  };
  saveSettings(settings);
  currentSettings = settings;
  modalSettings.close();
  startSession(currentGame, settings);
});

// ── Train session ─────────────────────────────────────────────────────────────
let moveResultsMap: Map<number, MoveResult> = new Map();
let opponentPlayedPlies: Set<number> = new Set();
let currentGameLocal: PgnGame | null = null;
const boardTimers: ReturnType<typeof setTimeout>[] = [];

function clearBoardTimers(): void {
  boardTimers.forEach(t => clearTimeout(t));
  boardTimers.length = 0;
}

async function startSession(game: PgnGame, settings: TrainSettings): Promise<void> {
  clearBoardTimers();
  session?.destroy();
  engine.stop();
  moveResultsMap = new Map();
  opponentPlayedPlies = new Set();
  currentGameLocal = game;

  // Reset UI state from previous session
  statusMsg.classList.add('hidden');
  reviewControls.classList.add('hidden');
  isReviewMode = false;
  document.getElementById('promotion-overlay')?.classList.add('hidden');

  // Init engine if needed
  if (!engineReady) {
    try {
      await engine.init();
      engineReady = true;
    } catch (e) {
      console.warn('[MCG] Engine failed to init:', e);
    }
  }

  // Update sidebar info
  const fmtName = (name: string, title?: string) => title ? `${title} ${name}` : name;
  gameWhiteEl.textContent = fmtName(game.white, game.whiteTitle);
  gameBlackEl.textContent = fmtName(game.black, game.blackTitle);
  const weEl = document.getElementById('game-white-elo');
  const beEl = document.getElementById('game-black-elo');
  if (weEl) weEl.textContent = game.whiteElo ?? '';
  if (beEl) beEl.textContent = game.blackElo ?? '';
  const year = game.date?.match(/^\d{4}/)?.[0];
  gameMetaEl.textContent = [game.event, game.site, game.round ? `Тур ${game.round}` : undefined, year]
    .filter(Boolean).join(' · ');
  youPlayAs.textContent    = settings.playerColor === 'w' ? `Белыми (${game.white})` : `Чёрными (${game.black})`;
  startMoveBadge.textContent = settings.startMove.toString();

  showScreen('train');
  renderMoveList(game, settings, new Map(), new Set());
  clearArrows();
  updateProgress(0, 0, 0);
  moveFeedback.classList.add('hidden');
  moveFeedback.innerHTML = '';

  session = new TrainSession(game, settings, engine, {
    onPositionReady(fen, color, _moveNumber, plyIndex) {
      const chess = new Chess(fen);
      const dests = getLegalDests(chess);
      const cgColor = color === 'w' ? 'white' : 'black';
      setPosition(fen, cgColor);
      setMovable(dests, cgColor, handleUserMove);
      btnHint.disabled = false;
      const userMoveNum = Math.floor((plyIndex - (session?.startPly ?? 0)) / 2) + 1;
      moveCounter.textContent = `${userMoveNum} / ${session?.totalUserMoves ?? '?'}`;
      progressBar.value = ((plyIndex - (session?.startPly ?? 0)) / Math.max(1, game.uciMoves.length - (session?.startPly ?? 0))) * 100;
      showStatus('info', 'Ваш ход!', 0);
      // Clear move feedback for new position
      moveFeedback.classList.add('hidden');
      moveFeedback.innerHTML = '';
      // Store current fen for hint
      btnHint.dataset['fen'] = fen;
      btnHint.dataset['ply'] = String(plyIndex);
      renderMoveList(game, settings, moveResultsMap, opponentPlayedPlies);
    },

    onWrongAttempt(uci, _gameMoveUci, fenBefore, attempt) {
      // Flash the wrong move briefly, then restore position for retry
      const from = uci.slice(0, 2) as Key;
      const to   = uci.slice(2, 4) as Key;
      lockBoard();
      makeMove(from, to);
      showStatus('error', `✗ Неверно, попробуй ещё раз (попытка ${attempt})`, 0);

      const capturedSession = session;
      boardTimers.push(setTimeout(() => {
        if (session !== capturedSession) return;
        // Restore original position and re-enable moves
        const chess = new Chess(fenBefore);
        const dests = getLegalDests(chess);
        const cgColor = chess.turn() === 'w' ? 'white' as const : 'black' as const;
        setFen(fenBefore);
        clearArrows();
        setMovable(dests, cgColor, handleUserMove);
        showStatus('info', 'Ваш ход!', 0);
      }, 600));
    },

    onUserMoveResult(result, gameMoveUci, fenBefore) {
      moveResultsMap.set(result.ply, result);
      lockBoard();
      btnHint.disabled = true;

      // Show status with attempt count
      const attemptsStr = result.attempts > 1 ? ` (с ${result.attempts} попытки)` : '';
      if (result.matchesGame) {
        showStatus('success', `✓ Совпало с партией!${attemptsStr}`, 2500);
      } else {
        showStatus('info', `≈ Лучший ход движка${attemptsStr} (в партии: ${result.gameMove})`, 3000);
      }

      // If user played engine move ≠ game move: animate game move on board
      // so board position stays on the actual game line
      if (!result.matchesGame) {
        const capturedSession = session;
        boardTimers.push(setTimeout(() => {
          if (session !== capturedSession) return;
          setFen(fenBefore);
          makeMove(gameMoveUci.slice(0, 2) as Key, gameMoveUci.slice(2, 4) as Key);
        }, 450));
      }

      // Show engine arrow if engine top move differs from game move
      if (settings.showEngineArrow && result.engineTopMoves[0] && result.engineTopMoves[0] !== gameMoveUci) {
        showArrows([{ orig: result.engineTopMoves[0].slice(0, 2) as Key, dest: result.engineTopMoves[0].slice(2, 4) as Key, brush: 'blue' }]);
      }

      // Update inline stats
      updateProgress(
        Array.from(moveResultsMap.values()).filter((r) => r.matchesGame).length,
        Array.from(moveResultsMap.values()).filter((r) => r.matchesEngineTop1).length,
        moveResultsMap.size,
      );
      renderMoveList(game, settings, moveResultsMap, opponentPlayedPlies);

      // Show move feedback cards
      renderMoveFeedback(result, game, fenBefore);
    },

    onOpponentMoved(from, to, _fen) {
      const ply = (session?.startPly ?? 0) + (moveResultsMap.size * 2) - 1;
      opponentPlayedPlies.add(ply);
      makeMove(from as Key, to as Key);
      clearArrows();
      renderMoveList(game, settings, moveResultsMap, opponentPlayedPlies);
    },

    onSessionDone(results) {
      const attempt = {
        id:          Date.now().toString(36),
        gameId:      game.id,
        gameName:    `${game.white} vs ${game.black}`,
        playerColor: session?.playerColor ?? 'w',
        startMove:   settings.startMove,
        date:        new Date().toISOString(),
        moveResults: results,
      };
      saveAttempt(attempt);
      showFinishScreen(game, settings, results);
    },
  });

  session.start();
}

// ── Board controls ────────────────────────────────────────────────────────────
btnFlip.addEventListener('click', () => flipBoard());

btnHint.addEventListener('click', () => {
  if (!session || !currentGameLocal) return;
  const ply = parseInt(btnHint.dataset['ply'] ?? '0');
  const gameMove = currentGameLocal.uciMoves[ply];
  if (!gameMove) return;
  showArrows([{ orig: gameMove.slice(0, 2) as Key, dest: gameMove.slice(2, 4) as Key, brush: 'yellow' }]);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') flipBoard();
  if ((e.key === 'h' || e.key === 'H') && !btnHint.disabled) btnHint.click();
  if (isReviewMode) {
    if (e.key === 'ArrowLeft')  btnReviewPrev.click();
    if (e.key === 'ArrowRight') btnReviewNext.click();
  }
});

function handleUserMove(orig: Key, dest: Key): void {
  if (!session) return;
  // Detect pawn promotion
  const fen = btnHint.dataset['fen'] ?? '';
  const chess = new Chess(fen);
  const piece = chess.get(orig as Parameters<typeof chess.get>[0]);
  const isPromo = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1');
  if (isPromo) {
    const cgColor = chess.turn() === 'w' ? 'white' as const : 'black' as const;
    showPromotionPicker(cgColor, (promo) => {
      session?.applyUserMove(orig + dest + promo);
    });
  } else {
    session.applyUserMove(orig + dest);
  }
}

// ── Move list ─────────────────────────────────────────────────────────────────
function renderMoveList(
  game: PgnGame,
  settings: TrainSettings,
  results: Map<number, MoveResult>,
  opponentPlies: Set<number>,
): void {
  const total = game.sanMoves.length;
  const rows: string[] = [];

  const playerSideLocal = settings.playerColor === 'auto' ? 'w' : settings.playerColor;
  const startPly = (settings.startMove - 1) * 2 + (playerSideLocal === 'b' ? 1 : 0);
  const wIsUserPly = playerSideLocal === 'w';
  const bIsUserPly = playerSideLocal === 'b';
  let currentFound = false;

  for (let i = 0; i < Math.ceil(total / 2); i++) {
    const wPly = i * 2;
    const bPly = i * 2 + 1;

    const wDisplay = moveCell(wPly, game, settings, results, opponentPlies);
    const bDisplay = moveCell(bPly, game, settings, results, opponentPlies);

    let isCurrent = false;
    if (!currentFound) {
      if ((wIsUserPly && wPly >= startPly && !results.has(wPly)) ||
          (bIsUserPly && bPly >= startPly && !results.has(bPly))) {
        isCurrent = true;
        currentFound = true;
      }
    }

    rows.push(
      `<tr class="${isCurrent ? 'bg-base-100' : ''}">` +
      `<td class="text-base-content/30 pr-1 select-none w-6">${i + 1}.</td>` +
      `<td class="pr-2">${wDisplay}</td>` +
      `<td>${bDisplay}</td>` +
      `</tr>`
    );
  }

  moveListEl.innerHTML = `<table class="w-full border-collapse">${rows.join('')}</table>`;

  // Scroll to current move
  const currentRow = moveListEl.querySelector('tr.bg-base-100');
  currentRow?.scrollIntoView({ block: 'nearest' });
}

function moveCell(
  ply: number,
  game: PgnGame,
  settings: TrainSettings,
  results: Map<number, MoveResult>,
  opponentPlies: Set<number>,
): string {
  const san = game.sanMoves[ply];
  if (!san) return '';

  const playerSide = settings.playerColor === 'auto' ? 'w' : settings.playerColor;
  const isUserPly  = (ply % 2 === 0 && playerSide === 'w') || (ply % 2 === 1 && playerSide === 'b');
  const isPreGame  = ply < (settings.startMove - 1) * 2 + (playerSide === 'b' ? 1 : 0);

  // Pre-game moves — always shown, dimmed
  if (isPreGame) {
    return `<span class="text-base-content/40">${san}</span>`;
  }

  // Opponent's auto-played move — shown after it's been played
  if (!isUserPly) {
    if (opponentPlies.has(ply) || results.has(ply - 1)) {
      return `<span class="text-base-content/60">${san}</span>`;
    }
    return `<span class="text-base-content/20">…</span>`;
  }

  // User's move slot
  const result = results.get(ply);
  if (!result) {
    return `<span class="text-base-content/30 font-bold">?</span>`;
  }

  let cls = 'text-error';
  let icon = '✗';
  if (result.matchesGame)           { cls = 'text-success'; icon = '✓'; }
  else if (result.matchesEngineTop1) { cls = 'text-info';    icon = '≈'; }

  const displaySan = result.matchesGame ? san : (game.sanMoves[ply] ?? san);
  return `<span class="${cls} font-bold" title="${icon} ${result.userMove}">${displaySan}</span>`;
}

// ── Progress & status ─────────────────────────────────────────────────────────
const statAvgTime     = $('stat-avg-time');
const statFirstTry    = $('stat-first-try');
const statAvgAttempts = $('stat-avg-attempts');

function updateProgress(matchGame: number, matchEngine: number, total: number): void {
  if (total === 0) {
    statMatchGame.textContent    = '—';
    statFirstTry.textContent     = '—';
    statMatchEngine.textContent  = '—';
    statAvgTime.textContent      = '—';
    statAvgAttempts.textContent  = '—';
    return;
  }
  const results = Array.from(moveResultsMap.values());
  const firstTry = results.filter(r => r.matchesGame && r.attempts === 1).length;

  statMatchGame.textContent   = `${Math.round((matchGame / total) * 100)}%`;
  statFirstTry.textContent    = `${Math.round((firstTry / total) * 100)}%`;
  statMatchEngine.textContent = `${Math.round((matchEngine / total) * 100)}%`;

  const times = results.map(r => r.thinkingMs).filter((t): t is number => t !== undefined);
  if (times.length > 0) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length / 1000);
    statAvgTime.textContent = `${avg}с`;
  }

  const avgAttempts = results.reduce((s, r) => s + r.attempts, 0) / results.length;
  statAvgAttempts.textContent = avgAttempts.toFixed(1);
}

let statusTimer = 0;

function showStatus(type: 'info' | 'success' | 'error' | 'warning', text: string, hideMs: number): void {
  clearTimeout(statusTimer);
  statusMsg.className = `alert alert-${type}`;
  statusText.textContent = text;
  statusMsg.classList.remove('hidden');
  if (hideMs > 0) {
    statusTimer = window.setTimeout(() => statusMsg.classList.add('hidden'), hideMs);
  }
}

// ── Move feedback cards ───────────────────────────────────────────────────────

/** Convert a UCI move (e.g. "e2e4") to SAN using chess.js from a given FEN */
function uciToSan(fen: string, uci: string): string {
  try {
    const c = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci[4] : undefined;
    const m = c.move({ from, to, ...(promo ? { promotion: promo } : {}) });
    return m?.san ?? uci;
  } catch {
    return uci;
  }
}

/** Format centipawn score from white's POV as "+1.23" / "−0.45" / "#3" */
function formatScore(cp: number | undefined, mate?: number): string {
  if (mate !== undefined) return mate > 0 ? `#${mate}` : `#${mate}`;
  if (cp === undefined) return '';
  const pawns = cp / 100;
  return (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
}

function renderMoveFeedback(result: MoveResult, game: PgnGame, fenBefore: string): void {
  moveFeedback.innerHTML = '';

  const gameSan = game.sanMoves[result.ply] ?? result.gameMove;
  const engineBestUci = result.engineTopMoves[0];
  const engineSan = engineBestUci ? uciToSan(fenBefore, engineBestUci) : '';
  const bestScore = result.engineBestScore; // cp from white's POV

  // Derive game move score: bestScore - cpLoss (adjusted for side)
  let gameMoveScore: number | undefined;
  if (bestScore !== undefined && result.cpLoss !== undefined) {
    // cpLoss is always positive, score from playing side's perspective
    // engineBestScore is from white's POV
    if (result.side === 'w') {
      gameMoveScore = bestScore - result.cpLoss;
    } else {
      gameMoveScore = bestScore + result.cpLoss;
    }
  } else if (result.matchesGame && result.matchesEngineTop1 && bestScore !== undefined) {
    gameMoveScore = bestScore;
  }

  if (result.matchesGame && engineBestUci === result.gameMove) {
    // Perfect: game move = engine best move — single card
    const scoreStr = bestScore !== undefined ? formatScore(bestScore) : '';
    moveFeedback.innerHTML = `
      <div class="card bg-success/10 border border-success/30 shadow-sm">
        <div class="card-body p-3 flex-row items-center gap-3">
          <div class="text-2xl">✓</div>
          <div class="flex-1 min-w-0">
            <div class="text-xs text-success/70 font-semibold uppercase tracking-wide">Лучший ход</div>
            <div class="font-bold text-success text-lg font-mono">${gameSan}${scoreStr ? ` <span class="text-sm text-base-content/50 font-normal">${scoreStr}</span>` : ''}</div>
          </div>
        </div>
      </div>`;
  } else {
    // Two cards: game move + engine best move
    const gameScoreStr = gameMoveScore !== undefined ? formatScore(gameMoveScore) : '';
    const engineScoreStr = bestScore !== undefined ? formatScore(bestScore) : '';

    const gameIcon = result.matchesGame ? '✓' : '📋';
    const gameColor = result.matchesGame ? 'success' : 'warning';

    let html = `
      <div class="card bg-${gameColor}/10 border border-${gameColor}/30 shadow-sm">
        <div class="card-body p-3 flex-row items-center gap-3">
          <div class="text-xl">${gameIcon}</div>
          <div class="flex-1 min-w-0">
            <div class="text-xs text-${gameColor}/70 font-semibold uppercase tracking-wide">Ход партии</div>
            <div class="font-bold text-base-content text-lg font-mono">${gameSan}${gameScoreStr ? ` <span class="text-sm text-base-content/50 font-normal">${gameScoreStr}</span>` : ''}</div>
          </div>
        </div>
      </div>`;

    if (engineSan && engineBestUci !== result.gameMove) {
      html += `
      <div class="card bg-info/10 border border-info/30 shadow-sm">
        <div class="card-body p-3 flex-row items-center gap-3">
          <div class="text-xl">🤖</div>
          <div class="flex-1 min-w-0">
            <div class="text-xs text-info/70 font-semibold uppercase tracking-wide">Лучший ход движка</div>
            <div class="font-bold text-base-content text-lg font-mono">${engineSan}${engineScoreStr ? ` <span class="text-sm text-base-content/50 font-normal">${engineScoreStr}</span>` : ''}</div>
          </div>
        </div>
      </div>`;
    }

    moveFeedback.innerHTML = html;
  }

  moveFeedback.classList.remove('hidden');
}

// ── Finish screen ─────────────────────────────────────────────────────────────
let finishChartInstance: Chart | null = null;

function showFinishScreen(game: PgnGame, settings: TrainSettings, results: MoveResult[]): void {
  const total = results.length;
  const matchGame   = results.filter((r) => r.matchesGame).length;
  const firstTry    = results.filter((r) => r.matchesGame && r.attempts === 1).length;
  const matchEngine = results.filter((r) => r.matchesEngineTop1).length;

  const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : '—';

  finishSubtitle.textContent = `${game.white} vs ${game.black} · старт с хода ${settings.startMove}`;

  // Партия card
  finishMatchGame.textContent   = pct(matchGame);
  finishFirstTry.textContent    = pct(firstTry);
  finishMatchGameDiff.textContent = `${matchGame} из ${total} ходов`;

  // Compare with previous attempt
  const allAttempts = loadAttempts(game.id);
  const prev = allAttempts.length >= 2 ? allAttempts[allAttempts.length - 2] : null;
  if (prev && prev.moveResults.length > 0) {
    const prevTotal = prev.moveResults.length;
    const prevMatch = prev.moveResults.filter((r) => r.matchesGame).length;
    const diff = Math.round(((matchGame / total) - (prevMatch / prevTotal)) * 100);
    if (Math.abs(diff) >= 1) {
      finishMatchGameDiff.textContent += ` (${diff > 0 ? '↑' : '↓'}${Math.abs(diff)}% vs прошлый раз)`;
    }
  }

  // Движок card
  finishMatchEngine.textContent    = pct(matchEngine);
  finishMatchEngineDiff.textContent = `${matchEngine} из ${total} ходов`;

  // Скорость card
  const times = results.map(r => r.thinkingMs).filter((t): t is number => t !== undefined);
  if (times.length > 0) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length / 1000);
    finishAvgTime.textContent = `${avg}с`;
  } else {
    finishAvgTime.textContent = '—';
  }
  const avgAttempts = total > 0 ? (results.reduce((s, r) => s + r.attempts, 0) / total).toFixed(1) : '—';
  finishAvgAttempts.textContent = avgAttempts;

  // Chart: attempts per move
  const canvas = document.getElementById('finish-chart') as HTMLCanvasElement | null;
  if (canvas) {
    finishChartInstance?.destroy();
    const labels = results.map(r => `${r.moveNumber}${r.side === 'w' ? 'w' : 'b'}`);
    const colors = results.map(r =>
      r.matchesGame && r.attempts === 1 ? '#22c55e' :
      r.matchesGame                     ? '#86efac' :
      r.matchesEngineTop1               ? '#38bdf8' : '#f87171'
    );
    finishChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Попытки',
          data: results.map(r => r.attempts),
          backgroundColor: colors,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const r = results[ctx.dataIndex];
                const status = r.matchesGame && r.attempts === 1 ? 'партия (1я попытка)' :
                               r.matchesGame                     ? 'партия' :
                               r.matchesEngineTop1               ? 'движок' : 'неверно';
                return `${ctx.raw} поп. · ${status}`;
              },
            },
          },
        },
        scales: {
          x: { ticks: { font: { size: 9 }, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { stepSize: 1 }, beginAtZero: true },
        },
      },
    });
  }

  reviewMoves = results.filter((r) => !r.matchesGame);
  btnReviewErrors.classList.toggle('hidden', reviewMoves.length === 0);
  reviewIdx = 0;

  showScreen('finish');
}

btnRetry.addEventListener('click', () => {
  if (currentGame) startSession(currentGame, currentSettings);
});

btnNewGame.addEventListener('click', () => {
  session?.destroy();
  session = null;
  showScreen('upload');
  renderRecentPgns();
});

btnReviewErrors.addEventListener('click', () => {
  if (!currentGameLocal || reviewMoves.length === 0) return;
  startReview();
});

btnReviewPrev.addEventListener('click', () => {
  if (reviewIdx > 0) { reviewIdx--; showReviewMove(); }
});

btnReviewNext.addEventListener('click', () => {
  if (reviewIdx < reviewMoves.length - 1) { reviewIdx++; showReviewMove(); }
  else stopReview();
});

btnReviewDone.addEventListener('click', () => stopReview());

// ── Review mode ───────────────────────────────────────────────────────────────
function startReview(): void {
  reviewIdx = 0;
  isReviewMode = true;
  reviewControls.classList.remove('hidden');
  btnHint.disabled = true;
  showScreen('train');
  lockBoard();
  clearArrows();
  showReviewMove();
}

function stopReview(): void {
  isReviewMode = false;
  reviewControls.classList.add('hidden');
  showScreen('finish');
}

function showReviewMove(): void {
  const r = reviewMoves[reviewIdx];
  if (!r || !currentGameLocal) return;

  // Reconstruct position from game
  const chess = new Chess();
  const limit = Math.min(r.ply, currentGameLocal.uciMoves.length);
  for (let i = 0; i < limit; i++) {
    const uci = currentGameLocal.uciMoves[i];
    if (!uci) break;
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length > 4 ? { promotion: uci[4] } : {}) });
  }

  const color = chess.turn() === 'w' ? 'white' as const : 'black' as const;
  setPosition(chess.fen(), color);
  lockBoard();

  // Show user move (red) and game move (green)
  const arrows: { orig: Key; dest: Key; brush: string }[] = [
    { orig: r.userMove.slice(0, 2) as Key, dest: r.userMove.slice(2, 4) as Key, brush: 'red' },
    { orig: r.gameMove.slice(0, 2) as Key, dest: r.gameMove.slice(2, 4) as Key, brush: 'green' },
  ];
  if (r.engineTopMoves[0] && r.engineTopMoves[0] !== r.gameMove) {
    arrows.push({ orig: r.engineTopMoves[0].slice(0, 2) as Key, dest: r.engineTopMoves[0].slice(2, 4) as Key, brush: 'blue' });
  }
  showArrows(arrows);

  reviewCounter.textContent = `${reviewIdx + 1} / ${reviewMoves.length}`;
  btnReviewPrev.disabled = reviewIdx === 0;
  btnReviewNext.textContent = reviewIdx === reviewMoves.length - 1 ? '✓ Готово' : 'След →';
  showStatus('warning', `Ход ${r.moveNumber}: ваш ${r.userMove}, в партии ${r.gameMove}`, 0);
}

// ── Stats screen ──────────────────────────────────────────────────────────────
const statsCharts: Chart[] = [];

function renderStats(): void {
  const statsListEl = $('stats-list');
  const emptyEl     = $('stats-empty');

  // Destroy previous charts
  statsCharts.forEach(c => c.destroy());
  statsCharts.length = 0;

  const allAttempts = loadAllAttempts();
  if (allAttempts.length === 0) {
    statsListEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  // Group by gameId, preserve insertion order (oldest first within each game)
  const byGame = new Map<string, import('./types').GameAttempt[]>();
  for (const a of allAttempts) {
    const arr = byGame.get(a.gameId) ?? [];
    arr.push(a);
    byGame.set(a.gameId, arr);
  }

  // Sort games: most recently played first
  const sortedGames = Array.from(byGame.entries()).sort((a, b) => {
    const latestA = a[1][a[1].length - 1].date;
    const latestB = b[1][b[1].length - 1].date;
    return latestB.localeCompare(latestA);
  });

  statsListEl.innerHTML = '';

  for (const [, attempts] of sortedGames) {
    const latest   = attempts[attempts.length - 1];
    const chartId  = `chart-${latest.gameId.replace(/[^a-z0-9]/gi, '')}`;
    const multiRun = attempts.length > 1;

    // Latest attempt stats
    const total    = latest.moveResults.length;
    const matchG   = latest.moveResults.filter(r => r.matchesGame).length;
    const firstTry = latest.moveResults.filter(r => r.matchesGame && r.attempts === 1).length;
    const matchE   = latest.moveResults.filter(r => r.matchesEngineTop1).length;
    const avgAttempts = total > 0
      ? (latest.moveResults.reduce((s, r) => s + r.attempts, 0) / total).toFixed(1)
      : '—';
    const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : '—';

    // Trend vs previous attempt
    let trendHtml = '';
    if (attempts.length >= 2) {
      const prev      = attempts[attempts.length - 2];
      const prevTotal = prev.moveResults.length;
      const prevMatchG = prev.moveResults.filter(r => r.matchesGame).length;
      if (prevTotal > 0 && total > 0) {
        const diff = Math.round(((matchG / total) - (prevMatchG / prevTotal)) * 100);
        if (Math.abs(diff) >= 1) {
          const cls = diff > 0 ? 'text-success' : 'text-error';
          trendHtml = `<span class="${cls} font-bold ml-1">${diff > 0 ? '↑' : '↓'}${Math.abs(diff)}%</span>`;
        }
      }
    }

    // Attempts rows (newest first, skip latest — shown in header)
    const historyRows = attempts.slice(0, -1).reverse().map((a, i) => {
      const t  = a.moveResults.length;
      const mg = a.moveResults.filter(r => r.matchesGame).length;
      const me = a.moveResults.filter(r => r.matchesEngineTop1).length;
      const p  = (n: number) => t > 0 ? `${Math.round((n / t) * 100)}%` : '—';
      const num = attempts.length - 1 - i;
      return `<tr class="text-xs text-base-content/60">
        <td class="py-0.5 pr-2 text-base-content/30">#${num}</td>
        <td class="pr-2">${new Date(a.date).toLocaleDateString('ru')}</td>
        <td class="pr-2 text-success">${p(mg)}</td>
        <td class="text-info">${p(me)}</td>
      </tr>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'card bg-base-200 shadow-sm';
    card.innerHTML = `
      <div class="card-body p-4 gap-3">
        <!-- Header -->
        <div class="flex justify-between items-start gap-2">
          <div class="min-w-0">
            <p class="font-semibold text-sm truncate">${latest.gameName}</p>
            <p class="text-xs text-base-content/40">Ход ${latest.startMove} · ${latest.playerColor === 'w' ? 'Белые' : 'Чёрные'} · ${attempts.length} ${attempts.length === 1 ? 'попытка' : attempts.length < 5 ? 'попытки' : 'попыток'}</p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-success font-bold text-sm">${pct(matchG)}${trendHtml} <span class="text-xs text-base-content/40">партия</span></p>
            <p class="text-success/60 text-xs">${pct(firstTry)} <span class="text-base-content/40">с первой</span></p>
            <p class="text-info text-xs">${pct(matchE)} <span class="text-base-content/40">движок</span></p>
            <p class="text-base-content/40 text-xs">${avgAttempts} поп/ход</p>
          </div>
        </div>

        ${multiRun ? `<!-- Progress chart -->
        <div><canvas id="${chartId}" height="60"></canvas></div>` : ''}

        ${multiRun ? `<!-- History rows -->
        <details class="text-xs">
          <summary class="cursor-pointer text-base-content/40 hover:text-base-content/70 select-none">История попыток</summary>
          <table class="mt-2 w-full">
            <thead><tr class="text-base-content/30 text-[10px]">
              <th class="text-left font-normal pr-2">#</th>
              <th class="text-left font-normal pr-2">Дата</th>
              <th class="text-left font-normal pr-2">Партия</th>
              <th class="text-left font-normal">Движок</th>
            </tr></thead>
            <tbody>${historyRows}</tbody>
          </table>
        </details>` : ''}
      </div>`;

    statsListEl.appendChild(card);

    // Draw progress chart after DOM insertion
    if (multiRun) {
      const canvas = document.getElementById(chartId) as HTMLCanvasElement | null;
      if (canvas) {
        const labels = attempts.map((_a, i) => `#${i + 1}`);
        const gameData  = attempts.map(a => {
          const t = a.moveResults.length;
          return t > 0 ? Math.round((a.moveResults.filter(r => r.matchesGame).length / t) * 100) : 0;
        });
        const engineData = attempts.map(a => {
          const t = a.moveResults.length;
          return t > 0 ? Math.round((a.moveResults.filter(r => r.matchesEngineTop1).length / t) * 100) : 0;
        });

        const chart = new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Партия %',
                data: gameData,
                backgroundColor: 'rgba(34,197,94,0.7)',
                borderRadius: 3,
                order: 2,
              },
              {
                label: 'Движок %',
                data: engineData,
                type: 'line' as const,
                borderColor: 'rgba(56,189,248,0.8)',
                backgroundColor: 'transparent',
                pointRadius: 3,
                tension: 0.3,
                order: 1,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => `Попытка ${items[0].label}`,
                },
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 9 } } },
              y: { min: 0, max: 100, ticks: { stepSize: 25, font: { size: 9 }, callback: v => `${v}%` }, grid: { color: 'rgba(255,255,255,0.05)' } },
            },
          },
        });
        statsCharts.push(chart);
      }
    }
  }
}

// ── PWA ───────────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* ok in dev */ });
}

// ── Init ──────────────────────────────────────────────────────────────────────
showScreen('upload');
renderRecentPgns();
