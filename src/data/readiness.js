/*
 * readiness.js — is a registered player ready for the tournament? (F074)
 *
 * Pure logic. Five checks, from the research's per-player checklist:
 *
 *   1. Rules quiz passed (80%+)                     — prep_results
 *   2. Notation: a 40-move game written at 95%+     — prep_results
 *   3. Two slow games, G/30 or longer               — the games archive
 *   4. Endgame band set                             — not built yet (F028)
 *   5. Mini-repertoire reviewed                     — the coach's manual tick
 *
 * A check that does not exist in the app yet is shown as "coming soon" and
 * left OUT of the percentage. Counting it as not done would cap every
 * player at 80% for a reason no player can fix.
 *
 * Slow games: only games played in the app (club games and games against the
 * computer) or entered from an over-the-board scoresheet count — Chess.com
 * and Lichess games do not, because the point is rehearsing a long game under
 * tournament conditions. The time control is read from the PGN's TimeControl
 * tag, which the Play page writes itself and a pasted scoresheet PGN can carry.
 */

import { chicagoDate, isIsoDate } from './officialEvents.js';
import { resultFor } from './prepResults.js';
import { BANDS, bandForRating, bandProgress } from '../training/endgames.js';

/** G/30: the shortest control the research counts as a slow game (F036, F074). */
export const SLOW_GAME_MIN_SECONDS = 30 * 60;
export const SLOW_GAMES_NEEDED = 2;
/** Fewer half-moves than this is an aborted start, not a game played. */
export const SLOW_GAME_MIN_PLIES = 10;
/** Modes that are over-the-board or in-app play; online imports are left out. */
export const SLOW_GAME_MODES = ['human', 'computer'];

/** The value of one PGN tag, or ''. */
export function pgnTag(pgn, name) {
  const match = new RegExp(`\\[${name}\\s+"([^"]*)"\\]`).exec(String(pgn ?? ''));
  return match ? match[1].trim() : '';
}

/**
 * The starting time, in seconds, that a TimeControl tag gives each player.
 * Understands the PGN standard ("1800", "1800+5", "40/5400:1800") and the
 * way US scholastic events write it ("G/30;d5", "G/30 d5", "G30").
 * Returns null when there is no usable clock ("-", "?", blank, junk).
 */
export function baseSecondsFromTimeControl(tag) {
  const text = String(tag ?? '').trim();
  if (!text || text === '-' || text === '?') return null;

  const uscf = /^G\s*\/?\s*(\d{1,3})(?:\b|[;\s+])/i.exec(text);
  if (uscf) return Number(uscf[1]) * 60;

  // First period of a PGN control: "moves/seconds" or plain "seconds",
  // optionally followed by "+increment" and further ":"-separated periods.
  const first = text.split(':')[0];
  const pgn = /^(?:\d+\/)?(\d+)(?:\+\d+)?$/.exec(first);
  if (pgn) return Number(pgn[1]);
  return null;
}

/** A game long enough, slow enough and played the right way to count. */
export function isSlowGame(game) {
  if (!game || !SLOW_GAME_MODES.includes(game.mode)) return false;
  if ((game.moveCount ?? 0) < SLOW_GAME_MIN_PLIES) return false;
  const base = baseSecondsFromTimeControl(pgnTag(game.pgn, 'TimeControl'));
  return base != null && base >= SLOW_GAME_MIN_SECONDS;
}

/** Aug 1 of the school year an event falls in: the start of the season. */
export function seasonStart(eventDate) {
  if (!isIsoDate(eventDate)) return null;
  const [y, m] = eventDate.split('-').map(Number);
  return `${m >= 8 ? y : y - 1}-08-01`;
}

/**
 * One player's slow games between two calendar dates (inclusive), read in
 * Chicago time so a Tuesday-evening game is not filed under Wednesday.
 */
export function slowGamesFor(playerId, games, { since = null, until = null } = {}) {
  if (!playerId) return [];
  return (games || []).filter((g) => {
    if (g?.whitePlayerId !== playerId && g?.blackPlayerId !== playerId) return false;
    if (!isSlowGame(g)) return false;
    const day = chicagoDate(g.playedAt);
    if (!day) return false;
    if (since && day < since) return false;
    if (until && day > until) return false;
    return true;
  });
}

