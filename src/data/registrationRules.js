/*
 * registrationRules.js — the Dallas ISD registration rules, as pure checks.
 *
 * From the district chess page (research/FEATURE-RESEARCH.md F072, source s63)
 * and the 2023 event report (s64):
 *   - a coach may register at most 10 students;
 *   - a campus may bring at most 2 coaches, so at most 20 students;
 *   - the coach's stipend for the event is halved if the campus brings fewer
 *     than 6 students;
 *   - play is in grade sections, 9–10 and 11–12.
 *
 * This module only ADVISES. It ranks the members who said yes, checks a list
 * the coach has built, and formats that list for the district form. Nothing
 * here registers anyone: that is always the coach's tap, one player at a time.
 */

export const MAX_PER_COACH = 10;
export const MAX_COACHES = 2;
export const MAX_STUDENTS = MAX_PER_COACH * MAX_COACHES;
export const STIPEND_FLOOR = 6;
export const COACH_SLOTS = [1, 2];

/** ASCII hyphen on purpose: an en dash turns into mojibake when Excel opens a CSV. */
export const SECTION_LOWER = '9-10';
export const SECTION_UPPER = '11-12';

const GRADE_WORDS = { freshman: 9, sophomore: 10, junior: 11, senior: 12 };

/**
 * A grade as the roster holds it ('9', '10th', 'Grade 11', 'Senior') → 9–12,
 * or null. Anything outside high school is null rather than clamped: a
 * middle-schooler on the roster must not be quietly entered in 9–10.
 */
export function parseGrade(grade) {
  if (typeof grade === 'number') return Number.isInteger(grade) && grade >= 9 && grade <= 12 ? grade : null;
  const text = String(grade ?? '').trim().toLowerCase();
  if (!text) return null;
  if (GRADE_WORDS[text]) return GRADE_WORDS[text];
  const match = /^(?:grade\s*)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*grade)?$/.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 9 && n <= 12 ? n : null;
}

/** '9-10', '11-12', or null when the grade is missing or not high school. */
export function gradeSection(grade) {
  const n = parseGrade(grade);
  if (n == null) return null;
  return n <= 10 ? SECTION_LOWER : SECTION_UPPER;
}

/** present / recorded sessions, or null with no record at all. */
export function attendanceRate(attendance) {
  const recorded = (attendance || []).filter((a) => a && typeof a.present === 'boolean');
  if (!recorded.length) return null;
  return recorded.filter((a) => a.present).length / recorded.length;
}

const coachLabel = (slot, coachNames = []) => coachNames[slot - 1]?.trim() || `Coach ${slot}`;

/**
 * Check a registration list. Each registrant is
 * `{ playerId, name, grade, coachSlot, answer }`, where `answer` is their
 * availability answer (yes / maybe / no / null).
 *
 * Returns `{ ok, errors, warnings, bySlot, counts }`. Errors are things the
 * district would refuse; warnings are things the coach should know.
 */
