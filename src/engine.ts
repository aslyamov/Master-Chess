import type { TrainSettings } from './types';

export interface EngineMove {
  move: string;
  score: number;
  mate?: number;
}

export interface AnalysisResult {
  topMoves: EngineMove[];
  bestMove: string;
}

export class Engine {
  private worker: Worker | null = null;
  private ready = false;
  private pendingResolve: ((r: AnalysisResult) => void) | null = null;
  private lines = new Map<number, EngineMove>();

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(`${import.meta.env.BASE_URL}stockfish-18-lite-single.js`);
      } catch {
        reject(new Error('Stockfish worker не найден. Проверьте public/stockfish-18-lite.js'));
        return;
      }

      const timeout = setTimeout(() => reject(new Error('Engine init timeout')), 10_000);

      this.worker.onmessage = (e: MessageEvent<string>) => {
        const msg = typeof e.data === 'string' ? e.data : String(e.data);
        if (msg === 'uciok') {
          this.worker!.postMessage('isready');
        } else if (msg === 'readyok') {
          clearTimeout(timeout);
          this.ready = true;
          resolve();
        } else if (this.ready) {
          this.handleLine(msg);
        }
      };

      this.worker.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error(`Engine error: ${err.message}`));
      };

      this.worker.postMessage('uci');
    });
  }

  private handleLine(msg: string): void {
    if (msg.startsWith('info') && msg.includes(' pv ')) {
      const mpv = parseInt(msg.match(/multipv (\d+)/)?.[1] ?? '1');
      const pvMatch = msg.match(/ pv (\S+)/);
      if (!pvMatch) return;
      const move = pvMatch[1];
      const cpMatch = msg.match(/score cp (-?\d+)/);
      const mateMatch = msg.match(/score mate (-?\d+)/);
      this.lines.set(mpv, {
        move,
        score: cpMatch ? parseInt(cpMatch[1]) : 0,
        mate: mateMatch ? parseInt(mateMatch[1]) : undefined,
      });
    } else if (msg.startsWith('bestmove')) {
      const bestMove = msg.split(' ')[1] ?? '';
      const topMoves = Array.from(this.lines.entries())
        .sort(([a], [b]) => a - b)
        .map(([, line]) => line);
      this.pendingResolve?.({ topMoves, bestMove: bestMove || topMoves[0]?.move || '' });
      this.pendingResolve = null;
    }
  }

  analyze(fen: string, settings: TrainSettings): Promise<AnalysisResult> {
    if (!this.worker || !this.ready) {
      return Promise.reject(new Error('Engine not ready'));
    }
    // Reject any previous pending request so it doesn't resolve into a stale caller
    if (this.pendingResolve) {
      this.pendingResolve({ topMoves: [], bestMove: '' });
      this.pendingResolve = null;
    }
    this.lines.clear();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingResolve === resolve) {
          this.pendingResolve = null;
          reject(new Error('Engine analysis timeout'));
        }
      }, 30_000);

      this.pendingResolve = (result) => {
        clearTimeout(timeout);
        resolve(result);
      };

      this.worker!.postMessage('stop');
      this.worker!.postMessage('setoption name MultiPV value 1');
      this.worker!.postMessage(`position fen ${fen}`);
      this.worker!.postMessage(`go depth ${settings.engineDepth}`);
    });
  }

  stop(): void {
    this.worker?.postMessage('stop');
    this.pendingResolve = null;
  }

  destroy(): void {
    this.worker?.postMessage('quit');
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.pendingResolve = null;
  }

  get isReady(): boolean {
    return this.ready;
  }
}