export const READINESS_ITEMS = {
  rules: 'Rules quiz passed',
  notation: 'Notation: 40-move game at 95%+',
  slowGames: `${SLOW_GAMES_NEEDED} slow games (G/30 or longer)`,
  endgame: 'Endgame band set',
  repertoire: 'Mini-repertoire reviewed with the coach',
};

const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * The checklist for one player and one event.
 *
 * Returns `{ items, done, counted, percent }`; each item is
 * `{ key, label, status: 'done' | 'todo' | 'coming-soon', detail }`.
 * `registration` is the player's registration row for the event, if any.
 */
export function readinessFor({ playerId, results = [], games = [], event = null, registration = null, endgameAvailable = false, endgame = null }) {
  const rules = resultFor(results, playerId, 'rules-quiz');
  const notation = resultFor(results, playerId, 'notation-game-type');
  const since = event ? seasonStart(event.date) : null;
  const until = event && isIsoDate(event.date) ? event.date : null;
  const slow = slowGamesFor(playerId, games, { since, until });

  const items = [
    {
      key: 'rules',
      label: READINESS_ITEMS.rules,
      status: rules?.passedAt ? 'done' : 'todo',
      detail: rules?.best ? `Best ${rules.best.score}/${rules.best.total}` : 'Not taken yet',
    },
    {
      key: 'notation',
      label: READINESS_ITEMS.notation,
      status: notation?.passedAt ? 'done' : 'todo',
      detail: notation?.best ? `Best ${pct(notation.best.accuracy)} on the 40-move game` : 'Not tried yet',
    },
    {
      key: 'slowGames',
      label: READINESS_ITEMS.slowGames,
      status: slow.length >= SLOW_GAMES_NEEDED ? 'done' : 'todo',
      detail: `${Math.min(slow.length, SLOW_GAMES_NEEDED)} of ${SLOW_GAMES_NEEDED} this season`,
    },
    endgame
      ? {
          key: 'endgame',
          label: READINESS_ITEMS.endgame,
          status: endgame.done ? 'done' : 'todo',
          detail: `${endgame.passed} of ${endgame.total} drills passed${endgame.label ? ` (${endgame.label})` : ''}`,
        }
      : {
          key: 'endgame',
          label: READINESS_ITEMS.endgame,
          status: endgameAvailable ? 'todo' : 'coming-soon',
          detail: endgameAvailable ? 'Not set yet' : 'Coming soon',
        },
    {
      key: 'repertoire',
      label: READINESS_ITEMS.repertoire,
      status: registration?.repertoireReviewed ? 'done' : 'todo',
      detail: registration ? (registration.repertoireReviewed ? 'Ticked by the coach' : 'The coach ticks this') : 'Once registered, the coach ticks this',
    },
  ];

  const counted = items.filter((i) => i.status !== 'coming-soon').length;
  const done = items.filter((i) => i.status === 'done').length;
  return { items, done, counted, percent: counted ? Math.round((done / counted) * 100) : 0 };
}

/**
 * The endgame-trainer band for a player (from their US Chess rating, as the
 * trainer picks it) and how many of its drills they have passed.
 */
export function endgameBandFor(attempts, player) {
  const band = bandForRating(player?.ratings?.uscf ?? null);
  const label = BANDS.find((b) => b.key === band)?.label ?? '';
  return { band, label, ...bandProgress(attempts, player?.playerId, band) };
}

/**
 * Readiness for many players at once, keyed by player id. The page uses it
 * for the coach's table and to order registration suggestions.
 */
export function readinessByPlayer({ players = [], results = [], games = [], event = null, registrations = [], attempts = null }) {
  const out = new Map();
  for (const player of players) {
    if (!player?.playerId) continue;
    const registration =
      registrations.find((r) => r.playerId === player.playerId && (!event || r.eventId === event.id)) || null;
    // With puzzle attempts supplied, the endgame item is the player's own band
    // in the endgame trainer (rated on US Chess, like the trainer's default).
    const endgame = attempts ? endgameBandFor(attempts, player) : null;
    out.set(player.playerId, readinessFor({ playerId: player.playerId, results, games, event, registration, endgame }));
  }
  return out;
}
