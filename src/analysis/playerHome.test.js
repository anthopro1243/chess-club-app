/*
 * The player's own home page. What these pin down, in order of how much harm
 * getting them wrong would do:
 *   1. nobody sees another player's data, and a retired member has no page;
 *   2. a low-confidence score never reaches the screen as a number;
 *   3. no priority is invented without the player's own analysed games;
 *   4. the trend leads, and only where a trend has actually been measured.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayerHome, scoresFromSkillRows, homeworkView, recentGamesFor, gameFromPlayerSide,
  trendOverview, motifTotals, MIN_GAMES_FOR_TREND,
} from './playerHome.js';
import { NOT_ENOUGH, NOT_MEASURABLE } from './presentation.js';

const NOW = Date.parse('2026-11-10T18:00:00Z');
const DAY = 86400000;

const alice = { playerId: 'CC-010', name: 'Alice' };
const bob = { playerId: 'CC-011', name: 'Bob' };
const aliceViewer = { role: 'player', playerId: 'CC-010' };
const coachViewer = { role: 'coach', playerId: 'CC-002' };

const skill = (playerId, category, score, confidence, games, trend, observations = 30) => ({
  playerId, category, score, confidence, games, trend, observations, source: 'engine',
});

const ALICE_SKILLS = [
  skill('CC-010', 'tacticalVision', 62, 'medium', 6, 4),
  skill('CC-010', 'boardVision', 45, 'high', 8, 9, 80),
  skill('CC-010', 'openingKnowledge', 60, 'medium', 5, -3),
  skill('CC-010', 'endgameTechnique', 20, 'low', 3, -10, 4),
  skill('CC-010', 'timeManagement', 70, 'medium', 1, 0),
];

// Bob is weaker everywhere; none of it may leak into Alice's page.
const BOB_SKILLS = [
  skill('CC-011', 'tacticalVision', 12, 'high', 9, -20, 90),
  skill('CC-011', 'positionalUnderstanding', 15, 'high', 9, -15, 90),
];

const game = (id, white, black, result, playedAt, extra = {}) => ({
  id,
  whitePlayerId: white,
  blackPlayerId: black,
  whiteName: white === 'CC-010' ? 'Alice' : white === 'CC-011' ? 'Bob' : 'Guest',
  blackName: black === 'CC-010' ? 'Alice' : black === 'CC-011' ? 'Bob' : 'Guest',
  result,
  playedAt,
  mode: 'human',
  ...extra,
});

const analysis = (gameId, playerId, side, accuracy, motifCounts = {}) => ({
  gameId, playerId, side, accuracy, motifCounts,
});

const GAMES = [
  game('g1', 'CC-010', '', '1-0', '2026-11-01T18:00:00Z'),
  game('g2', '', 'CC-010', '1-0', '2026-11-02T18:00:00Z'),
  game('g3', 'CC-010', 'CC-011', '1/2-1/2', '2026-11-03T18:00:00Z'),
  game('g4', 'CC-011', 'CC-010', '1-0', '2026-11-04T18:00:00Z'),
  game('g5', 'CC-010', '', '*', '2026-11-05T18:00:00Z'),
  game('g6', 'CC-010', '', '0-1', '2026-11-06T18:00:00Z'),
  // Bob's game with a guest: not Alice's, must never appear on her page.
  game('g7', 'CC-011', '', '1-0', '2026-11-09T18:00:00Z'),
];

const ANALYSES = [
  analysis('g6', 'CC-010', 'w', 71.4, { hangingPiece: 2 }),
  analysis('g3', 'CC-010', 'w', 64.6, { hangingPiece: 2 }),
  // Bob's side of the shared game: his accuracy, not Alice's.
  analysis('g3', 'CC-011', 'b', 88, { fork: 9 }),
  analysis('g7', 'CC-011', 'w', 90, { fork: 9 }),
];

const ownPuzzle = (playerId, dueAt, extra = {}) => ({
  playerId, fen: `${playerId}-${dueAt}`, solution: 'e2e4', dueAt, retired: false, ...extra,
});

const PUZZLES = [
  ownPuzzle('CC-010', new Date(NOW - DAY).toISOString()),
  ownPuzzle('CC-010', new Date(NOW - 2 * DAY).toISOString()),
  ownPuzzle('CC-010', new Date(NOW + 3 * DAY).toISOString()),
  ownPuzzle('CC-010', new Date(NOW - DAY).toISOString(), { retired: true, fen: 'retired' }),
  ownPuzzle('CC-011', new Date(NOW - DAY).toISOString()),
];

const aliceHome = (overrides = {}) => buildPlayerHome({
  player: alice,
  viewer: aliceViewer,
  skillRows: [...ALICE_SKILLS, ...BOB_SKILLS],
  analyses: ANALYSES,
  games: GAMES,
  ownPuzzles: PUZZLES,
  now: NOW,
  ...overrides,
});

/* ── who may see the page ────────────────────────────────────────────────── */

