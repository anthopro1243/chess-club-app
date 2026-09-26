import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIsoDate,
  addDays,
  daysBetween,
  weekday,
  chicagoDate,
  formatDate,
  defaultRegistrationClose,
  defaultTransportDue,
  resolveDeadlines,
  remindersFor,
  deadlineStage,
  relativeDays,
  upcomingDeadlines,
  nextEvent,
  validateEvent,
  cleanEvent,
  SEED_EVENTS,
} from './officialEvents.js';

const OCT24 = SEED_EVENTS[0];

test('isIsoDate: accepts real dates and rejects impossible or sloppy ones', () => {
  assert.equal(isIsoDate('2026-10-24'), true);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('2026-1-5'), false);
  assert.equal(isIsoDate('10/24/2026'), false);
  assert.equal(isIsoDate(''), false);
  assert.equal(isIsoDate(null), false);
  assert.equal(isIsoDate(20261024), false);
});

test('calendar arithmetic crosses month ends and the November DST change without drifting', () => {
  assert.equal(addDays('2026-10-24', -21), '2026-10-03');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  // Nov 1 2026 is the day US clocks fall back; a 25-hour day must still be one day.
  assert.equal(addDays('2026-10-31', 2), '2026-11-02');
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
  // March 8 2026 springs forward: a 23-hour day is still one day.
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(daysBetween('2026-10-24', '2026-10-16'), -8);
  assert.equal(weekday('2026-10-24'), 6);
  assert.equal(weekday('2026-10-16'), 5);
});

test('addDays refuses a non-date instead of returning a wrong one', () => {
  assert.throws(() => addDays('2026-02-30', 1));
  assert.throws(() => daysBetween('soon', '2026-10-24'));
});

test('chicagoDate: late evening in Dallas is still that day even though UTC has moved on', () => {
  // 04:30 UTC on Oct 2 is 11:30 pm CDT on Oct 1.
  assert.equal(chicagoDate(new Date('2026-10-02T04:30:00Z')), '2026-10-01');
  assert.equal(chicagoDate(new Date('2026-10-02T05:30:00Z')), '2026-10-02');
  // After the fall-back (CST, UTC-6): 05:30 UTC on Nov 3 is 11:30 pm on Nov 2.
  assert.equal(chicagoDate(new Date('2026-11-03T05:30:00Z')), '2026-11-02');
  assert.equal(chicagoDate('2026-10-24T15:00:00Z'), '2026-10-24');
  assert.equal(chicagoDate('not a time'), null);
});

test('formatDate never shifts the day, whatever zone the machine is in', () => {
  assert.equal(formatDate('2026-10-16'), 'Fri Oct 16');
  assert.equal(formatDate('2026-10-24', { withYear: true }), 'Sat Oct 24, 2026');
  assert.equal(formatDate('2026-10-02', { withWeekday: false }), 'Oct 2');
  assert.equal(formatDate('garbage'), '');
});

test('the Oct 24 event: registration closes Fri Oct 16, transport forms due Fri Oct 2', () => {
  assert.equal(defaultRegistrationClose('2026-10-24'), '2026-10-16');
  assert.equal(defaultTransportDue('2026-10-24'), '2026-10-02');
  const deadlines = resolveDeadlines(OCT24);
  assert.deepEqual(
    deadlines.map((d) => [d.key, d.date, d.isDefault]),
    [
      ['transport', '2026-10-02', true],
      ['registration', '2026-10-16', true],
    ],
  );
});

test('registration: the Friday before the event week, for events on other days', () => {
  // A Sunday event belongs to the Monday-Sunday week that began six days earlier.
  assert.equal(defaultRegistrationClose('2026-10-25'), '2026-10-16');
  // A Wednesday event: its week starts Mon Oct 19, so again Fri Oct 16.
  assert.equal(defaultRegistrationClose('2026-10-21'), '2026-10-16');
  // A Monday event: the Friday three days earlier.
  assert.equal(defaultRegistrationClose('2026-10-19'), '2026-10-16');
  // Never the Friday of the event week itself.
  assert.notEqual(defaultRegistrationClose('2026-10-24'), '2026-10-23');
});

test('transport: three weeks before, pulled back to Friday when that lands on a weekend', () => {
  assert.equal(defaultTransportDue('2026-10-25'), '2026-10-02'); // Sun - 21 = Sun Oct 4 -> Fri Oct 2
  assert.equal(defaultTransportDue('2026-10-21'), '2026-09-30'); // Wed stays Wed
  assert.equal(weekday(defaultTransportDue('2026-10-24')), 5);
});

test('a date the coach typed wins over the district rule, and says so', () => {
  const deadlines = resolveDeadlines({ ...OCT24, registrationCloses: '2026-10-14', transportDue: '' });
  const reg = deadlines.find((d) => d.key === 'registration');
  const transport = deadlines.find((d) => d.key === 'transport');
  assert.deepEqual([reg.date, reg.isDefault], ['2026-10-14', false]);
  assert.deepEqual([transport.date, transport.isDefault], ['2026-10-02', true]);
});

