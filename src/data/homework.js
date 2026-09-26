/*
 * homework.js — what a homework assignment is, and whether someone has done it.
 *
 * The coach sets either a THEME ("solve 5 forks, easy ones, by Tuesday") or a
 * fixed SET of puzzles ("these six, by Tuesday"). Nothing records completion:
 * it is computed every time from puzzle_attempts, which the Training page
 * already writes for every attempt. A stored "done" flag would be a second
 * copy of a fact the attempts table already holds, and the two would drift the
 * first time an attempt synced late or a coach deleted a bad row.
 *
 * Pure: no React, no Supabase, no puzzles.json import (that needs Vite's JSON
 * loader). Callers pass the catalogue in, so every rule here runs under
 * `node --test`.
 */

export const DEFAULT_REQUIRED = 5;
export const MAX_REQUIRED = 50;
export const MAX_SET_SIZE = 50;
export const NOTE_MAX = 200;

/** How long a finished assignment stays on a trainee's list after it was due. */
export const RECENT_DONE_DAYS = 14;

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

// -- building an assignment ------------------------------------------------

/**
 * Validate what the coach filled in and turn it into a stored assignment.
 *
 * Returns `{ ok: true, assignment }` or `{ ok: false, errors }`, where each
 * error is `{ field, message }`. `themes` and `puzzles` are the library
 * (PUZZLE_THEMES and PUZZLES); `players` is the visible roster.
 *
 * Club-wide homework is expanded into one target per current member, here,
 * at creation. The database then only ever answers "is this assignment
 * targeted at me?" (0020), so a player can never read homework set for
 * someone else, and the coach's "who has done it" list does not quietly grow
 * every time somebody joins.
 */
export function buildAssignment(draft = {}, { themes = [], puzzles = [], players = [], now = new Date(), id } = {}) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const nowMs = toMs(now) ?? Date.now();

  const kind = draft.kind === 'set' ? 'set' : draft.kind === 'theme' ? 'theme' : null;
  if (!kind) fail('kind', 'Choose a theme or a puzzle set.');

  let theme = null;
  let difficulty = null;
  let requiredCount = null;
  let puzzleIds = [];

  if (kind === 'theme') {
    theme = String(draft.theme || '');
    difficulty = draft.difficulty ? String(draft.difficulty) : null;
    if (!theme) fail('theme', 'Choose a theme.');
    else if (!themes.includes(theme)) fail('theme', `"${theme}" is not a theme in the puzzle library.`);
    if (difficulty && !DIFFICULTY_KEYS.has(difficulty)) {
      fail('difficulty', `"${difficulty}" is not a difficulty band.`);
      difficulty = null;
    }

    const raw = draft.requiredCount === '' || draft.requiredCount == null ? DEFAULT_REQUIRED : draft.requiredCount;
    requiredCount = Number(raw);
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

  const active = (players || []).filter((p) => p && p.playerId && !p.deletedAt);
  const activeIds = new Set(active.map((p) => p.playerId));
  const audience = draft.audience === 'players' ? 'players' : draft.audience === 'club' ? 'club' : null;
  let playerIds = [];
  if (!audience) fail('audience', 'Choose who the homework is for.');
  else if (audience === 'club') {
    playerIds = active.map((p) => p.playerId);
    if (!playerIds.length) fail('audience', 'There is nobody on the roster to assign it to.');
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
      audience,
      playerIds,
      note,
      dueAt: new Date(dueMs).toISOString(),
      createdAt: new Date(nowMs).toISOString(),
    },
  };
}

// -- progress -------------------------------------------------------------