test('a player sees their own home page', () => {
  const home = aliceHome();
  assert.equal(home.available, true);
  assert.equal(home.playerId, 'CC-010');
});

test('a player may NEVER be shown another player\'s home page', () => {
  const home = buildPlayerHome({ player: bob, viewer: aliceViewer, skillRows: BOB_SKILLS, now: NOW });
  assert.deepEqual(home, { available: false, reason: 'not-allowed' });
});

test('no viewer, or a role nobody has thought of, sees nothing', () => {
  assert.equal(aliceHome({ viewer: null }).available, false);
  assert.equal(aliceHome({ viewer: { role: 'parent', playerId: 'CC-010' } }).available, false);
  assert.equal(aliceHome({ viewer: { role: 'player', playerId: null } }).available, false);
});

test('a coach may preview a player\'s page', () => {
  assert.equal(aliceHome({ viewer: coachViewer }).available, true);
});

test('a retired member has no home page, whatever rows still exist', () => {
  const home = aliceHome({ player: { ...alice, deletedAt: '2026-10-01T00:00:00Z' } });
  assert.deepEqual(home, { available: false, reason: 'retired' });
});

test('no player at all is not an error, just nothing to show', () => {
  assert.deepEqual(buildPlayerHome({ player: null, viewer: coachViewer }), { available: false, reason: 'no-player' });
  assert.deepEqual(buildPlayerHome(), { available: false, reason: 'no-player' });
});

/* ── the one priority ────────────────────────────────────────────────────── */

test('exactly one priority, from improvementPlan, with its advice and drill', () => {
  const { priority } = aliceHome();
  // boardVision 45 at high confidence outranks tactics 62 at medium.
  assert.equal(priority.category, 'boardVision');
  assert.equal(priority.label, 'Board vision');
  assert.equal(priority.trainingTheme, 'Hanging Piece');
  // Two hanging pieces in each of two games: 4 summed, over the plan's
  // threshold of 3, so the concrete "this keeps happening" advice is used.
  assert.match(priority.advice, /left undefended/);
  assert.deepEqual(priority.action, {
    href: '#/training?theme=hangingPiece',
    label: 'Practise hanging piece puzzles',
  });
  assert.ok(!('score' in priority), 'the priority carries no number');
  assert.ok(!Array.isArray(priority), 'one priority, not a list');
});

test('no analyses: no priority is invented, even with skill rows on file', () => {
  const home = aliceHome({ analyses: [] });
  assert.equal(home.priority, null);
  assert.equal(home.analysedCount, 0);
});

test('a coach\'s manual rubric is never turned into a priority', () => {
  const home = buildPlayerHome({
    player: { ...alice, rubric: { tactics: 1, boardVision: 1, endgame: 1 } },
    viewer: aliceViewer,
    games: GAMES,
    now: NOW,
  });
  assert.equal(home.priority, null);
});

test('analyses but no scored categories yet: still no priority', () => {
  assert.equal(aliceHome({ skillRows: [] }).priority, null);
});

test('only another player\'s analyses: no priority for this one', () => {
  const home = aliceHome({ analyses: ANALYSES.filter((a) => a.playerId === 'CC-011') });
  assert.equal(home.priority, null);
});

test('a low-confidence category is never named as the priority', () => {
  const home = aliceHome({
    skillRows: [
      skill('CC-010', 'endgameTechnique', 5, 'low', 3, 0, 4),
      skill('CC-010', 'tacticalVision', 80, 'high', 9, 2, 60),
    ],
  });
  // Unfiltered, improvementPlan would rank the endgame 5 first.
  assert.equal(home.priority.category, 'tacticalVision');
});

test('only low-confidence categories: no priority yet', () => {
  const home = aliceHome({
    skillRows: [skill('CC-010', 'endgameTechnique', 5, 'low', 3, 0, 4)],
  });
  assert.equal(home.priority, null);
});

