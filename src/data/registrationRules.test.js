import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGrade,
  gradeSection,
  attendanceRate,
  checkRegistration,
  canAddToSlot,
  suggestSlot,
  rankCandidates,
  registrationRows,
  csvField,
  registrationCsv,
  registrationText,
  MAX_PER_COACH,
} from './registrationRules.js';

const reg = (i, slot, extra = {}) => ({
  playerId: `CC-${100 + i}`,
  name: `Player ${String(i).padStart(2, '0')}`,
  grade: String(9 + (i % 4)),
  coachSlot: slot,
  answer: 'yes',
  ...extra,
});
const many = (n, slot, offset = 0) => Array.from({ length: n }, (_, i) => reg(i + offset, slot));
const coaches = ['Ms. Rivera', 'Mr. Okafor'];

test('parseGrade: the forms a roster actually holds', () => {
  assert.equal(parseGrade('9'), 9);
  assert.equal(parseGrade(' 10th '), 10);
  assert.equal(parseGrade('Grade 11'), 11);
  assert.equal(parseGrade('12th grade'), 12);
  assert.equal(parseGrade('Senior'), 12);
  assert.equal(parseGrade(11), 11);
});

test('parseGrade: not high school, or not a grade, is null — never clamped', () => {
  assert.equal(parseGrade('8'), null);
  assert.equal(parseGrade('13'), null);
  assert.equal(parseGrade(''), null);
  assert.equal(parseGrade(null), null);
  assert.equal(parseGrade('K'), null);
  assert.equal(parseGrade('9-10'), null);
  assert.equal(parseGrade(9.5), null);
});

test('gradeSection: 9-10 and 11-12', () => {
  assert.equal(gradeSection('9'), '9-10');
  assert.equal(gradeSection('10'), '9-10');
  assert.equal(gradeSection('11'), '11-12');
  assert.equal(gradeSection('Senior'), '11-12');
  assert.equal(gradeSection('7'), null);
});

test('attendanceRate: present over recorded, null with no record', () => {
  assert.equal(attendanceRate([{ present: true }, { present: false }, { present: true }, { present: true }]), 0.75);
  assert.equal(attendanceRate([]), null);
  assert.equal(attendanceRate(null), null);
  assert.equal(attendanceRate([{ date: 'x' }]), null);
});

test('checkRegistration: 10 per coach, 20 total, sections counted — a clean list passes', () => {
  const list = [...many(10, 1), ...many(10, 2, 10)];
  const result = checkRegistration(list, { coachNames: coaches });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.counts.total, 20);
  assert.equal(result.counts.slot1, 10);
  assert.equal(result.counts.sections['9-10'] + result.counts.sections['11-12'], 20);
});

test('checkRegistration: an 11th student for one coach is an error', () => {
  const result = checkRegistration(many(11, 1), { coachNames: coaches });
  assert.equal(result.ok, false);
  const over = result.errors.find((e) => e.code === 'slot-over');
  assert.ok(over);
  assert.match(over.message, /Ms\. Rivera has 11 students; the district limit is 10 per coach/);
});

