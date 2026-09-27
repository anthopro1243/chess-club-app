/*
 * homework.js — what a homework assignment is, and whether someone has done it.
 *
 * The coach sets one of three things, with a due date:
 *   - a THEME   ("solve 5 forks, easy ones, by Tuesday"),
 *   - a SET     ("these six puzzles, by Tuesday"),
 *   - GAMES     ("play 3 games at 25 minutes or longer, by Tuesday").
 *
 * Nothing records completion, and nobody reports it. It is computed every
 * time from what already exists: puzzle_attempts (which the Training page
 * writes for every attempt) and the game archive (which fills itself from
 * the Play page, Chess.com/Lichess sync, PGN import and scoresheet entry).
 * A stored "done" flag would be a second copy of those facts, and the two
 * would drift the first time an attempt synced late or a coach deleted a
 * bad row.
 *
 * Pure: no React, no Supabase, no puzzles.json import (that needs Vite's JSON
 * loader). Callers pass the catalogue, roster and archive in, so every rule
 * here runs under `node --test`.
 */

import { estimatedMinutes, timeControlOfGame } from './timeControl.js';

export const DEFAULT_REQUIRED = 5;
export const MAX_REQUIRED = 50;
export const MAX_SET_SIZE = 50;
export const DEFAULT_GAMES = 3;
export const MAX_GAMES = 20;
export const NOTE_MAX = 200;

/*
 * "At least X minutes" choices for a games assignment, as estimated minutes
 * per player (timeControl.js → estimatedMinutes). 0 means any game counts.
 * 25 is there because G/25;d5 is the quickest control a scholastic flyer
 * uses, and "25+" is how a coach says "tournament speed".
 */
export const GAME_MINUTE_OPTIONS = [0, 10, 15, 25, 30, 60];
export const DEFAULT_GAME_MINUTES = 25;

/*
 * A game this short is an abort, an instant resignation or a four-move mate,
 * none of which is the practice a "play N games" assignment asks for.
 */
export const MIN_GAME_PLIES = 10;

const FINISHED_RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);

/** How long a finished assignment stays on a trainee's list after it was due. */
export const RECENT_DONE_DAYS = 14;

/*
 * How long an UNFINISHED assignment stays on a trainee's own list after it
 * was due. The coach's report keeps it forever; the player's list lets it go
 * after four weeks, because a growing pile of red "overdue" rows is the
 * public-shame pattern the research says to avoid, and it tells a player
 * nothing a coach cannot tell them better in person.
 */
export const OVERDUE_VISIBLE_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

/*
 * The same bands, with the same keys, as DIFFICULTIES in TrainingPage.jsx.
 * puzzle_attempts.difficulty stores the KEY the Training page computed at the
 * time, and that stored key is what a difficulty-limited assignment matches
 * on, so the keys here must never drift from the page's. The ranges are only
 * used to count how many puzzles an assignment can draw from.
 */
export const HOMEWORK_DIFFICULTIES = [
  { key: 'beginner', label: 'Beginner (< 1000)', min: -Infinity, max: 1000 },
  { key: 'easy', label: 'Easy (1000–1400)', min: 1000, max: 1400 },
  { key: 'intermediate', label: 'Intermediate (1400–1800)', min: 1400, max: 1800 },
  { key: 'hard', label: 'Hard (1800–2200)', min: 1800, max: 2200 },
  { key: 'expert', label: 'Expert (2200+)', min: 2200, max: Infinity },
];

const DIFFICULTY_KEYS = new Set(HOMEWORK_DIFFICULTIES.map((d) => d.key));

export const STATUS_LABEL = {
  done: 'Done',
  'in-progress': 'In progress',
  'not-started': 'Not started',
  overdue: 'Overdue',
};

/** Which band a puzzle rating falls in, or '' for a rating that is not a number. */
export function difficultyBandFor(rating) {
  if (typeof rating !== 'number' || Number.isNaN(rating)) return '';
  return HOMEWORK_DIFFICULTIES.find((d) => rating >= d.min && rating < d.max)?.key || '';
}

/** "backRankMate" → "Back Rank Mate", exactly as the Training page's theme dropdown reads. */
export function themeLabel(theme) {
  return String(theme || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\b(In|Vs)\b/g, (w) => w.toLowerCase());
}