test('a frequent motif gives the concrete version of the drill', () => {
  const home = aliceHome({
    skillRows: [skill('CC-010', 'tacticalVision', 40, 'high', 9, -2, 60)],
    analyses: [
      analysis('g1', 'CC-010', 'w', 60, { fork: 2 }),
      analysis('g6', 'CC-010', 'w', 58, { fork: 2, hangingPiece: 1 }),
    ],
  });
  assert.equal(home.priority.trainingTheme, 'Fork');
  assert.equal(home.priority.action.href, '#/training?theme=fork');
});

test('a priority with no puzzle theme sends the player somewhere that fits', () => {
  const home = aliceHome({ skillRows: [skill('CC-010', 'timeManagement', 30, 'high', 9, 0, 60)] });
  assert.equal(home.priority.category, 'timeManagement');
  assert.equal(home.priority.trainingTheme, null);
  assert.equal(home.priority.action.href, '#/play');
});

test('motifTotals sums only what it is given, and ignores junk counts', () => {
  assert.deepEqual(motifTotals([{ motifCounts: { fork: 2 } }, { motifCounts: { fork: 1, pin: 'x' } }, {}]), { fork: 3 });
});

/* ── never a low-confidence number ───────────────────────────────────────── */

test('a low-confidence score is words, and carries no number at all', () => {
  const endgame = aliceHome().categories.find((c) => c.key === 'endgameTechnique');
  assert.equal(endgame.showNumber, false);
  assert.equal(endgame.text, NOT_ENOUGH);
  assert.equal(endgame.level, null);
  assert.equal(endgame.trend, null, 'a hidden score does not get a trend glued on');
  assert.ok(!JSON.stringify(endgame).includes('20'), 'the score 20 must not be anywhere in the object');
  assert.ok(!JSON.stringify(endgame).includes('-10'), 'nor its trend');
});

test('a row with a missing or unknown confidence is treated as not enough, not shown', () => {
  const home = aliceHome({
    skillRows: [
      { playerId: 'CC-010', category: 'boardVision', score: 33, games: 5, trend: 2 },
      { playerId: 'CC-010', category: 'tacticalVision', score: 44, confidence: 'certain', games: 5, trend: 2 },
    ],
  });
  for (const key of ['boardVision', 'tacticalVision']) {
    const row = home.categories.find((c) => c.key === key);
    assert.equal(row.showNumber, false, key);
    assert.equal(row.level, null, key);
  }
  assert.equal(home.priority, null, 'and neither becomes the priority');
});

test('medium and high confidence scores are shown, trend first', () => {
  const board = aliceHome().categories.find((c) => c.key === 'boardVision');
  assert.equal(board.showNumber, true);
  assert.equal(board.level, '45');
  assert.equal(board.trendText, 'up 9');
  assert.equal(board.text, '45, up 9 over recent games');
});

test('notation reads as unmeasurable, not "not enough games"', () => {
  const notation = aliceHome().categories.find((c) => c.key === 'notation');
  assert.equal(notation.text, NOT_MEASURABLE);
  assert.equal(notation.showNumber, false);
});

test('all eight categories are listed, and only confident ones count as measured', () => {
  const home = aliceHome();
  assert.equal(home.categories.length, 8);
  assert.equal(home.measuredCount, 4); // tactics, board vision, opening, time
});

test('another player\'s skill rows never fill in this player\'s categories', () => {
  const positional = aliceHome().categories.find((c) => c.key === 'positionalUnderstanding');
  assert.equal(positional.showNumber, false);
  assert.equal(positional.text, NOT_ENOUGH);
});

/* ── the trend ───────────────────────────────────────────────────────────── */

test('a trend needs at least two tracked games', () => {
  assert.equal(MIN_GAMES_FOR_TREND, 2);
  const time = aliceHome().categories.find((c) => c.key === 'timeManagement');
  assert.equal(time.showNumber, true);
  assert.equal(time.trendText, null, 'one game is not a trend, not even "steady"');
  assert.equal(time.text, '70');
});

test('the trend headline counts movement across confident categories only', () => {
  const { trend } = aliceHome();
  assert.equal(trend.hasTrend, true);
  assert.equal(trend.up, 2); // board vision, tactics
  assert.equal(trend.down, 1); // opening; the low-confidence endgame drop is not counted
  assert.equal(trend.steady, 0);
  assert.equal(trend.headline, 'Up in 2 areas and down in 1 over recent games.');
  assert.equal(trend.biggestGain.text, 'Board vision, up 9');
});

