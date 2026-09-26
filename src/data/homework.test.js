import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_REQUIRED,
  HOMEWORK_DIFFICULTIES,
  difficultyBandFor,
  themeLabel,
  puzzlesMatching,
  localDateString,
  dueAtFromDate,
  defaultDueDate,
  buildAssignment,
  requiredFor,
  progressFor,
  homeworkForPlayer,
  assignmentReport,
  orderAssignments,
  assignmentTitle,
  drillLinkFor,
  parseTrainingLink,
} from './homework.js';

// The real library, read the way Node can (puzzles.js needs Vite's JSON loader).
const PUZZLES = JSON.parse(readFileSync(new URL('./puzzles.json', import.meta.url), 'utf8'));
const THEMES = [...new Set(PUZZLES.flatMap((p) => p.themes))].sort();

const PLAYERS = [
  { playerId: 'CC-002', name: 'Anthony' },
  { playerId: 'CC-004', name: 'Bea' },
  { playerId: 'CC-005', name: 'Cal' },
  { playerId: 'CC-003', name: 'Magnus Carlsen', deletedAt: '2026-09-25T00:00:00Z' },
];

const CREATED = '2026-10-01T15:00:00.000Z';
const DUE = '2026-10-07T04:59:59.999Z';
const BEFORE_DUE = Date.parse('2026-10-05T12:00:00Z');
const AFTER_DUE = Date.parse('2026-10-09T12:00:00Z');

const forkAssignment = (overrides = {}) => ({
  id: 'HW-1',
  kind: 'theme',
  theme: 'fork',
  difficulty: null,
  requiredCount: 3,
  puzzleIds: [],
  audience: 'players',
  playerIds: ['CC-004', 'CC-005'],
  note: '',
  dueAt: DUE,
  createdAt: CREATED,
  ...overrides,
});

let seq = 0;
const attempt = (overrides = {}) => {
  seq += 1;
  return {
    id: `PA-${seq}`,
    playerId: 'CC-004',
    puzzleId: `P${seq}`,
    themes: ['fork', 'middlegame'],
    difficulty: 'easy',
    puzzleRating: 1200,
    correct: true,
    usedHint: false,
    usedSolution: false,
    secondsTaken: 20,
    attemptedAt: '2026-10-02T18:00:00.000Z',
    ...overrides,
  };
};

// -- bands, labels, catalogue ------------------------------------------------

test('difficultyBandFor: boundaries match the Training page bands', () => {
  assert.equal(difficultyBandFor(400), 'beginner');
  assert.equal(difficultyBandFor(999), 'beginner');
  assert.equal(difficultyBandFor(1000), 'easy');
  assert.equal(difficultyBandFor(1399), 'easy');
  assert.equal(difficultyBandFor(1400), 'intermediate');
  assert.equal(difficultyBandFor(1800), 'hard');
  assert.equal(difficultyBandFor(2200), 'expert');
  assert.deepEqual(
    HOMEWORK_DIFFICULTIES.map((d) => d.key),
    ['beginner', 'easy', 'intermediate', 'hard', 'expert'],
  );
});

test('difficultyBandFor: a missing rating has no band', () => {
  assert.equal(difficultyBandFor(null), '');
  assert.equal(difficultyBandFor(undefined), '');
  assert.equal(difficultyBandFor(NaN), '');
});

test('themeLabel: reads like the Training page dropdown', () => {
  assert.equal(themeLabel('backRankMate'), 'Back Rank Mate');
  assert.equal(themeLabel('mateIn2'), 'Mate in 2');
  assert.equal(themeLabel('fork'), 'Fork');
});

test('puzzlesMatching: filters the real library by theme and band', () => {
  const forks = puzzlesMatching(PUZZLES, { theme: 'fork' });
  assert.ok(forks.length >= 5, 'the library has enough forks for a default assignment');
  assert.ok(forks.every((p) => p.themes.includes('fork')));
  const easyForks = puzzlesMatching(PUZZLES, { theme: 'fork', difficulty: 'easy' });
  assert.ok(easyForks.every((p) => p.rating >= 1000 && p.rating < 1400));
  assert.ok(easyForks.length < forks.length);
  assert.equal(puzzlesMatching(PUZZLES, { theme: 'fork', difficulty: 'expert' }).length, 0);
  assert.equal(puzzlesMatching(null, { theme: 'fork' }).length, 0);
});