/** Library puzzles on a theme, optionally within one difficulty band. */
export function puzzlesMatching(puzzles, { theme, difficulty = '' } = {}) {
  return (puzzles || []).filter(
    (p) =>
      p &&
      (p.themes || []).includes(theme) &&
      (!difficulty || difficultyBandFor(p.rating) === difficulty),
  );
}

// -- dates ----------------------------------------------------------------

// Accepts a Date, epoch milliseconds or an ISO string — callers pass all three.
const toMs = (value) => {
  if (value == null || value === '') return null;
  const ms =
    value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const pad = (n) => String(n).padStart(2, '0');

/** A Date as the YYYY-MM-DD a date input shows, in the viewer's own time zone. */
export function localDateString(value) {
  const ms = toMs(value);
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Midnight at the start of that instant's local day, as epoch ms. */
function startOfLocalDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/*
 * "Due Tuesday" means by the end of Tuesday where the club is, not at
 * midnight UTC — which in Dallas is 7pm on Monday. The coach's browser is in
 * the club's time zone, so the end of the local day is converted to an
 * instant here and stored as one; nobody downstream has to guess a zone.
 */
export function dueAtFromDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ''));
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  // new Date() rolls 30 February over into March; that is a typo, not a date.
  if (end.getFullYear() !== year || end.getMonth() !== month - 1 || end.getDate() !== day) return null;
  return end.toISOString();
}

/**
 * The next club day strictly after today, as YYYY-MM-DD. The club meets on
 * Tuesdays (weekday 2), and homework set at one meeting is naturally due at
 * the next — including when it is set on a Tuesday.
 */