test('checkRegistration: fewer than 6 students warns about the halved stipend', () => {
  const five = checkRegistration(many(5, 1), { coachNames: coaches });
  assert.equal(five.ok, true);
  assert.ok(five.warnings.some((w) => w.code === 'below-floor' && /halves the coach's stipend/.test(w.message)));
  const six = checkRegistration(many(6, 1), { coachNames: coaches });
  assert.equal(six.warnings.some((w) => w.code === 'below-floor'), false);
  assert.ok(checkRegistration([], {}).warnings.some((w) => w.code === 'below-floor'));
});

test('checkRegistration: a third coach, a duplicate, and a missing grade are errors', () => {
  const list = [reg(1, 3), reg(2, 1), reg(2, 1), reg(3, 1, { grade: '' }), reg(4, 2, { grade: '8' })];
  const codes = checkRegistration(list, { coachNames: coaches }).errors.map((e) => e.code).sort();
  assert.deepEqual(codes, ['bad-slot', 'duplicate', 'no-section', 'no-section']);
});

test('checkRegistration: warns about a maybe, a no-answer and an unnamed coach', () => {
  const list = [...many(6, 1), reg(20, 2, { answer: 'maybe' }), reg(21, 2, { answer: null })];
  const result = checkRegistration(list, { coachNames: ['Ms. Rivera', ''] });
  assert.equal(result.ok, true);
  const codes = result.warnings.map((w) => w.code);
  assert.deepEqual(codes.filter((c) => c === 'not-yes').length, 2);
  assert.ok(codes.includes('coach-unnamed'));
});

test('canAddToSlot refuses the 11th with the reason; suggestSlot balances and returns null when full', () => {
  const ten = many(MAX_PER_COACH, 1);
  const refusal = canAddToSlot(ten, 1, { coachNames: coaches });
  assert.equal(refusal.ok, false);
  assert.match(refusal.reason, /already has 10 students/);
  assert.equal(canAddToSlot(ten, 2).ok, true);
  assert.equal(canAddToSlot(ten, 3).ok, false);
  assert.equal(suggestSlot([]), 1);
  assert.equal(suggestSlot(many(3, 1)), 2);
  assert.equal(suggestSlot(ten), 2);
  assert.equal(suggestSlot([...ten, ...many(10, 2, 10)]), null);
});

test('rankCandidates: main key descending, nulls last, ties broken by the other keys then name', () => {
  const candidates = [
    { playerId: 'a', name: 'Ann', readinessPercent: 50, rating: 900, attendance: 1 },
    { playerId: 'b', name: 'Bo', readinessPercent: 75, rating: null, attendance: 0.5 },
    { playerId: 'c', name: 'Cy', readinessPercent: null, rating: 1400, attendance: null },
    { playerId: 'd', name: 'Di', readinessPercent: 50, rating: 1100, attendance: 0.2 },
  ];
  assert.deepEqual(rankCandidates(candidates, 'readiness').map((c) => c.playerId), ['b', 'd', 'a', 'c']);
  assert.deepEqual(rankCandidates(candidates, 'rating').map((c) => c.playerId), ['c', 'd', 'a', 'b']);
  assert.deepEqual(rankCandidates(candidates, 'attendance').map((c) => c.playerId), ['a', 'b', 'd', 'c']);
  // An unknown order falls back to readiness rather than throwing.
  assert.deepEqual(rankCandidates(candidates, 'vibes').map((c) => c.playerId), ['b', 'd', 'a', 'c']);
  // It never mutates the input.
  assert.equal(candidates[0].playerId, 'a');
});

test('registrationRows: coach, then section (9-10 first), then name; unsectioned students kept, last', () => {
  const rows = registrationRows(
    [reg(3, 2, { name: 'Zed', grade: '9' }), reg(1, 1, { name: 'Amy', grade: '12' }), reg(2, 1, { name: 'Bob', grade: '10' }), reg(4, 1, { name: 'Cal', grade: '' })],
    { coachNames: coaches },
  );
  assert.deepEqual(
    rows.map((r) => [r.coach, r.name, r.grade, r.section]),
    [
      ['Ms. Rivera', 'Bob', 10, '9-10'],
      ['Ms. Rivera', 'Amy', 12, '11-12'],
      ['Ms. Rivera', 'Cal', null, ''],
      ['Mr. Okafor', 'Zed', 9, '9-10'],
    ],
  );
});

test('csvField quotes what needs quoting and defuses spreadsheet formulas', () => {
  assert.equal(csvField('Ana Lopez'), 'Ana Lopez');
  assert.equal(csvField('Lopez, Ana'), '"Lopez, Ana"');
  assert.equal(csvField('Ana "AJ" Lopez'), '"Ana ""AJ"" Lopez"');
  assert.equal(csvField('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvField('+1'), "'+1");
  assert.equal(csvField('-5'), "'-5");
  assert.equal(csvField('@me'), "'@me");
  assert.equal(csvField(null), '');
  assert.equal(csvField(10), '10');
});

test('registrationCsv: header plus one CRLF line per student', () => {
  const csv = registrationCsv(registrationRows([reg(1, 1, { name: 'Amy', grade: '12' })], { coachNames: coaches }));
  assert.equal(csv, 'Name,Grade,Section,Coach\r\nAmy,12,11-12,Ms. Rivera\r\n');
  assert.equal(registrationCsv([]), 'Name,Grade,Section,Coach\r\n');
});

test('registrationText: grouped by coach with counts and a total', () => {
  const rows = registrationRows([reg(1, 1, { name: 'Amy', grade: '12' }), reg(2, 2, { name: 'Bob', grade: '9' })], {
    coachNames: coaches,
  });
  const text = registrationText(rows, { eventName: 'Fall', eventDate: 'Sat Oct 24, 2026', venue: 'W.T. White HS' });
  assert.equal(
    text,
    [
      'Fall · Sat Oct 24, 2026 · W.T. White HS',
      '',
      'Ms. Rivera (1 student)',
      '1. Amy, grade 12, section 11-12',
      '',
      'Mr. Okafor (1 student)',
      '1. Bob, grade 9, section 9-10',
      '',
      'Total: 2',
    ].join('\n'),
  );
});