test('no measured trend: no headline, no invented "steady"', () => {
  const home = aliceHome({ skillRows: [skill('CC-010', 'boardVision', 50, 'high', 1, 0)] });
  assert.equal(home.trend.hasTrend, false);
  assert.equal(home.trend.headline, null);
});

test('trendOverview never names a biggest drop', () => {
  const t = trendOverview([
    { key: 'a', label: 'A', showNumber: true, trend: -12, trendText: 'down 12' },
    { key: 'b', label: 'B', showNumber: true, trend: 0, trendText: 'steady' },
  ]);
  assert.equal(t.biggestGain, null);
  assert.equal(t.headline, 'Steady in 1 and down in 1 over recent games.');
});

test('scoresFromSkillRows drops other players and unknown categories', () => {
  const { scores, trends } = scoresFromSkillRows([
    ...BOB_SKILLS,
    { playerId: 'CC-010', category: 'invented', score: 10, confidence: 'high', games: 5, trend: 3 },
  ], 'CC-010');
  assert.deepEqual(Object.keys(scores), ['notation']);
  assert.deepEqual(trends, {});
});

/* ── review positions due ────────────────────────────────────────────────── */

test('review count: only this player\'s positions, due now, not retired', () => {
  const { reviews } = aliceHome();
  assert.equal(reviews.due, 2);
  assert.equal(reviews.active, 3);
  assert.equal(reviews.href, '#/training');
});

test('no own-game puzzles: nothing due, not an error', () => {
  assert.equal(aliceHome({ ownPuzzles: undefined }).reviews.due, 0);
});

/* ── recent games ────────────────────────────────────────────────────────── */

test('recent games: the last five of this player\'s, newest first', () => {
  const { recentGames, gamesCount } = aliceHome();
  assert.equal(gamesCount, 6);
  assert.deepEqual(recentGames.map((g) => g.id), ['g6', 'g5', 'g4', 'g3', 'g2']);
  assert.ok(!recentGames.some((g) => g.id === 'g7'), 'Bob\'s game is not on Alice\'s page');
});

test('results read from the player\'s side of the board', () => {
  const byId = Object.fromEntries(aliceHome().recentGames.map((g) => [g.id, g]));
  assert.equal(byId.g6.outcome, 'loss'); // 0-1 as White
  assert.equal(byId.g4.outcome, 'loss'); // 1-0 as Black
  assert.equal(byId.g2.outcome, 'loss');
  assert.equal(byId.g3.outcome, 'draw');
  assert.equal(byId.g5.outcomeLabel, 'Unfinished');
  assert.equal(byId.g4.colour, 'Black');
  assert.equal(byId.g4.opponent, 'Bob');
  assert.equal(gameFromPlayerSide(game('x', '', 'CC-010', '0-1', null), 'CC-010').outcome, 'win');
});

test('accuracy is the player\'s own side only, rounded, and absent when not analysed', () => {
  const byId = Object.fromEntries(aliceHome().recentGames.map((g) => [g.id, g]));
  assert.equal(byId.g6.accuracy, 71);
  assert.equal(byId.g3.accuracy, 65, 'Alice\'s 64.6, not Bob\'s 88 from the same game');
  assert.equal(byId.g5.analysed, false);
  assert.equal(byId.g5.accuracy, null);
});

test('an analysis row for the right side but another player is not borrowed', () => {
  const games = recentGamesFor(
    [game('z', 'CC-010', 'CC-011', '1-0', '2026-11-01T00:00:00Z')],
    [analysis('z', 'CC-011', 'w', 99)],
    'CC-010',
  );
  assert.equal(games[0].analysed, false);
  assert.equal(games[0].accuracy, null);
});

test('a game against a retired member is still the player\'s own game', () => {
  // Retirement hides the retired member; it does not erase who they played.
  const home = aliceHome({ games: [game('r1', 'CC-010', 'CC-003', '1-0', '2026-11-01T00:00:00Z')] });
  assert.deepEqual(home.recentGames.map((g) => g.id), ['r1']);
});

/* ── homework (optional) ─────────────────────────────────────────────────── */

test('no homework list given: no homework block at all', () => {
  assert.equal(aliceHome().homework, null);
  assert.equal(homeworkView(undefined, 'CC-010', NOW), null);
});