export function defaultDueDate(now = new Date(), weekday = 2) {
  const d = new Date(toMs(now) ?? Date.now());
  const ahead = ((weekday - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + ahead);
  return localDateString(d);
}

// -- groups -----------------------------------------------------------------

const gradeOf = (player) => {
  const n = Number.parseInt(String(player?.grade ?? '').replace(/\D+/g, ''), 10);
  return n >= 9 && n <= 12 ? n : null;
};

const isActive = (p) => p && p.playerId && !p.deletedAt;

/**
 * The groups a coach can set homework for, built from what the roster
 * already records: tournament commitment and grade. There is no separate
 * "groups" table (skill groups are their own, later feature), so a group is
 * a snapshot: it is expanded to its members when the homework is set, and
 * someone who changes grade next week keeps this week's homework.
 *
 * Only groups with at least one active member are offered.
 */
export function rosterGroups(players) {
  const active = (players || []).filter(isActive);
  const groups = [];
  const add = (key, label, members) => {
    if (members.length) groups.push({ key, label, playerIds: members.map((p) => p.playerId) });
  };
  add('commitment:Competitive', 'Tournament players', active.filter((p) => p.commitment === 'Competitive'));
  add('commitment:Casual', 'Casual members', active.filter((p) => p.commitment !== 'Competitive'));
  // Scholastic sections split 9–10 from 11–12, so those are offered as pairs.
  add('grades:9-10', 'Grades 9–10', active.filter((p) => [9, 10].includes(gradeOf(p))));
  add('grades:11-12', 'Grades 11–12', active.filter((p) => [11, 12].includes(gradeOf(p))));
  for (const grade of [9, 10, 11, 12]) {
    add(`grade:${grade}`, `Grade ${grade}`, active.filter((p) => gradeOf(p) === grade));
  }
  return groups;
}

// -- building an assignment ------------------------------------------------

const wholeNumber = (raw, fallback) => Number(raw === '' || raw == null ? fallback : raw);

/**
 * Validate what the coach filled in and turn it into a stored assignment.
 *
 * Returns `{ ok: true, assignment }` or `{ ok: false, errors }`, where each
 * error is `{ field, message }`. `themes` and `puzzles` are the library
 * (PUZZLE_THEMES and PUZZLES); `players` is the visible roster.
 *
 * Who it is for:
 *   - 'club'    — every member, read by any approved member through
 *                 is_approved() in 0020. No player ids are stored, so a
 *                 member who joins before it is due gets it too.
 *   - 'group'   — a roster group (rosterGroups), expanded to its members now.
 *   - 'players' — the members the coach ticked.
 * Group and chosen-player homework are stored as target rows, which a member
 * can read only when the row names them (owns_player in 0020): "extra pawn
 * endgames for X" is a judgement about a child and stays owner-or-coach.
 */
export function buildAssignment(
  draft = {},
  { themes = [], puzzles = [], players = [], now = new Date(), id } = {},
) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const nowMs = toMs(now) ?? Date.now();

  const kind = ['theme', 'set', 'games'].includes(draft.kind) ? draft.kind : null;
  if (!kind) fail('kind', 'Choose puzzles on a theme, a puzzle set, or games to play.');

  let theme = null;
  let difficulty = null;
  let requiredCount = null;
  let puzzleIds = [];
  let minMinutes = null;

  if (kind === 'theme') {
    theme = String(draft.theme || '');
    difficulty = draft.difficulty ? String(draft.difficulty) : null;
    if (!theme) fail('theme', 'Choose a theme.');
    else if (!themes.includes(theme)) fail('theme', `"${theme}" is not a theme in the puzzle library.`);
    if (difficulty && !DIFFICULTY_KEYS.has(difficulty)) {
      fail('difficulty', `"${difficulty}" is not a difficulty band.`);
      difficulty = null;
    }

    requiredCount = wholeNumber(draft.requiredCount, DEFAULT_REQUIRED);
    if (!Number.isInteger(requiredCount) || requiredCount < 1 || requiredCount > MAX_REQUIRED) {
      fail('requiredCount', `The number of puzzles must be a whole number from 1 to ${MAX_REQUIRED}.`);
    } else if (theme && themes.includes(theme)) {
      // Asking for more puzzles than exist would make the homework impossible.
      const available = puzzlesMatching(puzzles, { theme, difficulty }).length;
      if (available < requiredCount) {
        fail(
          'requiredCount',
          available
            ? `Only ${available} ${themeLabel(theme).toLowerCase()} puzzle${available === 1 ? '' : 's'} match${available === 1 ? 'es' : ''}${difficulty ? ' at that difficulty' : ''}; ask for ${available} or fewer.`
            : `No ${themeLabel(theme).toLowerCase()} puzzles match${difficulty ? ' at that difficulty' : ''}.`,
        );
      }
    }
  }

  if (kind === 'set') {
    const known = new Set((puzzles || []).map((p) => p && p.id));
    puzzleIds = [...new Set((draft.puzzleIds || []).map(String))];
    if (!puzzleIds.length) fail('puzzleIds', 'Pick at least one puzzle for the set.');
    else if (puzzleIds.length > MAX_SET_SIZE) fail('puzzleIds', `A set can hold at most ${MAX_SET_SIZE} puzzles.`);
    const unknown = puzzleIds.filter((pid) => !known.has(pid));
    if (unknown.length) fail('puzzleIds', `Not in the puzzle library: ${unknown.join(', ')}.`);
  }

  if (kind === 'games') {
    requiredCount = wholeNumber(draft.requiredCount, DEFAULT_GAMES);
    if (!Number.isInteger(requiredCount) || requiredCount < 1 || requiredCount > MAX_GAMES) {
      fail('requiredCount', `The number of games must be a whole number from 1 to ${MAX_GAMES}.`);
    }
    minMinutes = wholeNumber(draft.minMinutes, DEFAULT_GAME_MINUTES);
    if (!GAME_MINUTE_OPTIONS.includes(minMinutes)) {
      fail('minMinutes', `Choose a time control from the list (${GAME_MINUTE_OPTIONS.join(', ')} minutes).`);
    }
  }

  const active = (players || []).filter(isActive);
  const activeIds = new Set(active.map((p) => p.playerId));
  const audience = ['club', 'group', 'players'].includes(draft.audience) ? draft.audience : null;
  let playerIds = [];
  let groupKey = null;
  let groupLabel = null;
  if (!audience) fail('audience', 'Choose who the homework is for.');
  else if (audience === 'club') {
    if (!active.length) fail('audience', 'There is nobody on the roster to assign it to.');
  } else if (audience === 'group') {
    const group = rosterGroups(players).find((g) => g.key === draft.groupKey);
    if (!group) fail('audience', 'Choose a group.');
    else {
      groupKey = group.key;
      groupLabel = group.label;
      playerIds = group.playerIds;
    }
  } else {
    playerIds = [...new Set((draft.playerIds || []).map(String))];
    if (!playerIds.length) fail('audience', 'Pick at least one player.');
    const strangers = playerIds.filter((pid) => !activeIds.has(pid));
    if (strangers.length) fail('audience', `Not on the roster: ${strangers.join(', ')}.`);
  }

  const dueMs = toMs(draft.dueAt);
  if (dueMs == null) fail('dueAt', 'Choose a due date.');
  else if (dueMs <= nowMs) fail('dueAt', 'The due date has already passed.');

  const note = String(draft.note || '').trim();
  if (note.length > NOTE_MAX) fail('note', `Keep the note under ${NOTE_MAX} characters.`);

  if (!id) fail('id', 'An assignment needs an id.');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    assignment: {
      id,
      kind,
      theme,
      difficulty,
      requiredCount,
      puzzleIds,
      minMinutes,
      audience,
      groupKey,
      groupLabel,
      playerIds,
      note,
      dueAt: new Date(dueMs).toISOString(),
      createdAt: new Date(nowMs).toISOString(),
    },
  };
}

