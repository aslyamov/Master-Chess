import { parse } from '@mliebelt/pgn-parser';
import { Chess } from 'chess.js';
import type { PgnGame } from './types';

function strHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function gameId(white: string, black: string, date: string | undefined, firstMoves: string[]): string {
  return strHash(`${white}${black}${date ?? ''}${firstMoves.slice(0, 6).join('')}`);
}

export function parsePgnText(text: string): { games: PgnGame[]; errors: string[] } {
  const errors: string[] = [];
  const games: PgnGame[] = [];

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(text, { startRule: 'games' }) as ReturnType<typeof parse>;
  } catch (e) {
    errors.push(`PGN parse error: ${e}`);
    return { games, errors };
  }

  for (const g of parsed as unknown[]) {
    const game = g as Record<string, unknown>;
    try {
      const chess = new Chess();
      const uciMoves: string[] = [];
      const sanMoves: string[] = [];

      const movesArr = (game['moves'] as unknown[]) ?? [];
      for (const m of movesArr) {
        const mv = m as Record<string, unknown>;
        const notation = mv['notation'] as Record<string, unknown> | undefined;
        const san = notation?.['notation'] as string | undefined;
        if (!san || san === '--') break;
        let result;
        try { result = chess.move(san); } catch { break; }
        if (!result) break;
        uciMoves.push(result.from + result.to + (result.promotion ?? ''));
        sanMoves.push(result.san);
      }

      if (uciMoves.length < 5) continue;

      const tags = (game['tags'] as Record<string, unknown>) ?? {};
      const tagStr = (k: string): string | undefined => {
        const v = tags[k];
        if (v == null) return undefined;
        if (typeof v === 'string') return v.startsWith('[object') ? undefined : v;
        if (typeof v === 'object') {
          const obj = v as Record<string, unknown>;
          // { value: "2026.04.08" }
          if (typeof obj['value'] === 'string') return obj['value'];
          // { year: 2026, month: 4, day: 8 } — pgn-parser Date format
          if (typeof obj['year'] === 'number') {
            const pad = (n: unknown) => String(n ?? '??').padStart(2, '0');
            return `${obj['year']}.${pad(obj['month'])}.${pad(obj['day'])}`;
          }
        }
        return undefined;
      };
      const white = tagStr('White') ?? 'White';
      const black = tagStr('Black') ?? 'Black';
      const date  = tagStr('Date');

      // Site tag often contains a URL for Lichess games — extract city/location only
      const rawSite = tagStr('Site');
      const site = rawSite && /^https?:\/\//i.test(rawSite) ? undefined : rawSite;

      games.push({
        id: gameId(white, black, date, uciMoves),
        white,
        black,
        whiteElo: tagStr('WhiteElo'),
        blackElo: tagStr('BlackElo'),
        whiteTitle: tagStr('WhiteTitle'),
        blackTitle: tagStr('BlackTitle'),
        event: tagStr('Event'),
        site,
        round: tagStr('Round'),
        date,
        eco: tagStr('ECO'),
        result: tagStr('Result') ?? '*',
        uciMoves,
        sanMoves,
      });
    } catch (e) {
      errors.push(String(e));
    }
  }

  return { games, errors };
}

export function pgnFileId(name: string, games: PgnGame[]): string {
  return strHash(name + games.map((g) => g.id).join(''));
}

export async function fetchLichessGame(url: string): Promise<PgnGame> {
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  let pathname = '';
  try { pathname = new URL(href).pathname; } catch {
    throw new Error('Неверная ссылка Lichess');
  }

  const segments = pathname.split('/').filter(Boolean);
  const ids8 = segments.filter((s) => /^[a-zA-Z0-9]{8}$/.test(s));

  if (ids8.length === 0) throw new Error('Неверная ссылка Lichess — не удалось найти ID партии');

  // Broadcast URL: /broadcast/{slug}/{round-slug}/{roundId}/{gameId}
  // Regular game:  /{gameId}  or  /{gameId}/white
  const isBroadcast = segments[0] === 'broadcast' && ids8.length >= 2;

  if (isBroadcast) {
    // ids8 = [..., roundId, gameId] — last two 8-char segments
    const roundId = ids8[ids8.length - 2];
    const gameId  = ids8[ids8.length - 1];
    return fetchBroadcastGame(roundId, gameId);
  }

  // Regular game export
  const gameId = ids8[ids8.length - 1];
  const res = await fetch(
    `https://lichess.org/game/export/${gameId}?moves=true&clocks=false&evals=false&opening=false`,
    { headers: { Accept: 'application/x-chess-pgn' } },
  );
  if (!res.ok) throw new Error(`Партия не найдена (HTTP ${res.status})`);

  const pgn = await res.text();
  const { games, errors } = parsePgnText(pgn);
  if (games.length === 0) throw new Error(errors[0] ?? 'Не удалось распознать партию');
  return games[0];
}

async function fetchBroadcastGame(roundId: string, gameId: string): Promise<PgnGame> {
  // Fetch all games in the broadcast round, then find the specific one.
  // API: GET /api/broadcast/round/{roundId}/games  → multiline PGN stream
  const res = await fetch(
    `https://lichess.org/api/broadcast/round/${roundId}.pgn`,
    { headers: { Accept: 'application/x-chess-pgn' } },
  );
  if (!res.ok) throw new Error(`Трансляция не найдена (HTTP ${res.status})`);

  const pgn = await res.text();
  const { games, errors } = parsePgnText(pgn);
  if (games.length === 0) throw new Error(errors[0] ?? 'Не удалось распознать партии из трансляции');

  // Lichess includes [Site "https://lichess.org/XXXXXXXX"] in broadcast PGN.
  // Find the game whose position in the PGN corresponds
  // to the gameId. We parse Site tags separately for this purpose.
  const siteMatch = findGameBySite(pgn, gameId);
  if (siteMatch !== null && siteMatch < games.length) return games[siteMatch];

  // Fallback: return the first game if no match found
  return games[0];
}

function findGameBySite(pgn: string, gameId: string): number | null {
  // Split PGN into individual game blocks and find index where [Site] contains gameId
  const blocks = pgn.split(/\n\n(?=\[)/).filter((b) => b.trim());
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].includes(gameId)) return i;
  }
  return null;
}
