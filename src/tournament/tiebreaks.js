/*
 * tiebreaks.js — standings with the US Chess tiebreak set (F080, D4).
 *
 * Five systems, from US Chess rule 34E:
 *
 *   modifiedMedian   opponents' adjusted scores, less the extremes: a plus
 *                    score drops the lowest, a minus score drops the highest,
 *                    exactly 50% drops both (two each way from 9 rounds up).
 *   solkoff          opponents' adjusted scores, nothing dropped.
 *   cumulative       the player's running score summed round by round, less
 *                    the points they got without playing (see below).
 *   oppCumulative    the cumulative tiebreaks of the opponents they played.
 *   sonnebornBerger  adjusted scores of opponents beaten, plus half of those
 *                    drawn.
 *
 * The default order is the one US Chess scholastic events announce for
 * individuals: modified median, Solkoff, cumulative, opposition cumulative,
 * then Sonneborn-Berger. Rule 34A says to announce the order in advance, so
 * it is stored per event and the coach can change it before round 1 if the
 * district announces something else.
 *
 * UNPLAYED GAMES (byes, forfeits, rounds missed by a withdrawal or a late
 * entry) — the part every TD program documents because it is where they
 * differ. This one does what 34E says, as follows:
 *
 *   - An OPPONENT's unplayed games count as draws when working out that
 *     opponent's "adjusted score". A player should not be punished in the
 *     tiebreaks because the person they beat later withdrew.
 *   - A player's OWN unplayed game counts as an "opponent" with an adjusted
 *     score of zero in median, Solkoff and Sonneborn-Berger. A bye or a
 *     forfeit win earns the point, never tiebreak credit.
 *   - Cumulative subtracts the points from unplayed games once (1 for a
 *     full-point bye or forfeit win, ½ for a half-point bye), so a round-1
 *     bye does not outrank a round-1 win.
 *   - Opposition cumulative only sums opponents actually played.
 *
 * Standings are computed through a round (default: the last complete one),
 * so a half-entered round never reshuffles the table.
 *
 * Pure: no React, no Supabase.
 */

import { outcomeFor, lastCompleteRound } from './results.js';
import { compareSeeds } from './seeding.js';

export const TIEBREAKS = [
  { id: 'modifiedMedian', label: 'Modified median', short: 'MM' },
  { id: 'solkoff', label: 'Solkoff', short: 'Solk' },
  { id: 'cumulative', label: 'Cumulative', short: 'Cum' },
  { id: 'oppCumulative', label: 'Opposition cumulative', short: 'OppC' },
  { id: 'sonnebornBerger', label: 'Sonneborn-Berger', short: 'SB' },
];

export const DEFAULT_TIEBREAK_ORDER = ['modifiedMedian', 'solkoff', 'cumulative', 'oppCumulative', 'sonnebornBerger'];

const KNOWN = new Set(TIEBREAKS.map((t) => t.id));