// -- who it is for ----------------------------------------------------------

/*
 * Club-wide homework is for every member who was on the roster by the day it
 * was due. Someone who joined afterwards could never have done it, and
 * without this they would open the app to an "overdue" row on day one and
 * sit as a permanent "not done" in the coach's report. `joined` is a
 * YYYY-MM-DD (or empty, which counts as "always been here").
 */
function joinedInTime(assignment, joined) {
  if (!joined) return true;
  const dueDay = localDateString(assignment?.dueAt);
  return !dueDay || String(joined).slice(0, 10) <= dueDay;
}

/** Is this assignment for this player? `player` is `{ playerId, joined? }`. */
export function isTargetOf(assignment, player) {
  if (!assignment || !player?.playerId) return false;
  if (assignment.audience === 'club') return joinedInTime(assignment, player.joined);
  return (assignment.playerIds || []).includes(player.playerId);
}

// -- progress -------------------------------------------------------------

/** How many things (puzzles or games) an assignment asks for. */
export function requiredFor(assignment) {
  if (!assignment) return 0;
  if (assignment.kind === 'set') return (assignment.puzzleIds || []).length;
  if (assignment.kind === 'games') return assignment.requiredCount || DEFAULT_GAMES;
  return assignment.requiredCount || DEFAULT_REQUIRED;
}

/*
 * Which attempts belong to an assignment. Own-game puzzles ("own:…" ids from
 * the Your mistakes mode) never count: their themes come from the analyser,
 * their rating is a placeholder 0 that would read as "beginner", and the
 * coach picked a theme from the library, which is where the drill link goes.
 */
function matcherFor(assignment) {
  if (assignment.kind === 'set') {
    const wanted = new Set(assignment.puzzleIds || []);
    return (attempt) => wanted.has(attempt.puzzleId);
  }
  if (assignment.kind === 'theme') {
    return (attempt) =>
      !String(attempt.puzzleId).startsWith('own:') &&
      (attempt.themes || []).includes(assignment.theme) &&
      (!assignment.difficulty || attempt.difficulty === assignment.difficulty);
  }
  return () => false;
}

const spoils = (attempt) => !!attempt.usedHint || !!attempt.usedSolution;

/*
 * Puzzle progress: the first CLEAN solve of each distinct puzzle, in time
 * order.
 *
 * A solve counts only when it was the player's own. Taking a hint or showing
 * the answer is still practice (the status moves to "in progress"), but it
 * spoils that puzzle for this assignment: the Training page's Reset button
 * clears the hint flag, so "Show answer, Reset, play the moves you were just
 * shown" would otherwise log a clean solve.
 *
 * A correct attempt after a WRONG move on the same puzzle does count. That is
 * what the Training page itself treats as solved (the puzzle stays on the
 * board after a miss), and a stricter first-try rule would make a fixed set
 * impossible to finish after one slip. The number of attempts is reported
 * alongside, so the coach can tell 5 of 5 in 5 tries from 5 of 5 in 40.
 */
function puzzleProgress(assignment, attempts, playerId, windowStart) {
  const matches = matcherFor(assignment);
  const counted = [];
  for (const attempt of attempts || []) {
    if (!attempt || attempt.playerId !== playerId || !attempt.puzzleId) continue;
    const at = toMs(attempt.attemptedAt);
    if (at == null || at < windowStart) continue;
    if (!matches(attempt)) continue;
    counted.push({ attempt, at });
  }
  counted.sort((a, b) => a.at - b.at);

  const spoiled = new Set();
  const firstSolve = new Map();
  for (const { attempt, at } of counted) {
    const pid = attempt.puzzleId;
    if (spoils(attempt)) {
      spoiled.add(pid);
      continue;
    }
    if (attempt.correct && !spoiled.has(pid) && !firstSolve.has(pid)) firstSolve.set(pid, at);
  }
  return {
    doneTimes: [...firstSolve.values()].sort((a, b) => a - b),
    activity: counted.map((c) => c.at),
  };
}