// -- dates -------------------------------------------------------------------

test('dueAtFromDate: the end of that day in local time', () => {
  const iso = dueAtFromDate('2026-10-20');
  const d = new Date(iso);
  assert.equal(localDateString(iso), '2026-10-20');
  assert.equal(d.getHours(), 23);
  assert.equal(d.getMinutes(), 59);
});

test('dueAtFromDate: rejects junk and impossible dates', () => {
  assert.equal(dueAtFromDate(''), null);
  assert.equal(dueAtFromDate('next tuesday'), null);
  assert.equal(dueAtFromDate('2026-02-30'), null);
  assert.equal(dueAtFromDate('2026-13-01'), null);
  assert.equal(dueAtFromDate(undefined), null);
});

test('defaultDueDate: the next Tuesday, and a week out when set on a Tuesday', () => {
  // Local-time constructors keep this independent of the machine's zone.
  const friday = new Date(2026, 8, 25, 10, 0); // Fri 25 Sep 2026
  assert.equal(defaultDueDate(friday), '2026-09-29');
  const tuesday = new Date(2026, 8, 29, 16, 0);
  assert.equal(defaultDueDate(tuesday), '2026-10-06');
  const monday = new Date(2026, 8, 28, 9, 0);
  assert.equal(defaultDueDate(monday), '2026-09-29');
});

// -- buildAssignment ---------------------------------------------------------

const NOW = new Date('2026-10-01T15:00:00.000Z');
const ctx = (overrides = {}) => ({ themes: THEMES, puzzles: PUZZLES, players: PLAYERS, now: NOW, id: 'HW-9', ...overrides });

test('buildAssignment: a theme assignment with the default count', () => {
  const result = buildAssignment(
    { kind: 'theme', theme: 'fork', audience: 'players', playerIds: ['CC-004'], dueAt: DUE },
    ctx(),
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.assignment.requiredCount, DEFAULT_REQUIRED);
  assert.equal(result.assignment.theme, 'fork');
  assert.equal(result.assignment.difficulty, null);
  assert.deepEqual(result.assignment.puzzleIds, []);
  assert.equal(result.assignment.createdAt, NOW.toISOString());
  assert.equal(result.assignment.id, 'HW-9');
});

test('buildAssignment: club-wide expands to every ACTIVE member, never a retired one', () => {
  const result = buildAssignment({ kind: 'theme', theme: 'fork', audience: 'club', dueAt: DUE }, ctx());
  assert.equal(result.ok, true);
  assert.deepEqual(result.assignment.playerIds, ['CC-002', 'CC-004', 'CC-005']);
  assert.equal(result.assignment.audience, 'club');
});

test('buildAssignment: rejects a theme that is not in puzzles.json', () => {
  const result = buildAssignment(
    { kind: 'theme', theme: 'brilliantSwindle', audience: 'club', dueAt: DUE },
    ctx(),
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'theme' && /not a theme/.test(e.message)));
});

test('buildAssignment: rejects asking for more puzzles than the theme and band hold', () => {
  const available = puzzlesMatching(PUZZLES, { theme: 'bodenMate' }).length;
  assert.equal(available, 1);
  const result = buildAssignment(
    { kind: 'theme', theme: 'bodenMate', requiredCount: 5, audience: 'club', dueAt: DUE },
    ctx(),
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'requiredCount' && /Only 1/.test(e.message)));

  const none = buildAssignment(
    { kind: 'theme', theme: 'fork', difficulty: 'expert', requiredCount: 1, audience: 'club', dueAt: DUE },
    ctx(),
  );
  assert.ok(none.errors.some((e) => e.field === 'requiredCount' && /No fork puzzles/.test(e.message)));
});

