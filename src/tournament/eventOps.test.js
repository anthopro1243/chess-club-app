import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clockIdForTimeControl,
  nextStep,
  pairNext,
  swapSeats,
  roundIssues,
  roundState,
  archiveCandidates,
  gameResultMatches,
  validateEventDraft,
  lateEntryByes,
  isValidResult,
  engineEntrants,
} from './eventOps.js';

const entrants = Array.from({ length: 6 }, (_, i) => ({
  id: `E${i + 1}`,
  playerId: `P${i + 1}`,
  name: `P${i + 1}`,
  rating: 1600 - i * 100,
  withdrawnFromRound: null,
  lateEntryRound: null,
}));
const event = (over = {}) => ({ id: 'T1', format: 'swiss', rounds: 3, pairedRounds: 0, status: 'draft', initialColour: 'w', ...over });
const withIds = (rows) => rows.map((r, i) => ({ ...r, id: `R${r.round}-${i}` }));

test('clockIdForTimeControl maps event controls onto the practice-clock presets', () => {
  assert.equal(clockIdForTimeControl('G/30 d5'), 'g30d5');
  assert.equal(clockIdForTimeControl('g/60;d5'), 'g60d5');
  assert.equal(clockIdForTimeControl('G/45 d5'), null);
  assert.equal(clockIdForTimeControl(''), null);
  assert.equal(clockIdForTimeControl(undefined), null);
});

test('nextStep: round 1 first, then blocked until every board has a result', () => {
  assert.deepEqual(nextStep(event(), []), { round: 1, canPair: true, reason: '' });
  const r1 = withIds(pairNext({ tournament: event(), entrants, pairings: [] }).rows);
  const blocked = nextStep(event({ pairedRounds: 1 }), r1);
  assert.equal(blocked.canPair, false);
  assert.match(blocked.reason, /3 boards without a result/);
  const done = r1.map((r) => ({ ...r, result: '1-0' }));
  assert.equal(nextStep(event({ pairedRounds: 1 }), done).canPair, true);
  assert.equal(nextStep(event({ pairedRounds: 3 }), done).canPair, false);
  assert.equal(nextStep(event({ status: 'finished' }), []).canPair, false);
  assert.equal(nextStep(null, []).canPair, false);
});

test('pairNext: a Swiss round comes from the Swiss engine, honouring the event colour', () => {
  const res = pairNext({ tournament: event({ initialColour: 'b' }), entrants, pairings: [] });
  assert.equal(res.ok, true);
  assert.equal(res.round, 1);
  assert.equal(res.rows[0].black, 'P1');
});

test('pairNext: a round robin plays its Berger round, and refuses a round it does not have', () => {
  const rr = event({ format: 'round-robin', rounds: 5 });
  const res = pairNext({ tournament: rr, entrants, pairings: [] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.rows.map((r) => [r.white, r.black]), [['P1', 'P6'], ['P2', 'P5'], ['P3', 'P4']]);
  const tooFar = pairNext({ tournament: { ...rr, rounds: 9, pairedRounds: 5 }, entrants, pairings: [] });
  assert.equal(tooFar.ok, false);
});

test('pairNext refuses while the last round is unfinished', () => {
  const r1 = withIds(pairNext({ tournament: event(), entrants, pairings: [] }).rows);
  const res = pairNext({ tournament: event({ pairedRounds: 1 }), entrants, pairings: r1 });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'cannot-pair');
});

// -- swaps ------------------------------------------------------------------

const round1 = () => withIds(pairNext({ tournament: event(), entrants: entrants.slice(0, 5), pairings: [] }).rows);

test('swapSeats: two seats on different boards exchange players', () => {
  const rows = round1();
  const [b1, b2] = rows.filter((r) => !r.byeType);
  const res = swapSeats(rows, { pairingId: b1.id, side: 'black' }, { pairingId: b2.id, side: 'white' });
  assert.equal(res.ok, true);
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].black, b2.white);
  assert.equal(res.rows[1].white, b1.black);
  assert.equal(res.detail.a.player, b1.black);
  assert.equal(res.detail.a.to, `board ${b2.board} white`);
});

test('swapSeats: both seats of one board flip colours', () => {
  const rows = round1();
  const b1 = rows.find((r) => r.board === 1);
  const res = swapSeats(rows, { pairingId: b1.id, side: 'white' }, { pairingId: b1.id, side: 'black' });
  assert.equal(res.ok, true);
  assert.deepEqual([res.rows[0].white, res.rows[0].black], [b1.black, b1.white]);
});

test('swapSeats: the pairing bye can move to a seated player', () => {
  const rows = round1();
  const bye = rows.find((r) => r.byeType === 'full');
  const b2 = rows.find((r) => r.board === 2);
  const res = swapSeats(rows, { pairingId: bye.id, side: 'white' }, { pairingId: b2.id, side: 'black' });
  assert.equal(res.ok, true);
  assert.equal(res.rows[0].white, b2.black);
  assert.equal(res.rows[1].black, bye.white);
  assert.equal(res.detail.a.from, 'bye');
});