/**
 * Does one archived game count toward a games assignment? Exported so the
 * UI can say why a game did not count.
 *
 * @returns {'counts'|'not-theirs'|'unfinished'|'too-short'|'unknown-time'|'too-fast'}
 */
export function gameVerdict(game, playerId, minMinutes = 0) {
  if (!game || !playerId || (game.whitePlayerId !== playerId && game.blackPlayerId !== playerId)) {
    return 'not-theirs';
  }
  if (!FINISHED_RESULTS.has(game.result)) return 'unfinished';
  if ((game.moveCount || 0) < MIN_GAME_PLIES) return 'too-short';
  if (!minMinutes) return 'counts';
  const minutes = estimatedMinutes(timeControlOfGame(game));
  if (minutes == null) return 'unknown-time';
  // A hair of tolerance: 25 minutes estimated from a PGN rounded to seconds
  // must not miss a 25-minute threshold by a floating-point crumb.
  return minutes + 1e-9 >= minMinutes ? 'counts' : 'too-fast';
}

/*
 * Games progress. The window opens at the START of the day the homework was
 * set, not the minute: a scoresheet has a date and no time, and is stored at
 * noon UTC, so a game played on Tuesday evening after homework was set at
 * the Tuesday meeting would otherwise land "before" it.
 */
function gameProgress(assignment, games, playerId, createdMs) {
  const windowStart = startOfLocalDay(createdMs);
  const doneTimes = [];
  const activity = [];
  const seen = new Set();
  for (const game of games || []) {
    if (!game || !game.id || seen.has(game.id)) continue;
    const at = toMs(game.playedAt);
    if (at == null || at < windowStart) continue;
    const verdict = gameVerdict(game, playerId, assignment.minMinutes || 0);
    if (verdict === 'not-theirs') continue;
    seen.add(game.id);
    activity.push(at);
    if (verdict === 'counts') doneTimes.push(at);
  }
  doneTimes.sort((a, b) => a - b);
  activity.sort((a, b) => a - b);
  return { doneTimes, activity };
}

/**
 * One player's progress on one assignment.
 *
 * `attempts` is the puzzle-attempt list; `games` (in options) is the game
 * archive, needed only for a games assignment. Work after the due date still
 * counts, so late work is not lost, but an assignment finished after its
 * due date is flagged `late`. Each puzzle or game counts once.
 *
 * Returns `{ done, completed, required, attempts, lastAttemptAt, completedAt,
 * late, status }`, with status one of done / in-progress / not-started /
 * overdue. `attempts` is every relevant try (puzzle attempts, or finished
 * games of any speed), so "in progress" means "has started", not "is close".
 */
export function progressFor(assignment, attempts, playerId, { now = Date.now(), games = [] } = {}) {
  const required = requiredFor(assignment);
  const empty = {
    done: false,
    completed: 0,
    required,
    attempts: 0,
    lastAttemptAt: null,
    completedAt: null,
    late: false,
    status: 'not-started',
  };
  if (!assignment || !playerId) return empty;

  const createdMs = toMs(assignment.createdAt);
  const dueMs = toMs(assignment.dueAt);
  const nowMs = toMs(now) ?? Date.now();
  // Without a start time there is no window to count in, so nothing counts.
  if (createdMs == null) return empty;

  const { doneTimes, activity } =
    assignment.kind === 'games'
      ? gameProgress(assignment, games, playerId, createdMs)
      : puzzleProgress(assignment, attempts, playerId, createdMs);

  const completed = doneTimes.length;
  const done = required > 0 && completed >= required;
  const completedMs = done ? doneTimes[required - 1] : null;
  const late = done && dueMs != null && completedMs > dueMs;
  const overdue = !done && dueMs != null && nowMs > dueMs;

  return {
    done,
    completed,
    required,
    attempts: activity.length,
    lastAttemptAt: activity.length ? new Date(activity[activity.length - 1]).toISOString() : null,
    completedAt: completedMs != null ? new Date(completedMs).toISOString() : null,
    late,
    status: done ? 'done' : overdue ? 'overdue' : activity.length ? 'in-progress' : 'not-started',
  };
}