/** How many distinct puzzles an assignment asks for. */
export function requiredFor(assignment) {
  if (!assignment) return 0;
  if (assignment.kind === 'set') return (assignment.puzzleIds || []).length;
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

/*
 * A solve counts only when it was the player's own. Taking a hint or showing
 * the answer is still practice, and still counts as activity (the status
 * moves to "in progress"), but it is not a puzzle solved.
 *
 * A correct attempt after a wrong move on the same puzzle DOES count. That is
 * what the Training page itself treats as solved (the puzzle stays on the
 * board after a miss, and the finished line is recorded as correct), and a
 * stricter first-try rule would make a fixed set impossible to finish after
 * one slip. The number of attempts is reported alongside, so the coach can
 * see the difference between 5 of 5 in 5 tries and 5 of 5 in 40.
 */
const isCleanSolve = (attempt) => !!attempt.correct && !attempt.usedHint && !attempt.usedSolution;

/**
 * One player's progress on one assignment.
 *
 * Counts only that player's attempts made at or after the assignment was
 * created. Attempts after the due date still count, so late work is not lost,
 * but an assignment finished after its due date is flagged `late`. Each
 * puzzle counts once, however many times it is solved.
 *
 * Returns `{ done, correct, required, attempts, lastAttemptAt, completedAt,
 * late, status }`, with status one of done / in-progress / not-started /
 * overdue.
 */
export function progressFor(assignment, attempts, playerId, { now = Date.now() } = {}) {
  const required = requiredFor(assignment);
  const empty = {
    done: false,
    correct: 0,
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

  const matches = matcherFor(assignment);
  const counted = [];
  for (const attempt of attempts || []) {
    if (!attempt || attempt.playerId !== playerId || !attempt.puzzleId) continue;
    const at = toMs(attempt.attemptedAt);
    if (at == null || at < createdMs) continue;
    if (!matches(attempt)) continue;
    counted.push({ attempt, at });
  }
  counted.sort((a, b) => a.at - b.at);

  // First clean solve of each distinct puzzle, in time order.
  const firstSolve = new Map();
  for (const { attempt, at } of counted) {
    if (isCleanSolve(attempt) && !firstSolve.has(attempt.puzzleId)) firstSolve.set(attempt.puzzleId, at);
  }
  const solveTimes = [...firstSolve.values()].sort((a, b) => a - b);

  const correct = solveTimes.length;
  const done = required > 0 && correct >= required;
  const completedMs = done ? solveTimes[required - 1] : null;
  const late = done && dueMs != null && completedMs > dueMs;
  const overdue = !done && dueMs != null && nowMs > dueMs;

  return {
    done,
    correct,
    required,
    attempts: counted.length,
    lastAttemptAt: counted.length ? new Date(counted[counted.length - 1].at).toISOString() : null,
    completedAt: completedMs != null ? new Date(completedMs).toISOString() : null,
    late,
    status: done ? 'done' : overdue ? 'overdue' : counted.length ? 'in-progress' : 'not-started',
  };
}

const isTarget = (assignment, playerId) => (assignment?.playerIds || []).includes(playerId);

/**
 * A trainee's homework list: every assignment targeted at them, with
 * progress, unfinished first (soonest due first, so overdue work leads),
 * then finished work, most recently due first.
 *
 * Finished work drops off `recentDoneDays` after its due date; unfinished
 * work never drops off on its own, because an overdue assignment is still
 * something the player has not done.
 */
export function homeworkForPlayer(assignments, attempts, playerId, { now = Date.now(), recentDoneDays = RECENT_DONE_DAYS } = {}) {
  if (!playerId) return [];
  const nowMs = toMs(now) ?? Date.now();
  const items = (assignments || [])
    .filter((a) => a && isTarget(a, playerId))
    .map((assignment) => ({ assignment, progress: progressFor(assignment, attempts, playerId, { now: nowMs }) }))
    .filter(({ assignment, progress }) => {
      if (!progress.done) return true;
      const dueMs = toMs(assignment.dueAt);
      return dueMs == null || nowMs - dueMs <= recentDoneDays * DAY_MS;
    });

  const due = (item) => toMs(item.assignment.dueAt) ?? Infinity;
  const open = items.filter((i) => !i.progress.done).sort((a, b) => due(a) - due(b));
  const finished = items.filter((i) => i.progress.done).sort((a, b) => due(b) - due(a));
  return [...open, ...finished];
}

const STATUS_ORDER = { overdue: 0, 'not-started': 1, 'in-progress': 2, done: 3 };

/**
 * The coach's view of one assignment: a row per targeted player still on the
 * roster, the ones who have not done it first, plus counts per status.
 * `removed` counts targets who have since left the roster; their rows are
 * left out, the same as retired members everywhere else.
 */
export function assignmentReport(assignment, attempts, players, { now = Date.now() } = {}) {
  const byId = new Map(
    (players || []).filter((p) => p && p.playerId && !p.deletedAt).map((p) => [p.playerId, p]),
  );
  const targets = [...new Set(assignment?.playerIds || [])];
  const rows = targets
    .filter((pid) => byId.has(pid))
    .map((pid) => ({
      playerId: pid,
      name: byId.get(pid).name || pid,
      progress: progressFor(assignment, attempts, pid, { now }),
    }))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.progress.status] - STATUS_ORDER[b.progress.status] ||
        String(a.name).localeCompare(String(b.name)),
    );

  const counts = { done: 0, 'in-progress': 0, 'not-started': 0, overdue: 0, total: rows.length };
  for (const row of rows) counts[row.progress.status] += 1;
  return { rows, counts, removed: targets.length - rows.length };
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

/** A one-line name for an assignment: "Fork · 5 puzzles · Easy". */
export function assignmentTitle(assignment) {
  if (!assignment) return '';
  const required = requiredFor(assignment);
  const count = `${required} puzzle${required === 1 ? '' : 's'}`;
  if (assignment.kind === 'set') return `Puzzle set · ${count}`;
  const band = HOMEWORK_DIFFICULTIES.find((d) => d.key === assignment.difficulty);
  return [themeLabel(assignment.theme), count, band ? band.label.split(' (')[0] : null].filter(Boolean).join(' · ');
}

/**
 * Where "Practise" sends a trainee: the Training page's existing deep link,
 * pre-filtered to the assignment's theme and band, or to the exact set.
 */
export function drillLinkFor(assignment) {
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