test('an empty homework list is a block with nothing due', () => {
  assert.deepEqual(aliceHome({ homework: [] }).homework, { items: [], dueCount: 0, overdueCount: 0 });
});

test('homework: done and other players\' items dropped, soonest first, overdue flagged', () => {
  const view = homeworkView([
    { id: 'h1', title: 'Forks set', dueAt: new Date(NOW + 3 * DAY).toISOString(), theme: 'Fork' },
    { id: 'h2', title: 'Back rank', dueAt: new Date(NOW - DAY).toISOString(), theme: 'backRankMate' },
    { id: 'h3', title: 'Done already', dueAt: new Date(NOW - DAY).toISOString(), done: true },
    { id: 'h4', title: 'Bob only', dueAt: new Date(NOW).toISOString(), playerId: 'CC-011' },
    { id: 'h5', title: 'Whenever', theme: 'Invented theme' },
  ], 'CC-010', NOW);
  assert.deepEqual(view.items.map((i) => i.id), ['h2', 'h1', 'h5']);
  assert.equal(view.overdueCount, 1);
  assert.equal(view.items[0].href, '#/training?theme=backRankMate');
  assert.equal(view.items[1].href, '#/training?theme=fork');
  assert.equal(view.items[2].href, '#/training', 'an unknown theme goes to the unfiltered page');
});

test('a bare due date counts as due by the end of that day, in local time', () => {
  // Built from NOW in the machine's own zone, so this holds in Dallas and in CI.
  const localDate = (t) => {
    const d = new Date(t);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const view = homeworkView([
    { id: 'today', title: 'Today', dueAt: localDate(NOW) },
    { id: 'yesterday', title: 'Yesterday', dueAt: localDate(NOW - DAY) },
  ], 'CC-010', NOW);
  const byId = Object.fromEntries(view.items.map((i) => [i.id, i]));
  assert.equal(byId.today.overdue, false);
  assert.equal(byId.yesterday.overdue, true);
});

test('homework hrefs are in-app routes only', () => {
  const view = homeworkView([
    { id: 'bad', title: 'x', href: 'javascript:alert(1)' },
    { id: 'ext', title: 'y', href: 'https://example.com' },
    { id: 'ok', title: 'z', href: '#/my-games' },
  ], 'CC-010', NOW);
  const byId = Object.fromEntries(view.items.map((i) => [i.id, i.href]));
  assert.equal(byId.bad, '#/training');
  assert.equal(byId.ext, '#/training');
  assert.equal(byId.ok, '#/my-games');
});

/* ── the next step ───────────────────────────────────────────────────────── */

test('next step: the coach\'s homework comes before the engine\'s drill', () => {
  const home = aliceHome({ homework: [{ id: 'h', title: 'Pins', dueAt: '2026-11-12', theme: 'Pin' }] });
  assert.deepEqual(home.nextStep, { href: '#/training?theme=pin', label: 'Homework: Pins', reason: 'homework' });
});

test('next step: the priority drill when there is one', () => {
  assert.equal(aliceHome().nextStep.href, '#/training?theme=hangingPiece');
  assert.equal(aliceHome().nextStep.reason, 'priority');
});

test('next step: review positions when there is no priority', () => {
  const step = aliceHome({ analyses: [] }).nextStep;
  assert.equal(step.reason, 'reviews');
  assert.equal(step.label, 'Review 2 positions from your games');
});

test('next step: their games when nothing is due and there is no priority', () => {
  assert.equal(aliceHome({ analyses: [], ownPuzzles: [] }).nextStep.href, '#/my-games');
});

test('a brand-new member: empty everything, and sent to play a game', () => {
  const home = buildPlayerHome({ player: { playerId: 'CC-020', name: 'New' }, viewer: { role: 'player', playerId: 'CC-020' }, games: GAMES, analyses: ANALYSES, skillRows: ALICE_SKILLS, ownPuzzles: PUZZLES, now: NOW });
  assert.equal(home.available, true);
  assert.equal(home.isNewMember, true);
  assert.equal(home.gamesCount, 0);
  assert.deepEqual(home.recentGames, []);
  assert.equal(home.priority, null);
  assert.equal(home.reviews.due, 0);
  assert.equal(home.measuredCount, 0);
  assert.deepEqual(home.nextStep, { href: '#/play', label: 'Play a game', reason: 'new' });
});
