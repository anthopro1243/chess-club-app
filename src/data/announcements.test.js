import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveAnnouncements, draftProblem, TITLE_MAX } from './announcements.js';

test('liveAnnouncements: pinned first, then newest', () => {
  const rows = [
    { id: 'a', createdAt: '2026-09-20T10:00:00Z' },
    { id: 'b', createdAt: '2026-09-25T10:00:00Z' },
    { id: 'c', createdAt: '2026-09-10T10:00:00Z', pinned: true },
  ];
  assert.deepEqual(liveAnnouncements(rows).map((r) => r.id), ['c', 'b', 'a']);
});

test('liveAnnouncements: archived ones are NOT shown, even if pinned', () => {
  const rows = [
    { id: 'a', createdAt: '2026-09-20T10:00:00Z', pinned: true, archivedAt: '2026-09-21T00:00:00Z' },
    { id: 'b', createdAt: '2026-09-19T10:00:00Z' },
  ];
  assert.deepEqual(liveAnnouncements(rows).map((r) => r.id), ['b']);
  assert.deepEqual(liveAnnouncements(null), []);
});

test('draftProblem: a title is required and bounded', () => {
  assert.equal(draftProblem({ title: '  ' }), 'Give it a title.');
  assert.match(draftProblem({ title: 'x'.repeat(TITLE_MAX + 1) }), /under 140/);
  assert.equal(draftProblem({ title: 'Mock round Tuesday', body: 'Bring a pen.' }), null);
});