test('buildAssignment: rejects a bad count, band, due date, audience and a long note', () => {
  const result = buildAssignment(
    {
      kind: 'theme',
      theme: 'fork',
      difficulty: 'grandmaster',
      requiredCount: 0,
      audience: 'players',
      playerIds: [],
      dueAt: '2026-09-30T00:00:00Z',
      note: 'x'.repeat(201),
    },
    ctx(),
  );
  assert.equal(result.ok, false);
  const fields = result.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['audience', 'difficulty', 'dueAt', 'note', 'requiredCount']);
  assert.equal(buildAssignment({ kind: 'theme', theme: 'fork', requiredCount: 2.5, audience: 'club', dueAt: DUE }, ctx()).ok, false);
});

test('buildAssignment: rejects players who are not on the roster, including retired ones', () => {
  const result = buildAssignment(
    { kind: 'theme', theme: 'fork', audience: 'players', playerIds: ['CC-004', 'CC-003', 'CC-999'], dueAt: DUE },
    ctx(),
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'audience' && /CC-003, CC-999/.test(e.message)));
});

test('buildAssignment: a set keeps its ids once each and ignores theme fields', () => {
  const ids = PUZZLES.slice(0, 3).map((p) => p.id);
  const result = buildAssignment(
    { kind: 'set', theme: 'fork', requiredCount: 9, puzzleIds: [...ids, ids[0]], audience: 'club', dueAt: DUE },
    ctx(),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.assignment.puzzleIds, ids);
  assert.equal(result.assignment.theme, null);
  assert.equal(result.assignment.requiredCount, null);
  assert.equal(requiredFor(result.assignment), 3);
});

test('buildAssignment: rejects an empty set and ids that are not in the library', () => {
  const empty = buildAssignment({ kind: 'set', puzzleIds: [], audience: 'club', dueAt: DUE }, ctx());
  assert.ok(empty.errors.some((e) => e.field === 'puzzleIds'));
  const bogus = buildAssignment({ kind: 'set', puzzleIds: ['nope'], audience: 'club', dueAt: DUE }, ctx());
  assert.ok(bogus.errors.some((e) => e.field === 'puzzleIds' && /nope/.test(e.message)));
});

test('buildAssignment: rejects a missing kind and a missing id', () => {
  const result = buildAssignment({ audience: 'club', dueAt: DUE }, ctx({ id: '' }));
  const fields = result.errors.map((e) => e.field);
  assert.ok(fields.includes('kind'));
  assert.ok(fields.includes('id'));
});

// -- progressFor -------------------------------------------------------------

test('progressFor: not started with no attempts at all', () => {
  const p = progressFor(forkAssignment(), [], 'CC-004', { now: BEFORE_DUE });
  assert.equal(p.status, 'not-started');
  assert.equal(p.correct, 0);
  assert.equal(p.required, 3);
  assert.equal(p.done, false);
  assert.equal(p.lastAttemptAt, null);
});

test('progressFor: in progress, then done once enough distinct puzzles are solved', () => {
  const some = [attempt({ attemptedAt: '2026-10-02T18:00:00Z' }), attempt({ attemptedAt: '2026-10-02T18:05:00Z' })];
  const partial = progressFor(forkAssignment(), some, 'CC-004', { now: BEFORE_DUE });
  assert.equal(partial.status, 'in-progress');
  assert.equal(partial.correct, 2);
  assert.equal(partial.lastAttemptAt, '2026-10-02T18:05:00.000Z');

  const all = [...some, attempt({ attemptedAt: '2026-10-03T18:00:00Z' })];
  const finished = progressFor(forkAssignment(), all, 'CC-004', { now: BEFORE_DUE });
  assert.equal(finished.status, 'done');
  assert.equal(finished.done, true);
  assert.equal(finished.late, false);
  assert.equal(finished.completedAt, '2026-10-03T18:00:00.000Z');
});

