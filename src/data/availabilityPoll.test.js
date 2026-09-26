import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseAnswer,
  cleanTransportNote,
  validateAvailability,
  answersForEvent,
  summarisePoll,
  willingPlayerIds,
  TRANSPORT_NOTE_MAX,
} from './availabilityPoll.js';

const EV = 'disd-hs-fall-2026';
const roster = Array.from({ length: 30 }, (_, i) => ({ playerId: `CC-${100 + i}`, name: `P${i}` }));
const row = (playerId, answer, extra = {}) => ({ eventId: EV, playerId, answer, transportNote: '', answeredAt: '2026-09-29T23:00:00Z', ...extra });

test('normaliseAnswer: canonical answers and common shorthands', () => {
  assert.equal(normaliseAnswer('Yes'), 'yes');
  assert.equal(normaliseAnswer(' MAYBE '), 'maybe');
  assert.equal(normaliseAnswer('n'), 'no');
  assert.equal(normaliseAnswer('?'), 'maybe');
});

test('normaliseAnswer: anything else is refused, not guessed', () => {
  assert.equal(normaliseAnswer('probably'), null);
  assert.equal(normaliseAnswer(''), null);
  assert.equal(normaliseAnswer(null), null);
  assert.equal(normaliseAnswer(1), null);
});

test('cleanTransportNote collapses whitespace and caps the length', () => {
  assert.equal(cleanTransportNote('  needs   the\nbus '), 'needs the bus');
  assert.equal(cleanTransportNote(null), '');
  assert.equal(cleanTransportNote('x'.repeat(500)).length, TRANSPORT_NOTE_MAX);
});

test('validateAvailability: a good answer passes; missing ids, a bad answer and a long note fail', () => {
  assert.deepEqual(validateAvailability({ eventId: EV, playerId: 'CC-100', answer: 'yes' }), { ok: true, errors: [] });
  const bad = validateAvailability({ eventId: '', playerId: '', answer: 'sure', transportNote: 'x'.repeat(201) });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 4);
});

test('answersForEvent ignores other events, junk answers, and keeps the latest answer', () => {
  const rows = [
    row('CC-100', 'no', { answeredAt: '2026-09-29T20:00:00Z' }),
    row('CC-100', 'yes', { answeredAt: '2026-09-29T21:00:00Z' }),
    row('CC-101', 'yes', { eventId: 'spring-2027' }),
    row('CC-102', 'perhaps'),
    null,
  ];
  const map = answersForEvent(rows, EV);
  assert.equal(map.size, 1);
  assert.equal(map.get('CC-100').answer, 'yes');
});

test('summarisePoll: 30 members, counts and who has not answered', () => {
  const rows = [
    ...roster.slice(0, 12).map((p) => row(p.playerId, 'yes')),
    ...roster.slice(12, 16).map((p) => row(p.playerId, 'maybe')),
    ...roster.slice(16, 20).map((p) => row(p.playerId, 'no')),
  ];
  const poll = summarisePoll(roster, rows, EV);
  assert.deepEqual(poll.counts, { yes: 12, maybe: 4, no: 4 });
  assert.equal(poll.total, 30);
  assert.equal(poll.answeredCount, 20);
  assert.deepEqual(
    poll.unanswered.map((p) => p.playerId),
    roster.slice(20).map((p) => p.playerId),
  );
  assert.equal(poll.byAnswer.yes.length, 12);
});

test('summarisePoll: a retired member\'s answer does not count', () => {
  const rows = [row('CC-100', 'yes'), row('CC-999', 'yes')];
  const poll = summarisePoll(roster, rows, EV);
  assert.equal(poll.counts.yes, 1);
  assert.equal(poll.total, 30);
});

test('summarisePoll: collects transport notes with their answer', () => {
  const rows = [row('CC-100', 'yes', { transportNote: ' needs the bus ' }), row('CC-101', 'no', { transportNote: '' })];
  const poll = summarisePoll(roster, rows, EV);
  assert.deepEqual(
    poll.notes.map((n) => [n.player.playerId, n.answer, n.note]),
    [['CC-100', 'yes', 'needs the bus']],
  );
});

test('summarisePoll: empty inputs give an empty, well-formed poll', () => {
  const poll = summarisePoll([], [], EV);
  assert.deepEqual(poll.counts, { yes: 0, maybe: 0, no: 0 });
  assert.equal(poll.total, 0);
  assert.deepEqual(summarisePoll(null, null, EV).unanswered, []);
});

test('willingPlayerIds: yes only by default, maybe on request, never no', () => {
  const rows = [row('CC-100', 'yes'), row('CC-101', 'maybe'), row('CC-102', 'no')];
  assert.deepEqual(willingPlayerIds(rows, EV), ['CC-100']);
  assert.deepEqual(willingPlayerIds(rows, EV, { includeMaybe: true }).sort(), ['CC-100', 'CC-101']);
});
