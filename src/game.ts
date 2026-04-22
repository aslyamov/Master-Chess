import { Chess } from 'chess.js';
import type { PgnGame, MoveResult, TrainSettings } from './types';
import type { Engine, AnalysisResult } from './engine';

export interface SessionCallbacks {
  onPositionReady(fen: string, color: 'w' | 'b', moveNumber: number, plyIndex: number): void;
  onWrongAttempt(uci: string, gameMove: string, fenBefore: string, attempt: number): void;
  onUserMoveResult(result: MoveResult, gameMoveUci: string, fenBeforeMove: string): void;
  onOpponentMoved(from: string, to: string, fen: string): void;
  onSessionDone(results: MoveResult[]): void;
}

export class TrainSession {
  private chess: Chess;
  private plies: string[];
  private sanMoves: string[];
  private currentPly: number;
  private results: MoveResult[] = [];
  private playerSide: 'w' | 'b';
  private destroyed = false;
  private positionReadyAt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private attemptsAtCurrentPly = 0;

  // Pre-analysis: engine starts while user is thinking
  private preAnalysisPromise: Promise<AnalysisResult> | null = null;
  private preAnalysisFen = '';

  readonly game: PgnGame;
  readonly settings: TrainSettings;
  readonly startPly: number;

  constructor(
    game: PgnGame,
    settings: TrainSettings,
    private engine: Engine,
    private cb: SessionCallbacks,
  ) {
    this.game     = game;
    this.settings = settings;
    this.plies    = game.uciMoves;
    this.sanMoves = game.sanMoves;

    this.playerSide = settings.playerColor === 'auto' ? 'w' : settings.playerColor;

    const base = (settings.startMove - 1) * 2;
    this.startPly   = this.playerSide === 'b' ? base + 1 : base;
    this.currentPly = this.startPly;

    this.chess = new Chess();
    for (let i = 0; i < this.currentPly; i++) {
      this.applyUci(this.chess, this.plies[i]);
    }
  }

  start(): void {
    if (this.playerSide === 'b' && this.currentPly < this.plies.length) {
      if (this.currentPly % 2 === 0) {
        this.autoPlayOpponent();
        return;
      }
    }
    this.promptUser();
  }

  private promptUser(): void {
    if (this.destroyed) return;
    if (this.currentPly >= this.plies.length) {
      this.cb.onSessionDone(this.results);
      return;
    }
    const fen = this.chess.fen();
    const color = this.chess.turn();
    const moveNumber = Math.floor(this.currentPly / 2) + 1;

    this.startPreAnalysis(fen);
    this.positionReadyAt = Date.now();
    this.cb.onPositionReady(fen, color, moveNumber, this.currentPly);
  }

  private startPreAnalysis(fen: string): void {
    if (!this.engine.isReady) return;
    this.preAnalysisFen = fen;
    this.preAnalysisPromise = this.engine.analyze(fen, this.settings)
      .catch(() => ({ topMoves: [], bestMove: '' }));
  }

  async applyUserMove(uci: string): Promise<void> {
    if (this.destroyed) return;

    const fenBefore  = this.chess.fen();
    const gameMove   = this.plies[this.currentPly];
    const sideToMove = this.chess.turn();

    const from  = uci.slice(0, 2);
    const to    = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci[4] : undefined;
    const applied = this.chess.move({ from, to, ...(promo ? { promotion: promo } : {}) });
    if (!applied) return;

    const matchGame = uci === gameMove;
    const thinkingMs = this.positionReadyAt > 0 ? Date.now() - this.positionReadyAt : undefined;

    // Always fetch engine analysis — pre-analysis ran while user was thinking,
    // so this is usually an instant cache hit
    let engineTopMoves: string[] = [];
    let cpLoss: number | undefined;

    if (this.engine.isReady) {
      try {
        const res = this.preAnalysisFen === fenBefore && this.preAnalysisPromise
          ? await this.preAnalysisPromise
          : await this.engine.analyze(fenBefore, this.settings);

        engineTopMoves = res.topMoves.map((m) => m.move);

        const bestCp   = res.topMoves[0]?.score ?? 0;
        const userLine = res.topMoves.find((m) => m.move === uci);
        cpLoss = userLine !== undefined
          ? Math.max(0, bestCp - userLine.score)
          : Math.max(0, bestCp - (res.topMoves[res.topMoves.length - 1]?.score ?? bestCp - 100));
      } catch { /* engine may be busy */ }
    }

    const matchesEngineTop1 = engineTopMoves[0] === uci;

    // Retry if move doesn't match game AND isn't the engine's best move
    if (!matchGame && !matchesEngineTop1) {
      this.chess.undo();
      this.attemptsAtCurrentPly++;
      // Don't clear pre-analysis — FEN unchanged, result still valid next attempt
      this.cb.onWrongAttempt(uci, gameMove, fenBefore, this.attemptsAtCurrentPly);
      return;
    }

    // Move is accepted (matches game or engine approved)
    this.preAnalysisPromise = null;
    this.preAnalysisFen = '';

    const result: MoveResult = {
      ply:               this.currentPly,
      moveNumber:        Math.floor(this.currentPly / 2) + 1,
      side:              sideToMove,
      userMove:          uci,
      gameMove,
      engineTopMoves,
      matchesGame:       matchGame,
      matchesEngineTop1,
      attempts:          this.attemptsAtCurrentPly + 1,
      cpLoss,
      thinkingMs,
    };

    this.attemptsAtCurrentPly = 0;
    this.results.push(result);
    this.currentPly++;

    // Keep internal position on the game line regardless of what user played
    if (!matchGame) {
      this.chess.undo();
      this.applyUci(this.chess, gameMove);
    }

    this.cb.onUserMoveResult(result, gameMove, fenBefore);
    this.timers.push(setTimeout(() => this.autoPlayOpponent(), 750));
  }

  private autoPlayOpponent(): void {
    if (this.destroyed) return;

    if (this.currentPly >= this.plies.length) {
      this.cb.onSessionDone(this.results);
      return;
    }

    if (this.chess.turn() === this.playerSide) {
      this.promptUser();
      return;
    }

    const opponentUci = this.plies[this.currentPly];
    const from  = opponentUci.slice(0, 2);
    const to    = opponentUci.slice(2, 4);
    const promo = opponentUci.length > 4 ? opponentUci[4] : undefined;

    this.chess.move({ from, to, ...(promo ? { promotion: promo } : {}) });
    this.currentPly++;

    this.cb.onOpponentMoved(from, to, this.chess.fen());
    this.timers.push(setTimeout(() => this.promptUser(), 420));
  }

  private applyUci(chess: Chess, uci: string): void {
    const from  = uci.slice(0, 2);
    const to    = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci[4] : undefined;
    chess.move({ from, to, ...(promo ? { promotion: promo } : {}) });
  }

  get totalUserMoves(): number {
    return Math.ceil((this.plies.length - this.startPly) / 2);
  }

  get completedMoves(): number {
    return this.results.length;
  }

  get playerColor(): 'w' | 'b' {
    return this.playerSide;
  }

  getSanMove(ply: number): string {
    return this.sanMoves[ply] ?? '';
  }

  getResults(): MoveResult[] {
    return [...this.results];
  }

  destroy(): void {
    this.destroyed = true;
    this.preAnalysisPromise = null;
    this.preAnalysisFen = '';
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
  }
}