/** Keep known ids once each, in the given order; nothing usable → the default. */
export function normaliseTiebreakOrder(order) {
  const seen = new Set();
  const cleaned = (Array.isArray(order) ? order : []).filter((id) => {
    if (!KNOWN.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return cleaned.length ? cleaned : [...DEFAULT_TIEBREAK_ORDER];
}

export function tiebreakLabel(id) {
  return TIEBREAKS.find((t) => t.id === id)?.label || id;
}

/**
 * The modified median of a list of opponent scores (34E1).
 * `score` and `rounds` decide which end is dropped.
 */
export function modifiedMedianOf(values, score, rounds) {
  const sorted = [...values].sort((a, b) => a - b);
  const cut = rounds >= 9 ? 2 : 1;
  const half = rounds / 2;
  let low = 0;
  let high = 0;
  if (score > half) low = cut;
  else if (score < half) high = cut;
  else {
    low = cut;
    high = cut;
  }
  const kept = sorted.slice(low, Math.max(low, sorted.length - high));
  return kept.reduce((sum, v) => sum + v, 0);
}

/** Every entrant's per-round outcomes through `rounds` (null where they were not paired). */
function tableOf(entrants, rows, rounds) {
  const byRound = new Map();
  for (const row of rows || []) {
    if (row.round < 1 || row.round > rounds) continue;
    for (const id of [row.white, row.black]) {
      if (!id) continue;
      byRound.set(`${id}|${row.round}`, outcomeFor(row, id));
    }
  }
  const table = new Map();
  for (const e of entrants) {
    const outcomes = [];
    for (let r = 1; r <= rounds; r += 1) outcomes.push(byRound.get(`${e.playerId}|${r}`) || null);
    table.set(e.playerId, outcomes);
  }
  return table;
}

/**
 * Standings through a round.
 *
 * @param {object} args
 * @param {Array}  args.entrants      [{ playerId, name, rating, withdrawnFromRound?, lateEntryRound? }]
 * @param {Array}  args.rows          every pairing row of the event
 * @param {number} [args.throughRound] default: the last complete round
 * @param {Array}  [args.order]       tiebreak ids, in priority order
 * @returns {{ throughRound, order, rows: Array<{ rank, tied, playerId, name, rating, score,
 *            adjusted, tiebreaks, outcomes }> }}
 */
export function computeStandings({ entrants = [], rows = [], throughRound, order } = {}) {
  const rounds = Number.isInteger(throughRound) && throughRound >= 0 ? throughRound : lastCompleteRound(rows);
  const tieOrder = normaliseTiebreakOrder(order);
  const table = tableOf(entrants, rows, rounds);

  const score = new Map();
  const adjusted = new Map();
  for (const e of entrants) {
    const outcomes = table.get(e.playerId);
    score.set(e.playerId, outcomes.reduce((sum, o) => sum + (o?.points ?? 0), 0));
    adjusted.set(e.playerId, outcomes.reduce((sum, o) => sum + (o?.played ? o.points : 0.5), 0));
  }

  const cumulative = new Map();
  for (const e of entrants) {
    let running = 0;
    let total = 0;
    let unplayedPoints = 0;
    for (const o of table.get(e.playerId)) {
      running += o?.points ?? 0;
      total += running;
      if (o && !o.played) unplayedPoints += o.points ?? 0;
    }
    cumulative.set(e.playerId, total - unplayedPoints);
  }

  const standings = entrants.map((e) => {
    const outcomes = table.get(e.playerId);
    // Own unplayed rounds (no row at all, a bye, a forfeit) are an opponent on zero.
    const oppScores = outcomes.map((o) => (o?.played && adjusted.has(o.opponent) ? adjusted.get(o.opponent) : 0));
    const played = outcomes.filter((o) => o?.played && adjusted.has(o.opponent));
    const own = score.get(e.playerId);
    const tiebreaks = {
      modifiedMedian: modifiedMedianOf(oppScores, own, rounds),
      solkoff: oppScores.reduce((sum, v) => sum + v, 0),
      cumulative: cumulative.get(e.playerId),
      oppCumulative: played.reduce((sum, o) => sum + cumulative.get(o.opponent), 0),
      sonnebornBerger: played.reduce((sum, o) => sum + o.points * adjusted.get(o.opponent), 0),
    };
    return {
      playerId: e.playerId,
      name: e.name || e.playerId,
      rating: e.rating ?? null,
      withdrawnFromRound: e.withdrawnFromRound ?? null,
      score: own,
      adjusted: adjusted.get(e.playerId),
      tiebreaks,
      outcomes,
    };
  });

  const compare = (a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    for (const id of tieOrder) {
      const d = b.tiebreaks[id] - a.tiebreaks[id];
      if (Math.abs(d) > 1e-9) return d;
    }
    return 0;
  };
  // Seed order settles what no tiebreak can, so the table is stable; the
  // rank number still shows the tie (US Chess ends in a coin toss, which is
  // for the coach to do in the room, not for the app to fake).
  standings.sort((a, b) => compare(a, b) || compareSeeds(a, b));
  standings.forEach((row, i) => {
    const prev = standings[i - 1];
    row.rank = prev && compare(prev, row) === 0 ? prev.rank : i + 1;
  });
  standings.forEach((row, i) => {
    const next = standings[i + 1];
    const prev = standings[i - 1];
    row.tied = !!((prev && prev.rank === row.rank) || (next && next.rank === row.rank));
  });

  return { throughRound: rounds, order: tieOrder, rows: standings };
}

/** Half points as the wall chart prints them: 2½, ½, 3. */
export function formatPoints(value) {
  if (value == null || Number.isNaN(value)) return '';
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  if (Math.abs(frac - 0.5) < 1e-9) return whole ? `${whole}½` : '½';
  if (Math.abs(frac) < 1e-9) return String(whole);
  return value.toFixed(2).replace(/0+$/, '');
}
