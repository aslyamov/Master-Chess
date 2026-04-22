export interface PgnGame {
  id: string;
  white: string;
  black: string;
  whiteElo?: string;
  blackElo?: string;
  event?: string;
  site?: string;
  round?: string;
  date?: string;
  eco?: string;
  whiteTitle?: string;
  blackTitle?: string;
  result: string;
  uciMoves: string[];
  sanMoves: string[];
}

export interface StoredPgn {
  id: string;
  name: string;
  games: PgnGame[];
  savedAt: string;
}

export interface MoveResult {
  ply: number;
  moveNumber: number;
  side: 'w' | 'b';
  userMove: string;       // final (correct) move
  gameMove: string;
  engineTopMoves: string[];
  matchesGame: boolean;
  matchesEngineTop1: boolean;
  attempts: number;       // 1 = got it first try
  cpLoss?: number;
  thinkingMs?: number;
}

export interface GameAttempt {
  id: string;
  gameId: string;
  gameName: string;
  playerColor: 'w' | 'b';
  startMove: number;
  date: string;
  moveResults: MoveResult[];
}

export interface TrainSettings {
  startMove: number;
  playerColor: 'w' | 'b' | 'auto';
  engineDepth: number;
  showEval: boolean;
  showEngineArrow: boolean;
}
