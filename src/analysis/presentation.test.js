/*
 * The two rules that protect children, and the wording rules that decide
 * whether a beginner keeps opening the app.
 *
 * These are asserted here rather than in the UI because a rule enforced only
 * in JSX is not enforced: React hides pixels, not rows.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canViewAnalysis, visibleAnalyses, describeScore, trendLabel, categoryLine,
  playerSummary, coachSummary, suggestedRubric, isStaff, NOT_ENOUGH, NOT_MEASURABLE,
} from './presentation.js';

const coach = { role: 'coach', playerId: 'p-coach' };
const admin = { role: 'admin', playerId: null };
const alice = { role: 'player', playerId: 'p-alice' };
const bob = { role: 'player', playerId: 'p-bob' };

/* ── permissions ─────────────────────────────────────────────────────────── */

test('a player may see their own analysis', () => {
  assert.equal(canViewAnalysis(alice, 'p-alice'), true);
});

test('a player may NEVER see another player\'s analysis', () => {
  assert.equal(canViewAnalysis(alice, 'p-bob'), false);
  assert.equal(canViewAnalysis(bob, 'p-alice'), false);
});

test('coaches and admins see everything', () => {
  assert.equal(canViewAnalysis(coach, 'p-alice'), true);
  assert.equal(canViewAnalysis(admin, 'p-bob'), true);
  assert.equal(isStaff(coach), true);
  assert.equal(isStaff(alice), false);
});

test('unknown, pending, signed-out and parent viewers see nothing', () => {
  assert.equal(canViewAnalysis(null, 'p-alice'), false);
  assert.equal(canViewAnalysis({}, 'p-alice'), false);
  assert.equal(canViewAnalysis({ role: 'parent', playerId: 'p-alice' }, 'p-alice'), false);
  assert.equal(canViewAnalysis({ role: 'pending' }, 'p-alice'), false);
  // A whitelist, not a blacklist: a role nobody has thought of yet sees nothing.
  assert.equal(canViewAnalysis({ role: 'superuser' }, 'p-alice'), false);
});

test('a player with no id cannot slip through on a null match', () => {
  // The bug this guards: rows whose player_id is null matching a viewer whose
  // playerId is also null, handing an unlinked account someone else's data.
  assert.equal(canViewAnalysis({ role: 'player', playerId: null }, null), false);
  assert.equal(canViewAnalysis({ role: 'player' }, undefined), false);
});

test('visibleAnalyses filters a mixed list down to the viewer\'s own', () => {
  const rows = [
    { player_id: 'p-alice', accuracy: 71 },
    { player_id: 'p-bob', accuracy: 64 },
    { player_id: null, accuracy: 50 },
  ];
  assert.deepEqual(visibleAnalyses(alice, rows).map((r) => r.player_id), ['p-alice']);
  assert.equal(visibleAnalyses(coach, rows).length, 3);
  assert.equal(visibleAnalyses(null, rows).length, 0);
});

/* ── wording ─────────────────────────────────────────────────────────────── */

test('a low-confidence score is never rendered as a number', () => {
  const d = describeScore({ score: 8, confidence: 'low', measured: true, n: 4 });
  assert.equal(d.showNumber, false);
  assert.equal(d.display, NOT_ENOUGH);
  // The number is still carried, so a coach view can choose to show it.
  assert.equal(d.numeric, 8);
});

test('a medium or high confidence score is shown', () => {
  assert.equal(describeScore({ score: 62, confidence: 'medium', measured: true }).showNumber, true);
  assert.equal(describeScore({ score: 62, confidence: 'high', measured: true }).display, '62');
});

test('notation reports as unmeasurable, not as "not enough games"', () => {
  const d = describeScore({ score: null, confidence: 'none', measured: false, note: 'Not measurable from PGN' });
  assert.equal(d.display, NOT_MEASURABLE);
  assert.equal(d.showNumber, false);
});

test('an unmeasured category with no note reads as "not enough games yet"', () => {
  assert.equal(describeScore({ score: null, confidence: 'none', measured: false }).display, NOT_ENOUGH);
  assert.equal(describeScore(undefined).display, NOT_ENOUGH);
});

test('trend wording', () => {
  assert.equal(trendLabel(9), 'up 9');
  assert.equal(trendLabel(-4), 'down 4');
  assert.equal(trendLabel(0), 'steady');
  assert.equal(trendLabel(null), null);
});

test('a shown score leads with the trend, not the bare level', () => {
  const line = categoryLine('boardVision', { score: 46, confidence: 'medium', measured: true }, 9);
  assert.equal(line.label, 'Board vision');
  assert.match(line.text, /46, up 9 over recent games/);
});

