/*
 * timeControl.js — how long a game was meant to take, however it was written.
 *
 * Two spellings reach the archive, and they use different units:
 *
 *   - PGN TimeControl tags (Chess.com, Lichess, the Play page) are in
 *     SECONDS: "600", "600+5", "1/259200" for a daily game, "40/5400:1800+30"
 *     for a multi-period control.
 *   - US Chess notation, which a coach copies off a tournament flyer, is in
 *     MINUTES: "G/30;d5", "G/60+5", "40/90, SD/30;d5".
 *
 * "30+5" is legal in both and means 30 seconds in one and 30 minutes in the
 * other, so nothing here guesses: each reader takes one spelling, and the
 * caller says which one it holds. The games.time_control column (0022) holds
 * the US Chess spelling; the PGN tag holds the PGN one.
 *
 * Pure: no React, no Supabase.
 */

/*
 * How many moves a game is assumed to last when increment or delay is turned
 * into minutes. Lichess classifies speed with 40, and using the same number
 * keeps "15+10 on Lichess" and "15+10 entered by hand" in the same bucket.
 */
export const ESTIMATE_MOVES = 40;

const toNumber = (text) => {
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/**
 * Read a PGN TimeControl tag (seconds). Returns null for "-", "?", "" and
 * anything unreadable, rather than a guess.
 *
 * @returns {{baseSeconds: number, incrementSeconds: number, delaySeconds: number, daily: boolean}|null}
 */
export function parsePgnTimeControl(tag) {
  if (typeof tag !== 'string') return null;
  const text = tag.trim();
  if (!text || text === '-' || text === '?') return null;

  // Multi-period: the first period is the one a player is in for most of a
  // scholastic game, and it is the one a flyer leads with.
  const first = text.split(':')[0];

  // "1/259200" is one move per three days: correspondence, not a sitting.
  let m = /^(\d+)\/(\d+)$/.exec(first);
  if (m) {
    const moves = Number(m[1]);
    const seconds = Number(m[2]);
    if (moves === 1 && seconds >= 3600) {
      return { baseSeconds: seconds, incrementSeconds: 0, delaySeconds: 0, daily: true };
    }
    return { baseSeconds: seconds, incrementSeconds: 0, delaySeconds: 0, daily: false };
  }

  // "*60" is a sandglass: treat the glass as the base.
  m = /^\*(\d+)$/.exec(first);
  if (m) return { baseSeconds: Number(m[1]), incrementSeconds: 0, delaySeconds: 0, daily: false };

  m = /^(\d+)(?:\+(\d+(?:\.\d+)?))?$/.exec(first);
  if (!m) return null;
  const base = toNumber(m[1]);
  const inc = m[2] ? toNumber(m[2]) : 0;
  if (base == null || inc == null) return null;
  return { baseSeconds: base, incrementSeconds: inc, delaySeconds: 0, daily: false };
}

/**
 * Read US Chess notation (minutes, then seconds of delay or increment).
 * Accepts the spellings flyers actually use: "G/30;d5", "G/30 d5", "G30 d5",
 * "Game/30, d5", "G/60+5", "G/60;inc5", "40/90, SD/30;d5", "G/30".
 *
 * @returns {{baseSeconds: number, incrementSeconds: number, delaySeconds: number, daily: boolean}|null}
 */
export function parseUsChessTimeControl(text) {
  if (typeof text !== 'string') return null;
  const src = text.trim().replace(/\s+/g, ' ');
  if (!src) return null;

  // The primary period: "G/30" (sudden death) or "40/90" (moves/minutes).
  const primary = /^(?:g(?:ame)?\s*\/?\s*(\d+)|(\d+)\s*\/\s*(\d+))/i.exec(src);
  if (!primary) return null;
  const minutes = toNumber(primary[1] ?? primary[3]);
  if (minutes == null || minutes <= 0) return null;

  // Delay and increment can sit anywhere after it: ";d5", " d5", "+5", "inc5".
  const rest = src.slice(primary[0].length);
  const delay = /(?:^|[\s;,])d\s*(\d+)/i.exec(rest);
  const inc = /(?:\+\s*|inc\s*)(\d+)/i.exec(rest);
  // Anything left that is not a separator, a delay, an increment or a
  // sudden-death period is a typo, and a typo is not a time control.
  const leftover = rest
    .replace(/(?:^|[\s;,])d\s*\d+/gi, ' ')
    .replace(/(?:\+\s*|inc\s*)\d+/gi, ' ')
    .replace(/sd\s*\/\s*\d+/gi, ' ')
    .replace(/[\s;,]+/g, '');
  if (leftover) return null;

  return {
    baseSeconds: minutes * 60,
    incrementSeconds: inc ? Number(inc[1]) : 0,
    delaySeconds: delay ? Number(delay[1]) : 0,
    daily: false,
  };
}

/**
 * Minutes each player could expect to use: base plus ESTIMATE_MOVES moves'
 * worth of increment or delay. Delay is counted like increment: a player who
 * moves inside the delay loses no time, which over a game adds up the same.
 * Null for daily games and unknown controls — neither is "at least X minutes"
 * in any sense a homework rule can check.
 */
export function estimatedMinutes(tc) {
  if (!tc || tc.daily) return null;
  const perMove = (tc.incrementSeconds || 0) + (tc.delaySeconds || 0);
  return (tc.baseSeconds + ESTIMATE_MOVES * perMove) / 60;
}

/** "G/30;d5", "G/10+5", "G/60" — the US Chess spelling, for display and the column. */
export function formatUsChess(tc) {
  if (!tc) return '';
  if (tc.daily) return 'Daily';
  const minutes = Math.round((tc.baseSeconds / 60) * 100) / 100;
  let out = `G/${minutes}`;
  if (tc.delaySeconds) out += `;d${tc.delaySeconds}`;
  if (tc.incrementSeconds) out += `+${tc.incrementSeconds}`;
  return out;
}

/*
 * The Play page writes delay into the PGN tag as "+N" (chessClock.js,
 * pgnTimeControlTag), so the scoresheet does the same: one convention per
 * archive. The US Chess spelling in the column keeps the difference.
 */
export function toPgnTimeControlTag(tc) {
  if (!tc) return '-';
  if (tc.daily) return `1/${tc.baseSeconds}`;
  const extra = tc.delaySeconds || tc.incrementSeconds || 0;
  return `${Math.round(tc.baseSeconds)}+${extra}`;
}

const TAG_RE = /\[TimeControl\s+"([^"]*)"\]/;

/**
 * A stored game's time control: the structured column first (US Chess
 * spelling, from a scoresheet), then the PGN's own tag. Null when neither
 * says anything usable.
 */
export function timeControlOfGame(game) {
  if (!game) return null;
  const column = typeof game.timeControl === 'string' ? game.timeControl.trim() : '';
  if (column) {
    const fromColumn = parseUsChessTimeControl(column);
    if (fromColumn) return fromColumn;
  }
  const m = TAG_RE.exec(String(game.pgn || ''));
  return m ? parsePgnTimeControl(m[1]) : null;
}
