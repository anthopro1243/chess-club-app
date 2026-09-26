import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeSection, initials, publicName, mediaReleaseLabel } from './privacy.js';

test('gradeSection: 9 and 10 share a section, 11 and 12 share the other', () => {
  assert.equal(gradeSection(9), '9–10');
  assert.equal(gradeSection('10'), '9–10');
  assert.equal(gradeSection('11th'), '11–12');
  assert.equal(gradeSection('Grade 12'), '11–12');
});

test('gradeSection: anything outside 9–12 is unknown, not guessed', () => {
  assert.equal(gradeSection(8), null);
  assert.equal(gradeSection(''), null);
  assert.equal(gradeSection(null), null);
  assert.equal(gradeSection('senior'), null);
});

test('initials: handles hyphenated and single names', () => {
  assert.equal(initials('Ada Chen'), 'A. C.');
  assert.equal(initials('Anthony Villanueva-Parra'), 'A. V.-P.');
  assert.equal(initials('magnus'), 'M.');
  assert.equal(initials('  '), '—');
});

test('publicName: a full name only with a release on file', () => {
  assert.equal(publicName({ name: 'Ada Chen', mediaRelease: true }), 'Ada Chen');
});

test('publicName: NOT a full name when opted out or not recorded', () => {
  assert.equal(publicName({ name: 'Ada Chen', mediaRelease: false }), 'A. C.');
  assert.equal(publicName({ name: 'Ada Chen' }), 'A. C.');
  assert.equal(publicName({ name: 'Ada Chen', mediaRelease: 'yes' }), 'A. C.', 'only a real true counts');
  assert.equal(publicName(null), '—');
});

test('mediaReleaseLabel: unknown reads as no', () => {
  assert.equal(mediaReleaseLabel(true), 'On file');
  assert.equal(mediaReleaseLabel(false), 'Opted out');
  assert.match(mediaReleaseLabel(undefined), /treated as no/);
});