test('progressFor: attempts made BEFORE the assignment existed are ignored', () => {
  const old = [
    attempt({ attemptedAt: '2026-09-30T18:00:00Z' }),
    attempt({ attemptedAt: '2026-10-01T14:59:59.999Z' }),
    attempt({ attemptedAt: '2026-10-01T10:00:00Z' }),
  ];
  const p = progressFor(forkAssignment(), old, 'CC-004', { now: BEFORE_DUE });
  assert.equal(p.correct, 0);
  assert.equal(p.attempts, 0);
  assert.equal(p.status, 'not-started');
  // The creation instant itself is inside the window.
  const onTheDot = progressFor(forkAssignment(), [attempt({ attemptedAt: CREATED })], 'CC-004', { now: BEFORE_DUE });
  assert.equal(onTheDot.correct, 1);
});

test('progressFor: showing the solution or taking a hint is activity, not a solve', () => {
  const tries = [
    attempt({ correct: false, usedSolution: true }),
    attempt({ correct: true, usedSolution: true }),
    attempt({ correct: true, usedHint: true }),
  ];
  const p = progressFor(forkAssignment(), tries, 'CC-004', { now: BEFORE_DUE });
  assert.equal(p.correct, 0);
  assert.equal(p.attempts, 3);
  assert.equal(p.status, 'in-progress');
});

test("progressFor: another player's attempts are ignored", () => {
  const theirs = [attempt({ playerId: 'CC-005' }), attempt({ playerId: 'CC-005' }), attempt({ playerId: 'CC-005' })];
  const mine = progressFor(forkAssignment(), theirs, 'CC-004', { now: BEFORE_DUE });
  assert.equal(mine.correct, 0);
  assert.equal(mine.status, 'not-started');
  assert.equal(progressFor(forkAssignment(), theirs, 'CC-005', { now: BEFORE_DUE }).status, 'done');
});

test('progressFor: the same puzzle solved three times counts once', () => {
  const again = [
    attempt({ puzzleId: 'X1', attemptedAt: '2026-10-02T18:00:00Z' }),
    attempt({ puzzleId: 'X1', attemptedAt: '2026-10-02T18:01:00Z' }),
    attempt({ puzzleId: 'X1', attemptedAt: '2026-10-02T18:02:00Z' }),
  ];
  const p = progressFor(forkAssignment(), again, 'CC-004', { now: BEFORE_DUE });
  assert.equal(p.correct, 1);
  assert.equal(p.attempts, 3);
  assert.equal(p.done, false);
});

test('progressFor: a solve after a miss on the same puzzle counts, and both are attempts', () => {
  const tries = [
    attempt({ puzzleId: 'X2', correct: false, attemptedAt: '2026-10-02T18:00:00Z' }),
    attempt({ puzzleId: 'X2', correct: true, attemptedAt: '2026-10-02T18:00:30Z' }),
  ];
  const p = progressFor(forkAssignment(), tries, 'CC-004', { now: BEFORE_DUE });
  assert.equal(p.correct, 1);
  assert.equal(p.attempts, 2);
});

test('progressFor: off-theme, wrong-band and own-game attempts do not count', () => {
  const noise = [
    attempt({ themes: ['pin'] }),
    attempt({ themes: ['fork'], puzzleId: 'own:17', difficulty: 'beginner' }),
  ];
  assert.equal(progressFor(forkAssignment(), noise, 'CC-004', { now: BEFORE_DUE }).attempts, 0);

  const banded = forkAssignment({ difficulty: 'intermediate' });
  const tries = [attempt({ difficulty: 'easy' }), attempt({ difficulty: 'intermediate' })];
  const p = progressFor(banded, tries, 'CC-004', { now: BEFORE_DUE });
  assert.equal(p.correct, 1);
  assert.equal(p.attempts, 1);
});

test('progressFor: overdue once the due date passes unfinished', () => {
  const partial = [attempt()];
  assert.equal(progressFor(forkAssignment(), partial, 'CC-004', { now: AFTER_DUE }).status, 'overdue');
  assert.equal(progressFor(forkAssignment(), [], 'CC-004', { now: AFTER_DUE }).status, 'overdue');
  // `now` arrives as epoch ms, a Date or an ISO string depending on the caller.
  assert.equal(progressFor(forkAssignment(), [], 'CC-004', { now: new Date(AFTER_DUE) }).status, 'overdue');
  assert.equal(progressFor(forkAssignment(), [], 'CC-004', { now: new Date(AFTER_DUE).toISOString() }).status, 'overdue');
  assert.equal(progressFor(forkAssignment(), [], 'CC-004', { now: new Date(BEFORE_DUE) }).status, 'not-started');
});

