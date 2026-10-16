import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWhoAreYou,
  shouldAskWhoAreYou,
  linkOutcomeMessage,
  buildLinkOverview,
} from './accountLinking.js';

// Every name, email and ID below is made up.

test('validate: trims names and accepts an ID typed with spaces or a dash', () => {
  const r = validateWhoAreYou({ firstName: '  Alpha ', lastName: 'Member  Two', studentId: '123-45 67' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { firstName: 'Alpha', lastName: 'Member Two', studentId: '1234567' });
});

test('validate: names each missing or bad field (should fail on a 6-digit ID)', () => {
  const r = validateWhoAreYou({ firstName: '', lastName: ' ', studentId: '123456' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.firstName && r.errors.lastName);
  assert.match(r.errors.studentId, /7 digits/);
  assert.match(validateWhoAreYou({ firstName: 'A', lastName: 'B' }).errors.studentId, /Type your student ID/);
});

const member = { loading: false, isApproved: true, isCoach: false };
const ready = { status: 'ready', available: true, answered: false, playerId: null, studentId: null };

test('ask: an approved member who has not answered is asked', () => {
  assert.equal(shouldAskWhoAreYou({ configured: true, account: member, link: ready }), true);
});

test('ask: never twice, never a coach, never before approval or before 0025 is applied', () => {
  const ask = (over) => shouldAskWhoAreYou({ configured: true, account: member, link: ready, ...over });
  assert.equal(ask({ link: { ...ready, answered: true } }), false);
  assert.equal(ask({ account: { ...member, isCoach: true } }), false);
  assert.equal(ask({ account: { ...member, isApproved: false } }), false);
  assert.equal(ask({ account: { ...member, loading: true } }), false);
  assert.equal(ask({ link: { ...ready, available: false } }), false);
  assert.equal(ask({ link: { ...ready, status: 'loading' } }), false);
  assert.equal(ask({ configured: false }), false);
});

test('ask: not asked when the coach already linked them to a row with a student ID', () => {
  const link = { ...ready, playerId: 'CC-005', studentId: '1234567' };
  assert.equal(shouldAskWhoAreYou({ configured: true, account: member, link }), false);
  // Linked but no ID on file yet: still asked, so the ID gets recorded.
  assert.equal(
    shouldAskWhoAreYou({ configured: true, account: member, link: { ...ready, playerId: 'CC-005' } }),
    true,
  );
});

test('outcome messages are plain and never mention another member', () => {
  for (const outcome of ['matched', 'updated', 'created', 'clash', undefined]) {
    assert.match(linkOutcomeMessage(outcome), /^Thanks!/);
  }
  assert.match(linkOutcomeMessage('clash'), /coach/);
});

const players = [
  { playerId: 'CC-002', userId: 'u-coach', name: 'Coach Example' },
  { playerId: 'CC-005', userId: 'u1', name: 'Alpha Imported' },
  { playerId: 'CC-006', userId: null, name: 'Beta Imported' },
  { playerId: 'CC-007', userId: 'u4', name: 'Delta Typed' },
];
const privateById = { 'CC-005': { studentId: '1234567' }, 'CC-006': { studentId: '7654321' } };
const accounts = [
  { userId: 'u-coach', email: 'coach@example.test', role: 'coach', status: 'approved' },
  { userId: 'u1', email: 'u1@example.test', role: 'player', status: 'approved' },
  { userId: 'u2', email: 'u2@example.test', role: 'player', status: 'approved' },
  { userId: 'u3', email: 'u3@example.test', role: 'player', status: 'pending' },
  { userId: 'u4', email: 'u4@example.test', role: 'player', status: 'approved' },
];
const links = [
  { userId: 'u1', firstName: 'Alpha', lastName: 'Member', studentId: '1234567', playerId: 'CC-005', outcome: 'matched' },
  { userId: 'u4', firstName: 'Delta', lastName: 'Typed', studentId: '7654321', playerId: 'CC-007', outcome: 'clash' },
];

test('overview: linked rows, unlinked approved accounts, rows with no account', () => {
  const o = buildLinkOverview({ players, privateById, accounts, links });
  assert.deepEqual(o.linked.map((r) => r.player.playerId), ['CC-005', 'CC-002', 'CC-007']);
  assert.equal(o.linked.find((r) => r.player.playerId === 'CC-002').isCoach, true);
  assert.equal(o.linked.find((r) => r.player.playerId === 'CC-005').studentId, '1234567');
  // u3 is pending and the coach is linked: neither is "not linked".
  assert.deepEqual(o.unlinkedAccounts.map((r) => r.account.userId), ['u2']);
  assert.deepEqual(o.rowsWithoutAccount.map((r) => r.player.playerId), ['CC-006']);
});

test('overview: an open clash names the row that already holds the typed ID', () => {
  const o = buildLinkOverview({ players, privateById, accounts, links });
  assert.equal(o.needsAttention.length, 1);
  assert.equal(o.needsAttention[0].typedName, 'Delta Typed');
  assert.equal(o.needsAttention[0].holder.playerId, 'CC-006');
  assert.equal(o.needsAttention[0].current.playerId, 'CC-007');
  // Resolved by the coach: no longer listed.
  const resolved = links.map((l) => (l.userId === 'u4' ? { ...l, resolvedAt: '2026-10-05' } : l));
  assert.equal(buildLinkOverview({ players, privateById, accounts, links: resolved }).needsAttention.length, 0);
});

test('overview: flags a linked row whose ID differs from what the member typed', () => {
  const typo = [{ ...links[0], studentId: '1234568' }];
  const o = buildLinkOverview({ players, privateById, accounts, links: typo });
  assert.equal(o.linked.find((r) => r.player.playerId === 'CC-005').typedDifferent, true);
  assert.equal(buildLinkOverview({ players, privateById, accounts, links }).linked
    .find((r) => r.player.playerId === 'CC-005').typedDifferent, false);
});

test('overview: empty inputs give empty lists', () => {
  const o = buildLinkOverview();
  assert.deepEqual(o, { linked: [], unlinkedAccounts: [], rowsWithoutAccount: [], needsAttention: [] });
});
