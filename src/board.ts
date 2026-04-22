import { Chessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Color, Key } from '@lichess-org/chessground/types';
import type { Chess } from 'chess.js';

let cg: CgApi | null = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initBoard(el: HTMLElement): void {
  cg?.destroy();

  cg = Chessground(el, {
    animation:   { enabled: true, duration: 180 },
    highlight:   { lastMove: true, check: true },
    movable:     { free: false, color: undefined },
    draggable:   { enabled: true, showGhost: true },
    selectable:  { enabled: true },
    coordinates: true,
    premovable:  { enabled: false },
  });

  // Chessground v10 needs explicit px size on the element itself.
  const applySize = (px: number): void => {
    el.style.width  = `${px}px`;
    el.style.height = `${px}px`;
    cg?.redrawAll();
  };

  const syncSize = (): boolean => {
    const wrapper = el.closest<HTMLElement>('.board-wrapper');
    const size = wrapper?.offsetWidth ?? el.offsetWidth;
    if (size > 0) { applySize(size); return true; }
    const vp = Math.floor(Math.min(window.innerWidth * 0.85, (window.innerHeight - 56) * 0.88, 720));
    if (vp > 0) { applySize(vp); return true; }
    return false;
  };

  if (!syncSize()) {
    const wrapper = el.closest<HTMLElement>('.board-wrapper') ?? el;
    const ro = new ResizeObserver(() => { if (syncSize()) ro.disconnect(); });
    ro.observe(wrapper);
    setTimeout(() => syncSize(), 60);
    setTimeout(() => syncSize(), 250);
  }
}

// ── Position & moves ──────────────────────────────────────────────────────────

export function setPosition(fen: string, orientation: Color): void {
  if (!cg) return;
  const turn: Color = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  cg.set({
    fen,
    orientation,
    turnColor: turn,
    movable:  { color: undefined, dests: new Map() },
    lastMove: undefined,
  });
}

export function setMovable(
  dests: Map<Key, Key[]>,
  color: Color,
  onMove: (orig: Key, dest: Key) => void,
): void {
  if (!cg) return;
  cg.set({
    turnColor: color,
    movable: {
      free:   false,
      color,
      dests,
      events: { after: onMove },
    },
  });
}

export function lockBoard(): void {
  cg?.set({ movable: { color: undefined } });
}

export function makeMove(from: Key, to: Key): void {
  cg?.move(from, to);
}

export function setFen(fen: string): void {
  if (!cg) return;
  const turn: Color = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  cg.set({ fen, turnColor: turn });
}

export function flipBoard(): void {
  cg?.toggleOrientation();
}

export function showArrows(shapes: { orig: Key; dest: Key; brush: string }[]): void {
  cg?.setAutoShapes(shapes);
}

export function clearArrows(): void {
  cg?.setAutoShapes([]);
}

export function flashError(): void {
  const wrap = document.querySelector<HTMLElement>('.board-wrapper');
  if (!wrap) return;
  wrap.classList.remove('flash-error');
  void wrap.offsetWidth;
  wrap.classList.add('flash-error');
  const ac = new AbortController();
  const cleanup = (): void => { wrap.classList.remove('flash-error'); ac.abort(); };
  wrap.addEventListener('animationend',    cleanup, { once: true, signal: ac.signal });
  wrap.addEventListener('animationcancel', cleanup, { once: true, signal: ac.signal });
}

// ── Legal destinations ────────────────────────────────────────────────────────

export function getLegalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const m of chess.moves({ verbose: true })) {
    const f = m.from as Key;
    const existing = dests.get(f);
    if (existing) existing.push(m.to as Key);
    else dests.set(f, [m.to as Key]);
  }
  return dests;
}

// ── Promotion picker ──────────────────────────────────────────────────────────

type PromoRole = 'q' | 'r' | 'b' | 'n';

const PROMO_UNICODE: Record<Color, Record<PromoRole, string>> = {
  white: { q: '♕', r: '♖', b: '♗', n: '♘' },
  black: { q: '♛', r: '♜', b: '♝', n: '♞' },
};

export function showPromotionPicker(color: Color, callback: (piece: PromoRole) => void): void {
  const overlay   = document.getElementById('promotion-overlay');
  const container = document.getElementById('promotion-pieces');
  if (!overlay || !container) { callback('q'); return; }

  container.innerHTML = '';
  const labels: Record<PromoRole, string> = { q: 'Ферзь', r: 'Ладья', b: 'Слон', n: 'Конь' };

  for (const role of (['q', 'r', 'b', 'n'] as PromoRole[])) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost flex flex-col items-center gap-1 text-4xl w-16 h-16';
    btn.title = labels[role];
    btn.textContent = PROMO_UNICODE[color][role];
    btn.addEventListener('click', () => {
      overlay.classList.add('hidden');
      callback(role);
    });
    container.appendChild(btn);
  }

  overlay.classList.remove('hidden');
}

export function destroyBoard(): void {
  cg?.destroy();
  cg = null;
}
