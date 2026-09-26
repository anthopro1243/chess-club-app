import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES_QUESTIONS, RULES_PASS_MARK, scoreRulesQuiz, rulesPassScore } from './rulesQuiz.js';

const allRight = () => Object.fromEntries(RULES_QUESTIONS.map((q) => [q.id, q.answer]));
const wrongOn = (n) => {
  const answers = allRight();
  RULES_QUESTIONS.slice(0, n).forEach((q) => {
    answers[q.id] = (q.answer + 1) % q.options.length;
  });
  return answers;
};

test('the quiz has at least 10 well-formed questions with unique ids', () => {
  assert.ok(RULES_QUESTIONS.length >= 10);
  const ids = new Set();
  for (const q of RULES_QUESTIONS) {
    assert.ok(q.id && !ids.has(q.id), `duplicate or missing id ${q.id}`);
    ids.add(q.id);
    assert.ok(q.prompt.length > 10, q.id);
    assert.ok(q.options.length >= 3, q.id);
    assert.equal(new Set(q.options).size, q.options.length, `repeated option in ${q.id}`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id);
    assert.ok(q.explanation.length > 20, q.id);
  }
});

test('every explanation cites a rule or says it is etiquette', () => {
  for (const q of RULES_QUESTIONS) {
    assert.match(q.rule, /US Chess|etiquette/i, `${q.id} has no citation`);
  }
});

test('the spec topics are all covered', () => {
  const ids = RULES_QUESTIONS.map((q) => q.id);
  for (const topic of ['touch-move', 'illegal-move', 'scorekeeping-time-pressure', 'phones', 'coach-advice', 'handshake', 'draw-offer', 'triple-occurrence', 'call-the-td']) {
    assert.ok(ids.includes(topic), `missing ${topic}`);
  }
  const illegal = RULES_QUESTIONS.find((q) => q.id === 'illegal-move');
  assert.match(illegal.options[illegal.answer], /2 minutes/);
  assert.match(illegal.rule, /11D/);
});

test('the right answer is not always in the same position', () => {
  const positions = new Set(RULES_QUESTIONS.map((q) => q.answer));
  assert.ok(positions.size >= 3);
});

test('scoreRulesQuiz: all right passes', () => {
  const result = scoreRulesQuiz(allRight());
  assert.equal(result.correct, RULES_QUESTIONS.length);
  assert.equal(result.accuracy, 1);
  assert.equal(result.passed, true);
});

test('scoreRulesQuiz: the pass line sits at 80%', () => {
  const total = RULES_QUESTIONS.length;
  const need = rulesPassScore(total);
  assert.ok(need / total >= RULES_PASS_MARK);
  assert.ok((need - 1) / total < RULES_PASS_MARK);
  assert.equal(scoreRulesQuiz(wrongOn(total - need)).passed, true);
  assert.equal(scoreRulesQuiz(wrongOn(total - need + 1)).passed, false);
  assert.equal(rulesPassScore(10), 8);
});

test('scoreRulesQuiz: unanswered, out-of-range and non-integer answers count as wrong', () => {
  const answers = allRight();
  const [a, b, c] = RULES_QUESTIONS;
  delete answers[a.id];
  answers[b.id] = 99;
  answers[c.id] = String(c.answer);
  const result = scoreRulesQuiz(answers);
  assert.equal(result.correct, RULES_QUESTIONS.length - 3);
  assert.deepEqual(
    result.review.slice(0, 3).map((r) => [r.chosen, r.correct]),
    [
      [null, false],
      [null, false],
      [null, false],
    ],
  );
});

test('scoreRulesQuiz: answers to unknown questions are ignored, and nothing answered fails', () => {
  const result = scoreRulesQuiz({ 'not-a-question': 0 });
  assert.equal(result.correct, 0);
  assert.equal(result.passed, false);
  assert.equal(scoreRulesQuiz(null).passed, false);
  assert.equal(scoreRulesQuiz({}, []).passed, false);
});
