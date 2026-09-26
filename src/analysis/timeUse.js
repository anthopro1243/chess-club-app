/*
 * timeUse.js — how a player spent their clock in one game (research F054).
 *
 * Coaches report big gains from simply slowing down ("wait 5 seconds before
 * any move"), and the clearest evidence a player needs to hear it is a
 * mistake played in a few seconds while minutes were left. That's the flag.
 *
 * Built from what the analysis already stores per move: `moveSeconds` (from
 * [%clk] comments; null for each side's first move, never 0) and
 * `clockBefore`. Move quality comes from scoring.js's own classifyPly(), so
 * "blunder" here means exactly what it means everywhere else in the app.
 * Games without clock data return `available: false` and say nothing.
 */

import { classifyPly, FAST_MOVE_SECONDS } from './scoring.js';

/** A mistake this fast, with at least this much left, is a "rushed" error. */
export const RUSHED_MIN_CLOCK_SECONDS = 300;
/** Below this share of the starting clock (or 30 s), the player is in time trouble. */
export const TROUBLE_FRACTION = 0.1;
export const TROUBLE_FLOOR_SECONDS = 30;

const round1 = (x) => Math.round(x * 10) / 10;

/**
 * @param {Array<object>} plies  one side's ply records (as stored on game_analyses.plies)
 * @param {{baseSeconds?: number|null}} meta
 */
export function timeUse(plies = [], { baseSeconds = null } = {}) {
  const moves = (plies || [])
    .filter((p) => p && Number.isFinite(p.moveSeconds))
    .map((p) => {
      const cls = classifyPly(p);
      return {
        ply: p.ply,
        fullmove: p.fullmove ?? Math.ceil((p.ply ?? 0) / 2),
        san: p.san,
        seconds: Math.max(0, p.moveSeconds),
        clockBefore: Number.isFinite(p.clockBefore) ? p.clockBefore : null,
        label: cls.label,
        phase: p.phase ?? null,
      };
    });

  if (!moves.length) return { available: false, moves: [], rushed: [], troubleFromMove: null };

  const rushed = moves.filter(
    (m) =>
      (m.label === 'mistake' || m.label === 'blunder')
      && m.seconds < FAST_MOVE_SECONDS
      && m.clockBefore != null
      && m.clockBefore > RUSHED_MIN_CLOCK_SECONDS,
  );

  const troubleLine = baseSeconds
    ? Math.max(TROUBLE_FLOOR_SECONDS, baseSeconds * TROUBLE_FRACTION)
    : TROUBLE_FLOOR_SECONDS;
  const firstTrouble = moves.find((m) => m.clockBefore != null && m.clockBefore < troubleLine);

  const total = moves.reduce((s, m) => s + m.seconds, 0);
  const byPhase = {};
  for (const m of moves) {
    if (!m.phase) continue;
    (byPhase[m.phase] ||= { seconds: 0, moves: 0 });
    byPhase[m.phase].seconds += m.seconds;
    byPhase[m.phase].moves += 1;
  }
  for (const key of Object.keys(byPhase)) {
    byPhase[key].average = round1(byPhase[key].seconds / byPhase[key].moves);
  }

  const longest = moves.reduce((a, b) => (b.seconds > a.seconds ? b : a));
  const lastClock = [...moves].reverse().find((m) => m.clockBefore != null)?.clockBefore ?? null;

  return {
    available: true,
    moves,
    rushed,
    troubleFromMove: firstTrouble ? firstTrouble.fullmove : null,
    averageSeconds: round1(total / moves.length),
    totalSeconds: Math.round(total),
    byPhase,
    longest: { fullmove: longest.fullmove, san: longest.san, seconds: Math.round(longest.seconds) },
    // Share of the starting clock used. Only meaningful when we know the base.
    shareUsed: baseSeconds && lastClock != null ? round1(Math.min(1, 1 - lastClock / baseSeconds) * 100) : null,
  };
}

/** One plain-English line for the player, or null when there's nothing worth saying. */
export function timeUseHeadline(report) {
  if (!report?.available) return null;
  if (report.rushed.length) {
    const first = report.rushed[0];
    const n = report.rushed.length;
    return `${n === 1 ? 'One mistake was' : `${n} mistakes were`} played in under ${FAST_MOVE_SECONDS} seconds with plenty of time left (first: move ${first.fullmove}, ${first.san}). Slowing down there is free points.`;
  }
  if (report.troubleFromMove != null) {
    return `You were short of time from move ${report.troubleFromMove}. Spending less early leaves time for the hard part.`;
  }
  return null;
}

/** Starting clock in seconds from a PGN's TimeControl tag ("600+5" → 600), or null. */
export function baseSecondsFromPgn(pgn) {
  const tag = /\[TimeControl\s+"([^"]*)"\]/.exec(String(pgn || ''))?.[1];
  if (!tag || tag === '-' || tag === '?') return null;
  // Daily games ("1/259200") aren't played against a running clock.
  if (tag.includes('/')) return null;
  const base = Number(tag.split('+')[0]);
  return Number.isFinite(base) && base > 0 ? base : null;
}