test('progressFor: finishing after the due date is done, flagged late', () => {
  const tries = [
    attempt({ attemptedAt: '2026-10-02T18:00:00Z' }),
    attempt({ attemptedAt: '2026-10-03T18:00:00Z' }),
    attempt({ attemptedAt: '2026-10-08T18:00:00Z' }),
  ];
  const p = progressFor(forkAssignment(), tries, 'CC-004', { now: AFTER_DUE });
  assert.equal(p.status, 'done');
  assert.equal(p.late, true);
  assert.equal(p.completedAt, '2026-10-08T18:00:00.000Z');
});

test('progressFor: a set counts only its own puzzles', () => {
  const set = forkAssignment({ kind: 'set', theme: null, requiredCount: null, puzzleIds: ['A', 'B'] });
  const tries = [attempt({ puzzleId: 'A' }), attempt({ puzzleId: 'C' })];
  const p = progressFor(set, tries, 'CC-004', { now: BEFORE_DUE });
  assert.equal(p.required, 2);
  assert.equal(p.correct, 1);
  assert.equal(p.attempts, 1);
  const done = progressFor(set, [...tries, attempt({ puzzleId: 'B' })], 'CC-004', { now: BEFORE_DUE });
  assert.equal(done.status, 'done');
});

test('progressFor: unreadable timestamps and junk input count for nothing', () => {
  const tries = [attempt({ attemptedAt: 'yesterday' }), attempt({ attemptedAt: null }), null, attempt({ puzzleId: '' })];
  assert.equal(progressFor(forkAssignment(), tries, 'CC-004', { now: BEFORE_DUE }).attempts, 0);
  assert.equal(progressFor(forkAssignment({ createdAt: 'never' }), [attempt()], 'CC-004').correct, 0);
  assert.equal(progressFor(null, [attempt()], 'CC-004').status, 'not-started');
  assert.equal(progressFor(forkAssignment(), [attempt()], '').correct, 0);
});

// -- homeworkForPlayer -------------------------------------------------------

test('homeworkForPlayer: only assignments targeted at the player, unfinished first by due date', () => {
  const soon = forkAssignment({ id: 'soon', dueAt: '2026-10-04T04:59:59Z' });
  const later = forkAssignment({ id: 'later', dueAt: '2026-10-10T04:59:59Z' });
  const notMine = forkAssignment({ id: 'not-mine', playerIds: ['CC-005'] });
  const finished = forkAssignment({ id: 'finished', requiredCount: 1, theme: 'pin', dueAt: '2026-10-12T04:59:59Z' });
  const tries = [attempt({ themes: ['pin'] })];

  const list = homeworkForPlayer([later, notMine, finished, soon], tries, 'CC-004', { now: BEFORE_DUE });
  assert.deepEqual(list.map((i) => i.assignment.id), ['soon', 'later', 'finished']);
  assert.equal(list[2].progress.status, 'done');
  assert.deepEqual(homeworkForPlayer([soon], tries, ''), []);
});

test('homeworkForPlayer: finished work drops off two weeks after it was due; overdue work stays', () => {
  const finished = forkAssignment({ id: 'finished', requiredCount: 1 });
  const unfinished = forkAssignment({ id: 'unfinished', requiredCount: 5 });
  const tries = [attempt()];
  const monthLater = Date.parse('2026-11-07T12:00:00Z');
  const list = homeworkForPlayer([finished, unfinished], tries, 'CC-004', { now: monthLater });
  assert.deepEqual(list.map((i) => i.assignment.id), ['unfinished']);
  assert.equal(list[0].progress.status, 'overdue');
});

// -- assignmentReport --------------------------------------------------------