/**
 * A trainee's homework list: every assignment for them, with progress,
 * unfinished first (soonest due first, so overdue work leads), then
 * finished work, most recently due first.
 *
 * Finished work drops off `recentDoneDays` after its due date; unfinished
 * work drops off `overdueDays` after it (OVERDUE_VISIBLE_DAYS explains why).
 * `joined` is the player's join date, for club-wide homework.
 */
export function homeworkForPlayer(
  assignments,
  attempts,
  playerId,
  {
    now = Date.now(),
    games = [],
    joined = '',
    recentDoneDays = RECENT_DONE_DAYS,
    overdueDays = OVERDUE_VISIBLE_DAYS,
  } = {},
) {
  if (!playerId) return [];
  const nowMs = toMs(now) ?? Date.now();
  const player = { playerId, joined };
  const items = (assignments || [])
    .filter((a) => a && isTargetOf(a, player))
    .map((assignment) => ({
      assignment,
      progress: progressFor(assignment, attempts, playerId, { now: nowMs, games }),
    }))
    .filter(({ assignment, progress }) => {
      const dueMs = toMs(assignment.dueAt);
      if (dueMs == null) return true;
      const keepDays = progress.done ? recentDoneDays : overdueDays;
      return nowMs - dueMs <= keepDays * DAY_MS;
    });

  const due = (item) => toMs(item.assignment.dueAt) ?? Infinity;
  const open = items.filter((i) => !i.progress.done).sort((a, b) => due(a) - due(b));
  const finished = items.filter((i) => i.progress.done).sort((a, b) => due(b) - due(a));
  return [...open, ...finished];
}

const STATUS_ORDER = { overdue: 0, 'not-started': 1, 'in-progress': 2, done: 3 };

const percentOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * The coach's view of one assignment: a row per targeted player still on the
 * roster, the ones who have not done it first, plus counts per status and
 * the completion percentage. `removed` counts chosen targets who have since
 * left the roster; their rows are left out, the same as retired members
 * everywhere else.
 */
export function assignmentReport(assignment, attempts, players, { now = Date.now(), games = [] } = {}) {
  const active = (players || []).filter(isActive);
  const byId = new Map(active.map((p) => [p.playerId, p]));
  let targets;
  let removed = 0;
  if (assignment?.audience === 'club') {
    targets = active.filter((p) => isTargetOf(assignment, p)).map((p) => p.playerId);
  } else {
    const chosen = [...new Set(assignment?.playerIds || [])];
    targets = chosen.filter((pid) => byId.has(pid));
    removed = chosen.length - targets.length;
  }

  const rows = targets
    .map((pid) => ({
      playerId: pid,
      name: byId.get(pid).name || pid,
      progress: progressFor(assignment, attempts, pid, { now, games }),
    }))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.progress.status] - STATUS_ORDER[b.progress.status] ||
        String(a.name).localeCompare(String(b.name)),
    );

  const counts = { done: 0, 'in-progress': 0, 'not-started': 0, overdue: 0, total: rows.length };
  for (const row of rows) counts[row.progress.status] += 1;
  return { rows, counts, percent: percentOf(counts.done, counts.total), removed };
}

/**
 * Completion per player across the assignments given (the coach's list):
 * how many were set for them, how many are done, how many are overdue, and
 * the percentage. Lowest percentage first — who to talk to on Tuesday.
 * Players with nothing assigned are left out rather than shown as 0%.
 */
export function playerCompletion(assignments, attempts, players, { now = Date.now(), games = [] } = {}) {
  const active = (players || []).filter(isActive);
  const rows = [];
  for (const player of active) {
    let assigned = 0;
    let done = 0;
    let overdue = 0;
    for (const assignment of assignments || []) {
      if (!assignment || !isTargetOf(assignment, player)) continue;
      assigned += 1;
      const { status } = progressFor(assignment, attempts, player.playerId, { now, games });
      if (status === 'done') done += 1;
      else if (status === 'overdue') overdue += 1;
    }
    if (assigned) {
      rows.push({ playerId: player.playerId, name: player.name || player.playerId, assigned, done, overdue, percent: percentOf(done, assigned) });
    }
  }
  return rows.sort((a, b) => a.percent - b.percent || String(a.name).localeCompare(String(b.name)));
}

/**
 * The coach's list order: homework still running, soonest due first, then
 * homework whose due date has passed, most recent first. What the coach is
 * chasing this week sits at the top; last month's sits at the bottom.
 */
