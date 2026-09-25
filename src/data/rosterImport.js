/*
 * rosterImport.js — turning a Google Form CSV into roster rows.
 *
 * The club signs members up with a Google Form; this reads the CSV export of
 * its responses and works out, for every line, whether it is a new member, an
 * update to someone already on the roster, a duplicate the coach has to rule
 * on, or a row that cannot be imported at all and why.
 *
 * Nothing here touches the store, the network or the database. It takes text
 * and the current roster and returns a plan; the caller shows that plan to
 * the coach and only writes what the coach confirms. That split is the whole
 * point — an import that half-succeeds against a live roster is much worse
 * than one that never starts, and a pure planner can be tested without a
 * browser or a backend.
 *
 * Two fields never reach the `players` table: the student ID and the school
 * email. Every approved member can read `players`, so a DISD student ID sitting
 * there would be readable club-wide. They go to `player_private`, which only
 * coaches can select (see migration 0018).
 */

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Split CSV text into rows of cells, RFC 4180 style: double quotes protect
 * commas and newlines, and a doubled quote inside a quoted field is a literal
 * quote. Google Forms quotes any free-text answer, and "What do you want to
 * get better at?" is free text, so a member writing "endgames, mostly" would
 * otherwise shift every column after it by one.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let started = false; // distinguishes a trailing newline from a real empty last row

  // A BOM survives an Excel round-trip and would otherwise hide inside the
  // first header, so "Timestamp" would never match.
  const source = String(text ?? '').replace(/^﻿/, '');

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    started = true;

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      endCell();
    } else if (char === '\r') {
      // Swallow CRLF as one break; a lone CR also ends the row.
      if (source[i + 1] === '\n') i += 1;
      endRow();
    } else if (char === '\n') {
      endRow();
    } else {
      cell += char;
    }
  }

  if (started || cell !== '' || row.length) endRow();

  // Drop rows that are entirely empty — Excel likes to leave one at the end.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------------------
// Header matching
// ---------------------------------------------------------------------------

/**
 * Headers are matched on letters and digits only. Google Form questions pick
 * up stray spaces, curly apostrophes and a trailing question mark between one
 * export and the next, and none of that should break an import.
 */
export function normaliseHeader(header) {
  return String(header ?? '')
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Field name -> the header spellings that mean it. First match in the file
 * wins. The first entry of each list is the spelling the club's form uses.
 */
export const HEADER_ALIASES = {
  timestamp: ['Timestamp'],
  schoolEmail: ['Email Address', 'Email', 'Username'],
  name: ['Full name', 'Full Name', 'Name'],
  studentId: ['Student ID', 'Student ID number', 'StudentID'],
  grade: ['Grade', 'Grade level'],
  competing: [
    'Do you want to compete in tournaments?',
    'Do you want to compete in tournaments',
    'Compete in tournaments',
  ],
  experience: ['Experience', 'Chess experience', 'Experience level'],
  chesscom: ['Chess.com username', 'Chesscom username', 'Chess com username'],
  lichess: ['Lichess username', 'Lichess.org username'],
  uscfId: ['US Chess ID', 'USCF ID', 'US Chess ID number'],
  goal: ['What do you want to get better at?', 'What do you want to get better at', 'Goal'],
  guardianEmail: ['Parent/guardian email', 'Parent guardian email', 'Guardian email', 'Parent email'],
};

/** Fields an import cannot proceed without. */
export const REQUIRED_FIELDS = ['name', 'studentId'];

/**
 * Map each known field to its column index in the header row, or null.
 */
export function mapHeaders(headerCells) {
  const seen = new Map();
  headerCells.forEach((cell, index) => {
    const key = normaliseHeader(cell);
    if (key && !seen.has(key)) seen.set(key, index);
  });

  const columns = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const hit = aliases.map((a) => seen.get(normaliseHeader(a))).find((i) => i != null);
    columns[field] = hit ?? null;
  }
  return columns;
}

// ---------------------------------------------------------------------------
// Field-level cleaning
// ---------------------------------------------------------------------------