export function checkRegistration(registrants, { coachNames = [] } = {}) {
  const errors = [];
  const warnings = [];
  const bySlot = { 1: [], 2: [] };
  const sections = { [SECTION_LOWER]: 0, [SECTION_UPPER]: 0, none: 0 };
  const seen = new Set();

  for (const r of registrants || []) {
    if (!r?.playerId) continue;
    if (seen.has(r.playerId)) {
      errors.push({ code: 'duplicate', playerId: r.playerId, message: `${r.name} is on the list twice.` });
      continue;
    }
    seen.add(r.playerId);

    if (!COACH_SLOTS.includes(r.coachSlot)) {
      errors.push({
        code: 'bad-slot',
        playerId: r.playerId,
        message: `${r.name} is not assigned to coach 1 or coach 2. A campus may bring at most ${MAX_COACHES} coaches.`,
      });
    } else {
      bySlot[r.coachSlot].push(r);
    }

    const section = gradeSection(r.grade);
    if (section) sections[section] += 1;
    else {
      sections.none += 1;
      errors.push({
        code: 'no-section',
        playerId: r.playerId,
        message: `${r.name} has no high-school grade on the roster, so no section (9-10 or 11-12). Fix it on the Roster page.`,
      });
    }

    if (r.answer !== 'yes') {
      warnings.push({
        code: 'not-yes',
        playerId: r.playerId,
        message: `${r.name} ${r.answer ? `answered "${r.answer}"` : 'has not answered the availability poll'}.`,
      });
    }
  }

  for (const slot of COACH_SLOTS) {
    const n = bySlot[slot].length;
    if (n > MAX_PER_COACH) {
      errors.push({
        code: 'slot-over',
        slot,
        message: `${coachLabel(slot, coachNames)} has ${n} students; the district limit is ${MAX_PER_COACH} per coach.`,
      });
    }
    if (n > 0 && !coachNames[slot - 1]?.trim()) {
      warnings.push({
        code: 'coach-unnamed',
        slot,
        message: `Coach ${slot} has students but no name yet. Add it under Event.`,
      });
    }
  }

  const total = seen.size;
  if (total < STIPEND_FLOOR) {
    warnings.push({
      code: 'below-floor',
      message: `${total} student${total === 1 ? '' : 's'} registered. Fewer than ${STIPEND_FLOOR} halves the coach's stipend for this event.`,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    bySlot,
    counts: { total, slot1: bySlot[1].length, slot2: bySlot[2].length, sections },
  };
}

/**
 * Whether one more student fits under a coach. The page asks this BEFORE
 * adding, so the 11th student is refused with the reason rather than
 * accepted and flagged afterwards.
 */
export function canAddToSlot(registrants, slot, { coachNames = [] } = {}) {
  if (!COACH_SLOTS.includes(slot)) return { ok: false, reason: `Choose coach 1 or coach 2.` };
  const n = (registrants || []).filter((r) => r.coachSlot === slot).length;
  if (n >= MAX_PER_COACH) {
    return {
      ok: false,
      reason: `${coachLabel(slot, coachNames)} already has ${MAX_PER_COACH} students, the district limit per coach.`,
    };
  }
  return { ok: true, reason: '' };
}

/** The coach with room and fewer students (coach 1 on a tie), or null when both are full. */
export function suggestSlot(registrants) {
  const count = (slot) => (registrants || []).filter((r) => r.coachSlot === slot).length;
  const open = COACH_SLOTS.filter((slot) => count(slot) < MAX_PER_COACH);
  if (!open.length) return null;
  return open.sort((a, b) => count(a) - count(b) || a - b)[0];
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export const SUGGEST_ORDERS = {
  readiness: 'Readiness',
  rating: 'Rating',
  attendance: 'Attendance',
};

const KEYS = {
  readiness: (c) => c.readinessPercent,
  rating: (c) => c.rating,
  attendance: (c) => c.attendance,
};

/** Descending with nulls last: an unknown is never ranked above a known. */
function byKeyDesc(key) {
  return (a, b) => {
    const x = KEYS[key](a);
    const y = KEYS[key](b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x;
  };
}

/**
 * Order the candidates (members who said yes) for the coach to look down.
 * `sortBy` picks the main key; the other two break ties, then the name. A
 * suggestion only: nothing here adds anyone to the list.
 *
 * Each candidate: `{ playerId, name, readinessPercent, rating, attendance }`
 * where any number may be null (unknown).
 */
export function rankCandidates(candidates, sortBy = 'readiness') {
  const main = KEYS[sortBy] ? sortBy : 'readiness';
  const order = [main, ...Object.keys(KEYS).filter((k) => k !== main)];
  return [...(candidates || [])].sort((a, b) => {
    for (const key of order) {
      const diff = byKeyDesc(key)(a, b);
      if (diff) return diff;
    }
    return String(a.name).localeCompare(String(b.name));
  });
}

// ---------------------------------------------------------------------------
// Export for the district form
// ---------------------------------------------------------------------------

const SECTION_ORDER = { [SECTION_LOWER]: 0, [SECTION_UPPER]: 1, '': 2 };

/**
 * Rows for the district form: coach, then section (9-10 first), then name.
 * Registrants without a section are kept, last, with a blank section, so an
 * export never silently drops a student; checkRegistration reports them.
 */
export function registrationRows(registrants, { coachNames = [] } = {}) {
  return (registrants || [])
    .filter((r) => r?.playerId)
    .map((r) => ({
      playerId: r.playerId,
      slot: r.coachSlot,
      coach: coachLabel(r.coachSlot, coachNames),
      name: String(r.name ?? '').trim(),
      grade: parseGrade(r.grade),
      section: gradeSection(r.grade) || '',
    }))
    .sort(
      (a, b) =>
        (a.slot ?? 9) - (b.slot ?? 9) ||
        SECTION_ORDER[a.section] - SECTION_ORDER[b.section] ||
        a.name.localeCompare(b.name),
    );
}

/**
 * One CSV field. Quoted when it holds a comma, quote or line break; and a
 * value starting with = + - @ is prefixed with an apostrophe so a name can
 * never run as a spreadsheet formula when the file is opened in Excel.
 */
export function csvField(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Name, Grade, Section, Coach — CRLF line ends, which Excel expects. */
export function registrationCsv(rows) {
  const lines = [['Name', 'Grade', 'Section', 'Coach'].join(',')];
  for (const row of rows || []) {
    lines.push([row.name, row.grade ?? '', row.section, row.coach].map(csvField).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** A plain-text list to paste into an email or the district's web form. */
export function registrationText(rows, { eventName = '', eventDate = '', venue = '' } = {}) {
  const head = [eventName, eventDate, venue].filter(Boolean).join(' · ');
  const lines = head ? [head, ''] : [];
  const slots = [...new Set((rows || []).map((r) => r.slot))];
  for (const slot of slots) {
    const group = rows.filter((r) => r.slot === slot);
    lines.push(`${group[0].coach} (${group.length} student${group.length === 1 ? '' : 's'})`);
    group.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.name}, grade ${r.grade ?? '?'}, section ${r.section || '?'}`);
    });
    lines.push('');
  }
  lines.push(`Total: ${(rows || []).length}`);
  return lines.join('\n');
}