test('a hidden score does not get a trend glued onto it', () => {
  const line = categoryLine('endgameTechnique', { score: 12, confidence: 'low', measured: true }, -20);
  assert.equal(line.text, NOT_ENOUGH);
});

/* ── the two audiences ───────────────────────────────────────────────────── */

const SCORES = {
  openingKnowledge: { score: 60, confidence: 'medium', measured: true, n: 30 },
  tacticalVision: { score: 41, confidence: 'high', measured: true, n: 60 },
  positionalUnderstanding: { score: 55, confidence: 'low', measured: true, n: 3 },
  endgameTechnique: { score: null, confidence: 'none', measured: false, n: 0 },
  timeManagement: { score: 70, confidence: 'medium', measured: true, n: 40 },
  boardVision: { score: 46, confidence: 'medium', measured: true, n: 33 },
  psychologicalResilience: { score: null, confidence: 'none', measured: false, n: 0 },
  notation: { score: null, confidence: 'none', measured: false, n: 0, note: 'Not measurable from PGN' },
};

test('the player view gives exactly one priority, not a list of failures', () => {
  const plan = { priorities: [
    { category: 'tacticalVision', advice: 'Drill forks', practice: { trainingTheme: 'Fork' } },
    { category: 'boardVision', advice: 'Slow down' },
  ] };
  const summary = playerSummary(SCORES, plan, { boardVision: 9 });
  assert.equal(summary.priority.category, 'tacticalVision');
  assert.equal(summary.priority.trainingTheme, 'Fork');
  assert.equal(summary.categories.length, 8);
  // Only the four confident ones become numbers for the player.
  assert.equal(summary.measuredCount, 4);
});

test('the coach view keeps the shaky numbers but always labels them', () => {
  const rows = coachSummary(SCORES, { tacticalVision: -3 });
  const positional = rows.find((r) => r.key === 'positionalUnderstanding');
  assert.equal(positional.score, 55);
  assert.match(positional.caveat, /low confidence, 3 observations/);
  const tactics = rows.find((r) => r.key === 'tacticalVision');
  assert.equal(tactics.caveat, null);
  assert.equal(tactics.trend, -3);
});

/* ── suggestions beside the coach's own scores ───────────────────────────── */

test('engine suggestions map onto the roster rubric keys and 0-10 scale', () => {
  const s = suggestedRubric(SCORES);
  assert.equal(s.opening.suggestion, 6); // 60 -> 6
  assert.equal(s.tactics.suggestion, 4);
  assert.equal(s.timeManagement.suggestion, 7);
  assert.equal(s.boardVision.suggestion, 5);
  assert.equal(s.opening.source, 'engine');
});

test('suggestions are withheld where the evidence is thin or absent', () => {
  const s = suggestedRubric(SCORES);
  assert.equal(s.positional, undefined, 'low confidence must not become a suggestion');
  assert.equal(s.endgame, undefined);
  assert.equal(s.resilience, undefined);
  assert.equal(s.notation, undefined);
});

test('suggestions never carry a coach score with them', () => {
  // The contract is additive: this object only ever describes the engine's
  // opinion, so a caller cannot accidentally write it over a manual rubric.
  const s = suggestedRubric(SCORES);
  for (const value of Object.values(s)) {
    assert.equal(value.source, 'engine');
    assert.ok(!('rubric' in value) && !('manual' in value));
  }
});

/* ── the loop: plan -> Training filter ───────────────────────────────────── */

test('every training theme maps onto a theme the shipped puzzles actually use', async () => {
  // Checked against the real data rather than a hand-written list, so this
  // fails if the puzzle set is ever re-imported with different tags.
  const { readFileSync } = await import('node:fs');
  const { PUZZLE_THEME_BY_TRAINING_THEME } = await import('./presentation.js');
  const puzzles = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url)));
  const available = new Set(puzzles.flatMap((p) => p.themes));

  for (const [label, key] of Object.entries(PUZZLE_THEME_BY_TRAINING_THEME)) {
    assert.ok(available.has(key), `"${label}" maps to "${key}", which no puzzle carries`);
    assert.ok(
      puzzles.some((p) => p.themes.includes(key)),
      `"${key}" would filter the Training page to zero puzzles`,
    );
  }
});

test('an unknown training theme yields null rather than an empty filter', async () => {
  const { puzzleThemeFor } = await import('./presentation.js');
  assert.equal(puzzleThemeFor('Fork'), 'fork');
  assert.equal(puzzleThemeFor('Back Rank Mate'), 'backRankMate');
  assert.equal(puzzleThemeFor('Something Invented'), null);
  assert.equal(puzzleThemeFor(null), null);
});
