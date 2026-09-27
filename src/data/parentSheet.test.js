import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildParentSheet, sheetAsText, TBC, SHEET_FIELDS, PACKING_LIST } from './parentSheet.js';

const EVENT = { id: 'disd-hs-fall-2026', name: 'Dallas ISD high school fall tournament', date: '2026-10-24', venue: 'W.T. White High School' };

const lines = (sheet) => sheet.sections.flatMap((s) => s.lines);

test('buildParentSheet: blank details print as "To be confirmed" and are listed as missing', () => {
  const sheet = buildParentSheet(EVENT, {});
  assert.ok(lines(sheet).includes(`Check-in: ${TBC}`));
  assert.ok(lines(sheet).includes('Venue: W.T. White High School'));
  assert.deepEqual(
    sheet.missing,
    SHEET_FIELDS.filter((f) => f.essential).map((f) => f.label),
  );
});

test('buildParentSheet: the district deadlines come from the event (Fri Oct 2 transport, Fri Oct 16 registration)', () => {
  const text = lines(buildParentSheet(EVENT, {})).join('\n');
  assert.match(text, /Transportation forms due: Fri,? Oct 2/);
  assert.match(text, /Registration closes: Fri,? Oct 16/);
});

test('buildParentSheet: filled details appear, trimmed, and nothing essential is missing', () => {
  const fields = {
    checkIn: '  7:30 am, main entrance ',
    firstRound: '8:30 am',
    meetingPoint: 'bus loop, 6:45 am',
    pickUp: '4:00 pm at school',
    coachContact: 'Remind group',
    schedule: '5 rounds, G/30 d5',
  };
  const sheet = buildParentSheet(EVENT, fields);
  assert.deepEqual(sheet.missing, []);
  assert.ok(lines(sheet).includes('Check-in: 7:30 am, main entrance'));
  assert.ok(lines(sheet).includes('Schedule: 5 rounds, G/30 d5'));
});

test('buildParentSheet: over-long text is cut to the field limit', () => {
  const sheet = buildParentSheet(EVENT, { extra: 'x'.repeat(2000) });
  const extra = lines(sheet).find((l) => /^x+$/.test(l));
  assert.equal(extra.length, SHEET_FIELDS.find((f) => f.key === 'extra').max);
});

test('buildParentSheet: no event, or an event without a real date, gives null (negative case)', () => {
  assert.equal(buildParentSheet(null, {}), null);
  assert.equal(buildParentSheet({ name: 'X', date: 'next Saturday' }, {}), null);
});

test('sheetAsText: headings and every packing item, and no student names', () => {
  const text = sheetAsText(buildParentSheet(EVENT, { extra: 'Bring a book' }));
  assert.match(text, /WHAT TO BRING/);
  for (const p of PACKING_LIST) assert.ok(text.includes(p.item));
  assert.ok(text.includes('Bring a book'));
  assert.equal(sheetAsText(null), '');
});