/** Collapse runs of whitespace; used everywhere a value is compared or stored. */
function tidy(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** The key names are compared on: case-folded, punctuation-free, single-spaced. */
export function normaliseName(name) {
  return tidy(name)
    .toLowerCase()
    .replace(/[.,'’-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normaliseEmail(email) {
  return tidy(email).toLowerCase();
}

/**
 * Every DISD student ID is exactly 7 digits. Anything else is a typo, and a
 * typo'd ID is worse than a missing one: it is the first dedupe key, so a
 * wrong one silently splits or merges the wrong people.
 */
export function normaliseStudentId(value) {
  const digits = tidy(value).replace(/\D/g, '');
  return /^\d{7}$/.test(digits) ? digits : null;
}

/**
 * Accept "9", "9th", "Grade 9", "9th grade". Returns '9'..'12', or null when
 * the cell is blank, or undefined when it held something out of range.
 */
export function normaliseGrade(value) {
  const text = tidy(value);
  if (!text) return null;
  const digits = text.match(/\d+/);
  if (!digits) return undefined;
  const n = Number(digits[0]);
  return n >= 9 && n <= 12 ? String(n) : undefined;
}

/**
 * "Yes" is the only answer that means competitive. "Maybe" and "Just for fun"
 * are both Casual — a maybe is not a commitment, and a member can be moved up
 * on the roster page the moment they decide.
 */
export function normaliseCommitment(value) {
  return /^\s*yes\b/i.test(String(value ?? '')) ? 'Competitive' : 'Casual';
}

const EXPERIENCE_LEVELS = [
  'New to chess',
  'Know the rules',
  'Play casually',
  'Play online a lot',
  'Tournament player',
];

/** Snap to the form's five options where it matches; otherwise keep what they wrote. */
export function normaliseExperience(value) {
  const text = tidy(value);
  if (!text) return '';
  const hit = EXPERIENCE_LEVELS.find((level) => normaliseHeader(level) === normaliseHeader(text));
  return hit || text;
}

/**
 * A Google Forms timestamp, as a YYYY-MM-DD date.
 *
 * The export is in the form owner's locale, and for a US account that is
 * M/D/YYYY — which `Date.parse` reads correctly, but an ISO-looking string
 * would not be. Both are handled explicitly rather than left to the engine.
 * Returns null when there is nothing usable, and the caller falls back to
 * file order.
 */
export function parseTimestamp(value) {
  const text = tidy(value);
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const [, month, day, year] = us;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/**
 * A username as typed, with the decoration people paste in removed: a full
 * profile URL, a leading @, surrounding spaces.
 */
export function normaliseUsername(value) {
  let text = tidy(value);
  if (!text) return '';
  const url = text.match(/(?:chess\.com\/member\/|lichess\.org\/@\/)([^/?\s]+)/i);
  if (url) text = url[1];
  return text.replace(/^@+/, '').trim();
}

/** Loose check — enough to catch "n/a" and a missing @, not enough to reject a real address. */
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** Highest CC-### in use, counting soft-deleted rows — their ids are still taken. */
export function highestPlayerNumber(players) {
  return players.reduce((max, player) => {
    const digits = String(player?.playerId || '').match(/\d+/);
    const n = digits ? Number(digits[0]) : NaN;
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
}

function formatPlayerId(n) {
  return `CC-${String(n).padStart(3, '0')}`;
}

/**
 * Build the import plan.
 *
 * @param csvText      raw CSV export
 * @param existingPlayers  the current roster, including soft-deleted rows
 * @param existingPrivate  [{ playerId, studentId, schoolEmail }] from player_private
 *
 * Every returned row carries `kind`:
 *   new       — will be inserted, with the CC-### id shown
 *   update    — matched an existing player on student ID or school email
 *   duplicate — matched only on name; the coach decides, nothing is written
 *   error     — cannot be imported; `reason` says why
 *
 * New ids are assigned in Timestamp order, so the member who signed up first
 * gets the lower number regardless of how the spreadsheet happens to be sorted.
 */
export function buildImportPlan({ csvText, existingPlayers = [], existingPrivate = [] } = {}) {
  const table = parseCsv(csvText);

  if (!table.length) {
    return { rows: [], columns: {}, headers: [], missingHeaders: [...REQUIRED_FIELDS], summary: emptySummary() };
  }

  const headers = table[0];
  const columns = mapHeaders(headers);
  const missingHeaders = REQUIRED_FIELDS.filter((field) => columns[field] == null);
  if (missingHeaders.length) {
    return { rows: [], columns, headers, missingHeaders, summary: emptySummary() };
  }

  // Lookups into the existing roster.
  const byStudentId = new Map();
  const bySchoolEmail = new Map();
  for (const row of existingPrivate) {
    const sid = normaliseStudentId(row?.studentId);
    if (sid) byStudentId.set(sid, row.playerId);
    const email = normaliseEmail(row?.schoolEmail);
    if (email) bySchoolEmail.set(email, row.playerId);
  }
  const byName = new Map();
  for (const player of existingPlayers) {
    const key = normaliseName(player?.name);
    if (key && !byName.has(key)) byName.set(key, player.playerId);
  }
  const playerById = new Map(existingPlayers.map((p) => [p.playerId, p]));

  const cellAt = (cells, field) => (columns[field] == null ? '' : cells[columns[field]] ?? '');

  // Pass 1: read and validate every line, independent of ordering.
  const parsed = table.slice(1).map((cells, index) => {
    const line = index + 2; // 1-based, counting the header row
    const raw = {};
    for (const field of Object.keys(HEADER_ALIASES)) raw[field] = tidy(cellAt(cells, field));

    const name = tidy(raw.name);
    const studentId = normaliseStudentId(raw.studentId);
    const grade = normaliseGrade(raw.grade);
    const joined = parseTimestamp(raw.timestamp);

    const errors = [];
    if (!name) errors.push('Full name is empty.');
    if (!raw.studentId) errors.push('Student ID is empty.');
    else if (!studentId) errors.push(`Student ID "${raw.studentId}" is not 7 digits.`);
    if (grade === undefined) errors.push(`Grade "${raw.grade}" is not 9, 10, 11 or 12.`);

    const schoolEmail = normaliseEmail(raw.schoolEmail);
    if (schoolEmail && !looksLikeEmail(schoolEmail)) errors.push(`"${raw.schoolEmail}" is not an email address.`);

    const guardianEmail = normaliseEmail(raw.guardianEmail);
    const guardianUsable = guardianEmail && looksLikeEmail(guardianEmail) ? guardianEmail : '';

    return {
      line,
      raw,
      errors,
      name,
      studentId,
      schoolEmail: schoolEmail && looksLikeEmail(schoolEmail) ? schoolEmail : '',
      sortKey: joined || '',
      player: {
        name,
        grade: grade || '',
        joined: joined || '',
        commitment: normaliseCommitment(raw.competing),
        experience: normaliseExperience(raw.experience),
        goal: tidy(raw.goal),
        guardianEmail: guardianUsable,
        connections: buildConnections(raw),
      },
    };
  });

  // Pass 2: order by signup time for id assignment, but keep file position as
  // the tiebreak so two responses in the same minute stay in export order.
  const order = parsed
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      if (a.row.sortKey !== b.row.sortKey) {
        if (!a.row.sortKey) return 1; // undated rows go last
        if (!b.row.sortKey) return -1;
        return a.row.sortKey < b.row.sortKey ? -1 : 1;
      }
      return a.index - b.index;
    });

  // Pass 3: classify in signup order, so an in-file duplicate is reported
  // against the *earlier* signup rather than whichever line came first.
  const seenStudentIds = new Map();
  const seenEmails = new Map();
  const seenNames = new Map();
  let nextNumber = highestPlayerNumber(existingPlayers) + 1;
  const decided = new Map();

  for (const { row } of order) {
    decided.set(row.line, classify(row));
  }

  return {
    rows: parsed.map((row) => decided.get(row.line)),
    columns,
    headers,
    missingHeaders: [],
    summary: summarise([...decided.values()]),
  };

  function classify(row) {
    const base = {
      line: row.line,
      raw: row.raw,
      name: row.name,
      studentId: row.studentId,
      schoolEmail: row.schoolEmail,
      player: row.player,
      private: { studentId: row.studentId, schoolEmail: row.schoolEmail },
    };

    if (row.errors.length) {
      return { ...base, kind: 'error', playerId: null, matchedBy: null, reason: row.errors.join(' ') };
    }

    // Duplicates inside the file itself. Caught before the roster is consulted:
    // importing the same person twice would burn two CC ids on one member.
    if (row.studentId && seenStudentIds.has(row.studentId)) {
      return {
        ...base,
        kind: 'error',
        playerId: null,
        matchedBy: null,
        reason: `Student ID ${row.studentId} already appears on line ${seenStudentIds.get(row.studentId)} of this file.`,
      };
    }
    if (row.schoolEmail && seenEmails.has(row.schoolEmail)) {
      return {
        ...base,
        kind: 'error',
        playerId: null,
        matchedBy: null,
        reason: `${row.schoolEmail} already appears on line ${seenEmails.get(row.schoolEmail)} of this file.`,
      };
    }

    seenStudentIds.set(row.studentId, row.line);
    if (row.schoolEmail) seenEmails.set(row.schoolEmail, row.line);

    const nameKey = normaliseName(row.name);

    // Dedupe against the roster, in the order the coach asked for:
    // student ID, then school email, then name.
    const idMatch = byStudentId.get(row.studentId);
    const emailMatch = row.schoolEmail ? bySchoolEmail.get(row.schoolEmail) : undefined;
    const matchedId = idMatch ?? emailMatch;

    if (matchedId) {
      const existing = playerById.get(matchedId);
      return {
        ...base,
        kind: 'update',
        playerId: matchedId,
        matchedBy: idMatch ? 'studentId' : 'schoolEmail',
        reason: idMatch
          ? `Student ID ${row.studentId} already belongs to ${matchedId}${existing ? ` (${existing.name})` : ''}.`
          : `${row.schoolEmail} already belongs to ${matchedId}${existing ? ` (${existing.name})` : ''}.`,
      };
    }

    // A name-only match is never acted on automatically. Two students called
    // "Daniel Nguyen" is ordinary in a school this size, and merging them
    // would be unrecoverable.
    const nameMatch = byName.get(nameKey);
    if (nameMatch) {
      const existing = playerById.get(nameMatch);
      return {
        ...base,
        kind: 'duplicate',
        playerId: nameMatch,
        matchedBy: 'name',
        reason: `Same name as ${nameMatch}${existing ? ` (${existing.name})` : ''}, but a different student ID. Decide before importing.`,
      };
    }
    if (seenNames.has(nameKey)) {
      return {
        ...base,
        kind: 'duplicate',
        playerId: null,
        matchedBy: 'name',
        reason: `Same name as line ${seenNames.get(nameKey)} of this file, but a different student ID. Decide before importing.`,
      };
    }
    seenNames.set(nameKey, row.line);

    const playerId = formatPlayerId(nextNumber);
    nextNumber += 1;
    return { ...base, kind: 'new', playerId, matchedBy: null, reason: '' };
  }
}

function buildConnections(raw) {
  const connections = {};
  const chesscom = normaliseUsername(raw.chesscom);
  const lichess = normaliseUsername(raw.lichess);
  if (chesscom) connections.chesscom = { username: chesscom };
  if (lichess) connections.lichess = { username: lichess };

  // A US Chess ID is a membership number, not a rating, so it deliberately
  // does NOT go into `ratings.uscf` — the leaderboard renders that as a
  // rating and an 8-digit id would read as one. It is an account identifier,
  // so it sits with the other account identifiers.
  const uscfId = tidy(raw.uscfId).replace(/\D/g, '');
  if (uscfId) connections.uscf = { id: uscfId };

  return connections;
}

function emptySummary() {
  return { total: 0, new: 0, update: 0, duplicate: 0, error: 0 };
}

function summarise(rows) {
  const summary = emptySummary();
  summary.total = rows.length;
  for (const row of rows) summary[row.kind] += 1;
  return summary;
}

/** The rows an import will actually write: new members and confirmed updates. */
export function importableRows(rows) {
  return rows.filter((row) => row.kind === 'new' || row.kind === 'update');
}