test('resolveDeadlines: an event with no valid date has no deadlines', () => {
  assert.deepEqual(resolveDeadlines({ name: 'x', date: '' }), []);
  assert.deepEqual(resolveDeadlines(null), []);
});

test('reminders fall 7 and 2 days before each deadline', () => {
  assert.deepEqual(remindersFor('2026-10-16'), [
    { daysBefore: 7, date: '2026-10-09' },
    { daysBefore: 2, date: '2026-10-14' },
  ]);
  assert.deepEqual(
    remindersFor('2026-10-02').map((r) => r.date),
    ['2026-09-25', '2026-09-30'],
  );
});

test('deadlineStage walks upcoming -> soon -> urgent -> today -> past', () => {
  assert.equal(deadlineStage('2026-10-16', '2026-10-08').stage, 'upcoming');
  assert.equal(deadlineStage('2026-10-16', '2026-10-09').stage, 'soon');
  assert.equal(deadlineStage('2026-10-16', '2026-10-13').stage, 'soon');
  assert.equal(deadlineStage('2026-10-16', '2026-10-14').stage, 'urgent');
  assert.equal(deadlineStage('2026-10-16', '2026-10-16').stage, 'today');
  assert.deepEqual(deadlineStage('2026-10-16', '2026-10-17'), { daysLeft: -1, stage: 'past' });
});

test('relativeDays reads naturally', () => {
  assert.equal(relativeDays(0), 'today');
  assert.equal(relativeDays(1), 'tomorrow');
  assert.equal(relativeDays(6), 'in 6 days');
  assert.equal(relativeDays(-3), '3 days ago');
});

test('upcomingDeadlines on Sat Sep 26: transport first and already inside its 7-day reminder', () => {
  const list = upcomingDeadlines(SEED_EVENTS, '2026-09-26');
  assert.deepEqual(
    list.map((d) => [d.key, d.date, d.stage, d.daysLeft]),
    [
      ['transport', '2026-10-02', 'soon', 6],
      ['registration', '2026-10-16', 'upcoming', 20],
    ],
  );
  // The 7-day reminder for transport (Sep 25) has passed; the next one is Wed Sep 30.
  assert.deepEqual(list[0].nextReminder, { daysBefore: 2, date: '2026-09-30' });
  assert.deepEqual(list[1].nextReminder, { daysBefore: 7, date: '2026-10-09' });
  assert.equal(list[0].eventName, OCT24.name);
});

test('upcomingDeadlines drops past deadlines and past events', () => {
  const afterTransport = upcomingDeadlines(SEED_EVENTS, '2026-10-03');
  assert.deepEqual(afterTransport.map((d) => d.key), ['registration']);
  assert.deepEqual(upcomingDeadlines(SEED_EVENTS, '2026-10-17'), []);
  assert.deepEqual(upcomingDeadlines(SEED_EVENTS, '2026-10-25'), []);
  assert.deepEqual(upcomingDeadlines([{ id: 'bad', name: 'No date' }], '2026-10-01'), []);
});

test('nextEvent picks the soonest event not yet played', () => {
  const spring = { id: 'spring', name: 'Spring', date: '2027-02-20' };
  assert.equal(nextEvent([spring, OCT24], '2026-09-26').id, OCT24.id);
  assert.equal(nextEvent([spring, OCT24], '2026-10-24').id, OCT24.id);
  assert.equal(nextEvent([spring, OCT24], '2026-10-25').id, 'spring');
  assert.equal(nextEvent([], '2026-10-25'), null);
});

test('validateEvent: the seed passes, and blank deadlines are allowed', () => {
  assert.deepEqual(validateEvent(OCT24), { ok: true, errors: {} });
});

test('validateEvent: rejects a missing name, a bad date, and deadlines on or after the event', () => {
  const { ok, errors } = validateEvent({
    name: '  ',
    date: '2026-10-24',
    registrationCloses: '2026-10-24',
    transportDue: '2026-10-31',
  });
  assert.equal(ok, false);
  assert.ok(errors.name);
  assert.match(errors.registrationCloses, /before the event/);
  assert.match(errors.transportDue, /before the event/);

  const noDate = validateEvent({ name: 'X', date: '2026-02-30' });
  assert.equal(noDate.ok, false);
  assert.ok(noDate.errors.date);

  const junkDeadline = validateEvent({ name: 'X', date: '2026-10-24', transportDue: 'next week' });
  assert.equal(junkDeadline.errors.transportDue, 'Not a real date.');

  assert.ok(validateEvent({ name: 'x'.repeat(121), date: '2026-10-24' }).errors.name);
});

test('cleanEvent trims text and stores a blank deadline as null (= district rule)', () => {
  const cleaned = cleanEvent({ ...OCT24, name: '  Fall  ', registrationCloses: '', transportDue: '2026-10-01' });
  assert.equal(cleaned.name, 'Fall');
  assert.equal(cleaned.registrationCloses, null);
  assert.equal(cleaned.transportDue, '2026-10-01');
});
