import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toRubric, toEngineScale, hasCoachAssessment, resolveCategory,
  resolvePlayerSkills, clubProfile, weakestCategories,
} from './skillModel.js';

const engine = (score, confidence = 'medium', observations = 30) => ({ score, confidence, observations });

test('scale conversion is explicit in both directions', () => {
  assert.equal(toRubric(57), 6);
  assert.equal(toRubric(100), 10);
  assert.equal(toRubric(null), null);
  assert.equal(toEngineScale(5), 50);
  assert.equal(toEngineScale(null), null);
});

/* ── is the rubric a judgement, or an untouched form? ─────────────────────── */

test('a rubric where every category is identical is treated as unset', () => {
  // This is the real case: CC-002 sat on 5/5/5/5/5/5/5/5 with no dated
  // assessment, which is a blank form, not a coach saying all eight areas are
  // exactly equal. Treating it as authoritative is what hid the engine scores.
  const player = { playerId: 'p1', rubric: { opening: 5, tactics: 5, positional: 5, endgame: 5, timeManagement: 5, boardVision: 5, resilience: 5, notation: 5 } };
  assert.equal(hasCoachAssessment(player, []), false);
});

test('a rubric with any variation is a real assessment', () => {
  const player = { playerId: 'p1', rubric: { opening: 6, tactics: 4, positional: 5 } };
  assert.equal(hasCoachAssessment(player, []), true);
});

test('a dated assessment counts even if the rubric is flat', () => {
  const player = { playerId: 'p1', rubric: { opening: 5, tactics: 5 } };
  assert.equal(hasCoachAssessment(player, [{ playerId: 'p1' }]), true);
});

/* ── precedence ──────────────────────────────────────────────────────────── */

test('a coach score wins, with the engine shown beside it as a suggestion', () => {
  const r = resolveCategory('tacticalVision', { manualRubric: 7, engine: engine(40), coachAssessed: true });
  assert.equal(r.source, 'coach');
  assert.equal(r.rubricValue, 7);
  assert.equal(r.value, 70);
  assert.equal(r.suggestion, 4, 'the engine opinion is carried, converted to the rubric scale');
  assert.equal(r.showSuggestion, true);
});

test('the engine never overwrites a coach score', () => {
  const r = resolveCategory('tacticalVision', { manualRubric: 2, engine: engine(95, 'high'), coachAssessed: true });
  assert.equal(r.rubricValue, 2, 'the displayed value stays the coach number');
  assert.equal(r.source, 'coach');
});

test('with no coach assessment the engine score is used', () => {
  const r = resolveCategory('boardVision', { manualRubric: 5, engine: engine(33), coachAssessed: false });
  assert.equal(r.source, 'engine');
  assert.equal(r.value, 33);
  assert.equal(r.rubricValue, 3);
});

test('a low-confidence engine score is never shown as a number', () => {
  const r = resolveCategory('endgameTechnique', { manualRubric: null, engine: engine(12, 'low', 3), coachAssessed: false });
  assert.equal(r.source, 'none');
  assert.equal(r.value, null);
  assert.equal(r.rubricValue, null);
});

test('a low-confidence engine score is not offered as a suggestion either', () => {
  const r = resolveCategory('endgameTechnique', { manualRubric: 6, engine: engine(12, 'low', 3), coachAssessed: true });
  assert.equal(r.rubricValue, 6);
  assert.equal(r.showSuggestion, false);
  assert.equal(r.suggestion, null);
});

test('nothing measured at all resolves to none, not to zero', () => {
  const r = resolveCategory('notation', { manualRubric: null, engine: null, coachAssessed: false });
  assert.equal(r.source, 'none');
  assert.equal(r.value, null);
});

/* ── whole player, and the club ──────────────────────────────────────────── */

test('resolvePlayerSkills returns all eight categories', () => {
  const player = { playerId: 'p1', rubric: { opening: 5, tactics: 5, positional: 5, endgame: 5, timeManagement: 5, boardVision: 5, resilience: 5, notation: 5 } };
  const skills = { openingKnowledge: engine(57), boardVision: engine(33) };
  const rows = resolvePlayerSkills(player, skills, []);
  assert.equal(rows.length, 8);
  assert.equal(rows.find((r) => r.category === 'openingKnowledge').source, 'engine');
  assert.equal(rows.find((r) => r.category === 'openingKnowledge').rubricValue, 6);
  // unmeasured stays unmeasured rather than defaulting to the flat 5
  assert.equal(rows.find((r) => r.category === 'endgameTechnique').source, 'none');
});

test('the club profile ignores unmeasured categories instead of averaging them as zero', () => {
  // Averaging an unmeasured category as 0 is exactly what produced a flat 2.5
  // across all eight categories on the home page.
  const players = [
    { playerId: 'p1', rubric: {} },
    { playerId: 'p2', rubric: {} },
  ];
  const skills = {
    p1: { tacticalVision: engine(60) },
    p2: { tacticalVision: engine(40) },
  };
  const profile = clubProfile(players, skills, []);
  assert.equal(profile.tacticalVision.average, 50);
  assert.equal(profile.tacticalVision.measured, 2);
  assert.equal(profile.tacticalVision.engineBacked, 2);
  assert.equal(profile.endgameTechnique.average, null, 'no data must read as null, not 0');
  assert.equal(profile.endgameTechnique.measured, 0);
});

test('weakest categories skip the unmeasured and never suggest notation', () => {
  const players = [{ playerId: 'p1', rubric: {} }];
  const skills = { p1: { tacticalVision: engine(30), openingKnowledge: engine(80), boardVision: engine(55) } };
  const weakest = weakestCategories(clubProfile(players, skills, []), 3);
  assert.equal(weakest[0].category, 'tacticalVision');
  assert.ok(!weakest.some((w) => w.category === 'notation'));
  assert.ok(weakest.every((w) => w.average != null));
});