export function orderAssignments(assignments, { now = Date.now() } = {}) {
  const nowMs = toMs(now) ?? Date.now();
  const due = (a) => toMs(a.dueAt) ?? Infinity;
  const list = (assignments || []).filter(Boolean);
  const running = list.filter((a) => due(a) >= nowMs).sort((a, b) => due(a) - due(b));
  const past = list.filter((a) => due(a) < nowMs).sort((a, b) => due(b) - due(a));
  return [...running, ...past];
}

// -- labels and links -----------------------------------------------------

/** "25+ min", or "any speed" for 0. */
export function minutesLabel(minMinutes) {
  return minMinutes ? `${minMinutes}+ min` : 'any speed';
}

/** A one-line name: "Fork · 5 puzzles · Easy", "Play 3 games · 25+ min". */
export function assignmentTitle(assignment) {
  if (!assignment) return '';
  const required = requiredFor(assignment);
  if (assignment.kind === 'games') {
    return `Play ${required} game${required === 1 ? '' : 's'} · ${minutesLabel(assignment.minMinutes)}`;
  }
  const count = `${required} puzzle${required === 1 ? '' : 's'}`;
  if (assignment.kind === 'set') return `Puzzle set · ${count}`;
  const band = HOMEWORK_DIFFICULTIES.find((d) => d.key === assignment.difficulty);
  return [themeLabel(assignment.theme), count, band ? band.label.split(' (')[0] : null].filter(Boolean).join(' · ');
}

/** Who it is for, in words: "Whole club", "Tournament players", "3 players". */
export function audienceLabel(assignment) {
  if (!assignment) return '';
  if (assignment.audience === 'club') return 'Whole club';
  if (assignment.audience === 'group') return assignment.groupLabel || 'A group';
  const n = (assignment.playerIds || []).length;
  return `${n} player${n === 1 ? '' : 's'}`;
}

/** The unit an assignment counts, for "3 of 5 puzzles" / "1 of 3 games". */
export function unitFor(assignment, count = 2) {
  const noun = assignment?.kind === 'games' ? 'game' : 'puzzle';
  return count === 1 ? noun : `${noun}s`;
}

/**
 * Where "Practise" sends a trainee: the Training page's existing deep link,
 * pre-filtered to the assignment's theme and band, or to the exact set. A
 * games assignment goes to the Play page; online and scoresheet games count
 * too, but the Play page is the one place a game can start right now.
 */
export function drillLinkFor(assignment) {
  if (assignment?.kind === 'games') return '#/play';
  const params = new URLSearchParams();
  if (assignment?.kind === 'set') {
    params.set('puzzles', (assignment.puzzleIds || []).join(','));
  } else if (assignment?.theme) {
    params.set('theme', assignment.theme);
    if (assignment.difficulty) params.set('difficulty', assignment.difficulty);
  }
  const query = params.toString();
  return `#/training${query ? `?${query}` : ''}`;
}

/**
 * Read a Training deep link back. Anything not in the library is dropped
 * rather than trusted: a stale or hand-edited link should land on a working
 * page, not on an empty pool.
 */
export function parseTrainingLink(hash, { themes = [], puzzleIds = [] } = {}) {
  const out = { theme: '', difficulty: '', puzzleIds: [] };
  const query = String(hash || '').split('?')[1];
  if (!query) return out;
  const params = new URLSearchParams(query);

  const theme = params.get('theme');
  if (theme && themes.includes(theme)) out.theme = theme;

  const difficulty = params.get('difficulty');
  if (difficulty && DIFFICULTY_KEYS.has(difficulty)) out.difficulty = difficulty;

  const known = new Set(puzzleIds);
  const wanted = (params.get('puzzles') || '').split(',').map((s) => s.trim()).filter(Boolean);
  out.puzzleIds = [...new Set(wanted.filter((pid) => known.has(pid)))];
  return out;
}

/**
 * homeworkForPlayer() items in the shape the member's home page lists
 * (src/analysis/playerHome.js homeworkView): one line per assignment, with
 * its drill link and whether it is finished.
 */
export function toHomeItems(items, playerId) {
  return (items || [])
    .filter((item) => item?.assignment)
    .map(({ assignment, progress }) => ({
      id: assignment.id,
      title: assignmentTitle(assignment),
      dueAt: assignment.dueAt ?? null,
      done: Boolean(progress?.done),
      playerId,
      href: drillLinkFor(assignment),
    }));
}
