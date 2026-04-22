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
  userMove: string;
  gameMove: string;
  engineTopMoves: string[];
  matchesGame: boolean;
  matchesEngineTop1: boolean;
  matchesEngineTop3: boolean;
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
  engineMultiPv: number;
  showEval: boolean;
  showEngineArrow: boolean;
}
