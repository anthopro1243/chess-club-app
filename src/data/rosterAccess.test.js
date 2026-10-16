import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterAccess } from './rosterAccess.js';

test('a coach can add, edit and remove, and sees every record', () => {
  assert.deepEqual(rosterAccess({ isCoach: true }), {
    canAdd: true, canEdit: true, canRemove: true, showCoachingRecord: true,
  });
});

test("a member looking at someone else sees no scores and no edit buttons", () => {
  assert.deepEqual(rosterAccess({ isCoach: false, isSelf: false }), {
    canAdd: false, canEdit: false, canRemove: false, showCoachingRecord: false,
  });
});

test('a member sees their own scores but cannot rewrite the coach rubric', () => {
  const access = rosterAccess({ isCoach: false, isSelf: true });
  assert.equal(access.showCoachingRecord, true);
  assert.equal(access.canEdit, false);
});

test('no viewer at all gets nothing', () => {
  assert.equal(rosterAccess().showCoachingRecord, false);
});