test('swapSeats refuses: requested byes, finished boards, other rounds, the same seat, strangers', () => {
  const rows = round1();
  const b1 = rows.find((r) => r.board === 1);
  const b2 = rows.find((r) => r.board === 2);
  const half = { id: 'H', round: 1, board: null, white: 'P9', black: null, result: null, byeType: 'half' };
  assert.equal(swapSeats([...rows, half], { pairingId: 'H', side: 'white' }, { pairingId: b1.id, side: 'white' }).ok, false);
  const finished = rows.map((r) => (r.id === b1.id ? { ...r, result: '1-0' } : r));
  assert.match(swapSeats(finished, { pairingId: b1.id, side: 'white' }, { pairingId: b2.id, side: 'white' }).message, /already has a result/);
  const other = { ...b2, id: 'X', round: 2 };
  assert.equal(swapSeats([...rows, other], { pairingId: b1.id, side: 'white' }, { pairingId: 'X', side: 'white' }).ok, false);
  assert.equal(swapSeats(rows, { pairingId: b1.id, side: 'white' }, { pairingId: b1.id, side: 'white' }).ok, false);
  assert.equal(swapSeats(rows, { pairingId: 'nope', side: 'white' }, { pairingId: b1.id, side: 'white' }).ok, false);
  assert.equal(swapSeats(rows, { pairingId: b1.id, side: 'left' }, { pairingId: b2.id, side: 'white' }).ok, false);
  const bye = rows.find((r) => r.byeType === 'full');
  assert.equal(swapSeats(rows, { pairingId: bye.id, side: 'black' }, { pairingId: b2.id, side: 'white' }).ok, false);
});

test('roundIssues reports a rematch a swap created, in that round only', () => {
  const r1 = round1().map((r) => (r.byeType ? r : { ...r, result: '1-0' }));
  const b1 = r1.find((r) => r.board === 1);
  // Round 2 hand-made to repeat board 1 of round 1.
  const r2 = [{ id: 'Z', round: 2, board: 1, white: b1.black, black: b1.white, result: null, byeType: null }];
  const issues = roundIssues([...r1, ...r2], 2, (id) => id);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'rematch');
  assert.deepEqual(roundIssues(r1, 1, (id) => id), []);
});

test('roundState counts pending boards', () => {
  const rows = round1();
  const state = roundState(rows, 1);
  assert.equal(state.games.length, 2);
  assert.equal(state.byes.length, 1);
  assert.equal(state.pending, 2);
  assert.equal(state.complete, false);
  assert.equal(roundState([], 1).complete, false);
});

// -- archive links ------------------------------------------------------------

test('archiveCandidates: same White and Black only, nearest the event date first', () => {
  const games = [
    { id: 'g-old', whitePlayerId: 'P1', blackPlayerId: 'P2', playedAt: '2026-09-01T18:00:00Z', result: '1-0' },
    { id: 'g-night', whitePlayerId: 'P1', blackPlayerId: 'P2', playedAt: '2026-10-06T19:00:00Z', result: '0-1' },
    { id: 'g-reversed', whitePlayerId: 'P2', blackPlayerId: 'P1', playedAt: '2026-10-06T19:00:00Z', result: '1-0' },
    { id: 'g-other', whitePlayerId: 'P1', blackPlayerId: 'P3', playedAt: '2026-10-06T19:00:00Z', result: '1-0' },
  ];
  const board = { white: 'P1', black: 'P2', result: '0-1' };
  assert.deepEqual(archiveCandidates(games, board, '2026-10-06').map((g) => g.id), ['g-night', 'g-old']);
  assert.deepEqual(archiveCandidates(games, board, null).map((g) => g.id), ['g-night', 'g-old']);
  assert.deepEqual(archiveCandidates(games, { white: 'P1', black: null }, '2026-10-06'), []);
  assert.deepEqual(archiveCandidates(null, board, '2026-10-06'), []);
  assert.equal(gameResultMatches(games[1], board), true);
  assert.equal(gameResultMatches(games[0], board), false);
  assert.equal(gameResultMatches(games[0], { result: '1F-0F' }), null);
});

// -- drafts and late entries ----------------------------------------------------

test('validateEventDraft: names, round limits, field sizes', () => {
  assert.deepEqual(validateEventDraft({ name: 'Mock 1', rounds: 4, format: 'swiss', entrantCount: 15 }), []);
  assert.ok(validateEventDraft({ name: ' ', rounds: 4, format: 'swiss', entrantCount: 15 }).length);
  assert.ok(validateEventDraft({ name: 'x', rounds: 0, format: 'swiss', entrantCount: 15 }).length);
  assert.ok(validateEventDraft({ name: 'x', rounds: 4, format: 'swiss', entrantCount: 1 }).length);
  assert.match(validateEventDraft({ name: 'x', rounds: 4, format: 'swiss', entrantCount: 4 })[0], /3 or fewer/);
  assert.deepEqual(validateEventDraft({ name: 'x', rounds: 3, format: 'swiss', entrantCount: 3 }), []);
  assert.ok(validateEventDraft({ name: 'x', rounds: 9, format: 'round-robin', entrantCount: 11 }).length);
  assert.deepEqual(validateEventDraft({ name: 'x', rounds: 5, format: 'round-robin', entrantCount: 6 }), []);
});

test('lateEntryByes: one half-point bye per missed round, none for a round-1 entry', () => {
  assert.deepEqual(lateEntryByes('P9', 3).map((r) => [r.round, r.byeType, r.white]), [
    [1, 'half', 'P9'],
    [2, 'half', 'P9'],
  ]);
  assert.deepEqual(lateEntryByes('P9', 1), []);
});

test('isValidResult and engineEntrants guard the edges', () => {
  assert.equal(isValidResult('1-0'), true);
  assert.equal(isValidResult(null), true);
  assert.equal(isValidResult('1-1'), false);
  assert.deepEqual(engineEntrants([null, { name: 'no id' }]), []);
});