test('assignmentReport: one row per target on the roster, unfinished first, with counts', () => {
  const hw = forkAssignment({ requiredCount: 1, playerIds: ['CC-002', 'CC-004', 'CC-005', 'CC-003'] });
  const tries = [attempt({ playerId: 'CC-004' }), attempt({ playerId: 'CC-005', correct: false })];
  const report = assignmentReport(hw, tries, PLAYERS, { now: BEFORE_DUE });
  assert.deepEqual(
    report.rows.map((r) => [r.name, r.progress.status]),
    [
      ['Anthony', 'not-started'],
      ['Cal', 'in-progress'],
      ['Bea', 'done'],
    ],
  );
  assert.deepEqual(report.counts, { done: 1, 'in-progress': 1, 'not-started': 1, overdue: 0, total: 3 });
  assert.equal(report.removed, 1, 'the retired target is counted, not shown');
});

test('assignmentReport: an empty or missing assignment reports nobody', () => {
  const report = assignmentReport(null, [], PLAYERS);
  assert.equal(report.rows.length, 0);
  assert.equal(report.counts.total, 0);
});

test('orderAssignments: running soonest-first, then past most-recent-first', () => {
  const list = [
    forkAssignment({ id: 'past-old', dueAt: '2026-09-01T00:00:00Z' }),
    forkAssignment({ id: 'next-month', dueAt: '2026-11-01T00:00:00Z' }),
    forkAssignment({ id: 'past-recent', dueAt: '2026-10-04T00:00:00Z' }),
    forkAssignment({ id: 'this-week', dueAt: '2026-10-07T00:00:00Z' }),
    null,
  ];
  assert.deepEqual(
    orderAssignments(list, { now: BEFORE_DUE }).map((a) => a.id),
    ['this-week', 'next-month', 'past-recent', 'past-old'],
  );
  assert.deepEqual(orderAssignments(undefined), []);
});

// -- titles and links --------------------------------------------------------

test('assignmentTitle: names the theme, count and band', () => {
  assert.equal(assignmentTitle(forkAssignment({ difficulty: 'easy' })), 'Fork · 3 puzzles · Easy');
  assert.equal(assignmentTitle(forkAssignment({ requiredCount: 1 })), 'Fork · 1 puzzle');
  assert.equal(
    assignmentTitle(forkAssignment({ kind: 'set', theme: null, puzzleIds: ['A', 'B'] })),
    'Puzzle set · 2 puzzles',
  );
});

test('drillLinkFor and parseTrainingLink: a theme link round-trips', () => {
  const link = drillLinkFor(forkAssignment({ difficulty: 'easy' }));
  assert.equal(link, '#/training?theme=fork&difficulty=easy');
  assert.deepEqual(parseTrainingLink(link, { themes: THEMES }), { theme: 'fork', difficulty: 'easy', puzzleIds: [] });
});

test('drillLinkFor and parseTrainingLink: a set link round-trips', () => {
  const ids = PUZZLES.slice(0, 2).map((p) => p.id);
  const link = drillLinkFor(forkAssignment({ kind: 'set', theme: null, puzzleIds: ids }));
  const parsed = parseTrainingLink(link, { themes: THEMES, puzzleIds: PUZZLES.map((p) => p.id) });
  assert.deepEqual(parsed.puzzleIds, ids);
  assert.equal(parsed.theme, '');
});

test('parseTrainingLink: unknown themes, bands and puzzle ids are dropped, not trusted', () => {
  const parsed = parseTrainingLink('#/training?theme=nonsense&difficulty=godlike&puzzles=zzz,,zzz', {
    themes: THEMES,
    puzzleIds: PUZZLES.map((p) => p.id),
  });
  assert.deepEqual(parsed, { theme: '', difficulty: '', puzzleIds: [] });
  assert.deepEqual(parseTrainingLink('#/training', { themes: THEMES }), { theme: '', difficulty: '', puzzleIds: [] });
  assert.deepEqual(parseTrainingLink(undefined), { theme: '', difficulty: '', puzzleIds: [] });
});
