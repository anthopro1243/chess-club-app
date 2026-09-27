/*
 * officialEvents.js — district tournaments, their deadlines, and when to nag.
 *
 * Pure logic: no React, no Supabase. The store (officialEventsStore.js) keeps
 * the rows; this module decides what the dates mean.
 *
 * Every date here is a CALENDAR date, 'YYYY-MM-DD', in the club's own time
 * zone (America/Chicago). Deadlines are days on a school calendar, not
 * instants, so they are never turned into a timestamp: `new Date('2026-10-16')`
 * is midnight UTC, which is the evening of Oct 15 in Dallas, and a banner
 * built on it says "due tomorrow" a day early. All arithmetic below runs on
 * Date.UTC day numbers, which have no daylight-saving gaps, and "today" is
 * read in Chicago explicitly rather than in whatever zone the device is set to.
 *
 * The Dallas ISD rules (research/FEATURE-RESEARCH.md, F070, source s63):
 *   - registration closes the Friday before the event week;
 *   - transportation forms are due three weeks before the event.
 * Reminders go out 7 and 2 days before each deadline.
 */

export const CLUB_TIME_ZONE = 'America/Chicago';

/** Days before a deadline on which the app starts, then escalates, reminding. */
export const REMINDER_DAYS = [7, 2];

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// Calendar-date arithmetic
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

/** True for a real calendar date written 'YYYY-MM-DD' (rejects 2026-02-30). */
export function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function toDayMs(date) {
  if (!isIsoDate(date)) throw new Error(`Not a calendar date: ${date}`);
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromDayMs(ms) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(date, days) {
  return fromDayMs(toDayMs(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from, to) {
  return Math.round((toDayMs(to) - toDayMs(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date) {
  return new Date(toDayMs(date)).getUTCDay();
}

/**
 * The calendar date in Chicago at a given instant. The default is "now", so
 * a coach opening the app at 11 pm on Thursday sees Thursday's banner even
 * though it is already Friday in UTC.
 */
export function chicagoDate(instant = new Date()) {
  const at = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 'Fri Oct 16', or 'Fri Oct 16, 2026' with `withYear`. Never shifts a day. */
export function formatDate(date, { withYear = false, withWeekday = true } = {}) {
  if (!isIsoDate(date)) return '';
  const [y, m, d] = date.split('-').map(Number);
  const head = withWeekday ? `${WEEKDAYS[weekday(date)]} ` : '';
  return `${head}${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

// ---------------------------------------------------------------------------
// The district's default deadlines
// ---------------------------------------------------------------------------

/**
 * "The Friday before the event week." The event week runs Monday to Sunday,
 * the way a school calendar reads, so a Saturday Oct 24 event sits in the
 * week of Mon Oct 19 and registration closes Fri Oct 16.
 */
export function defaultRegistrationClose(eventDate) {
  const sinceMonday = (weekday(eventDate) + 6) % 7;
  const monday = addDays(eventDate, -sinceMonday);
  return addDays(monday, -3);
}

/**
 * "Three weeks before the event." Three weeks before a Saturday event is a
 * Saturday, when no school office will take a form, so a weekend due date
 * moves back to that Friday. That is why the research reads "around Fri 2 Oct"
 * for the Oct 24 event rather than Sat 3 Oct.
 */
export function defaultTransportDue(eventDate) {
  const raw = addDays(eventDate, -21);
  const dow = weekday(raw);
  if (dow === 6) return addDays(raw, -1);
  if (dow === 0) return addDays(raw, -2);
  return raw;
}

export const DEADLINE_KINDS = {
  transport: 'Transportation forms due',
  registration: 'Registration closes',
};

/**
 * The two deadlines for an event, with the coach's own date winning over the
 * district default. `isDefault` lets the page say which is which, so a date
 * the coach typed in is never mistaken for one the app guessed.
 */
export function resolveDeadlines(event) {
  if (!event || !isIsoDate(event.date)) return [];
  const pick = (own, fallback) =>
    isIsoDate(own) ? { date: own, isDefault: false } : { date: fallback, isDefault: true };

  return [
    { key: 'transport', label: DEADLINE_KINDS.transport, ...pick(event.transportDue, defaultTransportDue(event.date)) },
    {
      key: 'registration',
      label: DEADLINE_KINDS.registration,
      ...pick(event.registrationCloses, defaultRegistrationClose(event.date)),
    },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/** The reminder dates for one deadline, earliest first. */
export function remindersFor(deadlineDate) {
  return REMINDER_DAYS.map((daysBefore) => ({ daysBefore, date: addDays(deadlineDate, -daysBefore) })).sort(
    (a, b) => a.date.localeCompare(b.date),
  );
}

/**
 * Where a deadline stands today.
 *   past     — gone
 *   today    — due today
 *   urgent   — inside the 2-day reminder
 *   soon     — inside the 7-day reminder
 *   upcoming — no reminder yet
 */
export function deadlineStage(deadlineDate, today) {
  const daysLeft = daysBetween(today, deadlineDate);
  if (daysLeft < 0) return { daysLeft, stage: 'past' };
  if (daysLeft === 0) return { daysLeft, stage: 'today' };
  if (daysLeft <= Math.min(...REMINDER_DAYS)) return { daysLeft, stage: 'urgent' };
  if (daysLeft <= Math.max(...REMINDER_DAYS)) return { daysLeft, stage: 'soon' };
  return { daysLeft, stage: 'upcoming' };
}

/** "today", "tomorrow", "in 6 days", "3 days ago". */
export function relativeDays(daysLeft) {
  if (daysLeft === 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  if (daysLeft === -1) return 'yesterday';
  return daysLeft > 0 ? `in ${daysLeft} days` : `${-daysLeft} days ago`;
}

/**
 * Every deadline still ahead, across every event that has not happened yet,
 * soonest first. Each carries its event, its stage and its next reminder, so
 * a banner can be drawn from this list alone.
 */
export function upcomingDeadlines(events, today) {
  const out = [];
  for (const event of events || []) {
    if (!isIsoDate(event?.date) || daysBetween(today, event.date) < 0) continue;
    for (const deadline of resolveDeadlines(event)) {
      const { daysLeft, stage } = deadlineStage(deadline.date, today);
      if (stage === 'past') continue;
      const nextReminder = remindersFor(deadline.date).find((r) => r.date >= today) || null;
      out.push({
        ...deadline,
        eventId: event.id,
        eventName: event.name,
        daysLeft,
        stage,
        nextReminder,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/** The next event on or after today, or null. */
export function nextEvent(events, today) {
  return (
    [...(events || [])]
      .filter((e) => isIsoDate(e?.date) && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null
  );
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * Check a coach's edit before it is saved. Returns `{ ok, errors }` where
 * `errors` is keyed by field. A deadline left blank is fine: it means "use
 * the district rule", and resolveDeadlines fills it in.
 */
export function validateEvent(draft) {
  const errors = {};
  const name = String(draft?.name ?? '').trim();
  if (!name) errors.name = 'Give the event a name.';
  else if (name.length > 120) errors.name = 'Keep the name under 120 characters.';

  if (!isIsoDate(draft?.date)) errors.date = 'Pick the day of the event.';

  if (String(draft?.venue ?? '').length > 160) errors.venue = 'Keep the venue under 160 characters.';

  for (const [field, label] of [
    ['registrationCloses', 'Registration'],
    ['transportDue', 'The transport-form deadline'],
  ]) {
    const value = draft?.[field];
    if (value == null || value === '') continue;
    if (!isIsoDate(value)) errors[field] = 'Not a real date.';
    else if (isIsoDate(draft?.date) && value >= draft.date) errors[field] = `${label} has to be before the event.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** Normalise a saved draft: trimmed text, blank deadlines stored as null (= district rule). */
export function cleanEvent(draft) {
  const blankToNull = (v) => (isIsoDate(v) ? v : null);
  return {
    ...draft,
    name: String(draft.name ?? '').trim(),
    venue: String(draft.venue ?? '').trim(),
    registrationCloses: blankToNull(draft.registrationCloses),
    transportDue: blankToNull(draft.transportDue),
    coach1Name: String(draft.coach1Name ?? '').trim(),
    coach2Name: String(draft.coach2Name ?? '').trim(),
    notes: String(draft.notes ?? '').trim(),
  };
}

/**
 * The one event the club is preparing for right now, pre-seeded so the page
 * is useful before anyone types anything. Both deadlines are left to the
 * district rule, which gives Fri Oct 16 (registration) and Fri Oct 2
 * (transport forms); the coach can overwrite either.
 */
export const SEED_EVENTS = [
  {
    id: 'disd-hs-fall-2026',
    name: 'Dallas ISD high school fall tournament',
    date: '2026-10-24',
    venue: 'W.T. White High School',
    registrationCloses: null,
    transportDue: null,
    coach1Name: '',
    coach2Name: '',
    notes: 'Format, time control and notation rule still to confirm with the district contact.',
  },
];
