/*
 * Tests for rosterImport.js.
 *
 * The negative cases matter more than the happy path here. An importer that
 * quietly accepts a mistyped student ID, or burns two CC ids on one member,
 * damages a roster in a way that is tedious to undo by hand — so most of what
 * follows is about what the planner refuses to do.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCsv,
  normaliseHeader,
  mapHeaders,
  normaliseName,
  normaliseStudentId,
  normaliseGrade,
  normaliseCommitment,
  normaliseExperience,
  normaliseUsername,
  parseTimestamp,
  highestPlayerNumber,
  buildImportPlan,
  importableRows,
} from './rosterImport.js';

const HEADERS =
  'Timestamp,Email Address,Full name,Student ID,Grade,' +
  '"Do you want to compete in tournaments?",Experience,' +
  'Chess.com username,Lichess username,US Chess ID,' +
  '"What do you want to get better at?",Parent/guardian email';

/** One well-formed response, with only the named fields overridden. */
function response(over = {}) {
  const r = {
    timestamp: '9/20/2026 14:03:11',
    email: 'student@dallasisd.org',
    name: 'Jordan Reyes',
    studentId: '1234567',
    grade: '10',
    competing: 'Yes',
    experience: 'Play casually',
    chesscom: 'jreyes',
    lichess: '',
    uscfId: '',
    goal: 'Endgames',
    guardian: 'parent@example.com',
    ...over,
  };
  return [
    r.timestamp,
    r.email,
    r.name,
    r.studentId,
    r.grade,
    r.competing,
    r.experience,
    r.chesscom,
    r.lichess,
    r.uscfId,
    r.goal,
    r.guardian,
  ]
    .map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
    .join(',');
}

function csv(...rows) {
  return [HEADERS, ...rows].join('\n');
}

const plan = (text, existingPlayers = [], existingPrivate = []) =>
  buildImportPlan({ csvText: text, existingPlayers, existingPrivate });

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

test('parseCsv keeps a quoted comma inside one cell', () => {
  const rows = parseCsv('a,b\n"one, two",three');
  assert.deepEqual(rows[1], ['one, two', 'three']);
});

test('parseCsv handles doubled quotes and embedded newlines', () => {
  const rows = parseCsv('a,b\n"say ""hi""","line one\nline two"');
  assert.deepEqual(rows[1], ['say "hi"', 'line one\nline two']);
});

test('parseCsv treats CRLF as one row break and drops a trailing blank row', () => {
  const rows = parseCsv('a,b\r\n1,2\r\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['1', '2']);
});

test('parseCsv strips a leading BOM so the first header still matches', () => {
  const rows = parseCsv('﻿Timestamp,Name\n1,2');
  assert.equal(rows[0][0], 'Timestamp');
  assert.equal(normaliseHeader(rows[0][0]), 'timestamp');
});

test('parseCsv returns nothing for empty input rather than throwing', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv(null), []);
});

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

test('headers match ignoring case, spacing and punctuation', () => {
  const columns = mapHeaders(['  TIMESTAMP ', 'email   address', 'FULL NAME', 'student  id']);
  assert.equal(columns.timestamp, 0);
  assert.equal(columns.schoolEmail, 1);
  assert.equal(columns.name, 2);
  assert.equal(columns.studentId, 3);
});

test('a curly apostrophe in a form question still matches', () => {
  assert.equal(normaliseHeader('What do you want to get better at?'), normaliseHeader('What do you want to get better at'));
});

test('an absent column is null, not a wrong index', () => {
  const columns = mapHeaders(['Full name', 'Student ID']);
  assert.equal(columns.lichess, null);
  assert.equal(columns.guardianEmail, null);
});

test('a file missing Full name or Student ID imports nothing and says which', () => {
  const result = plan('Timestamp,Grade\n9/1/2026,10');
  assert.deepEqual(result.missingHeaders, ['name', 'studentId']);
  assert.equal(result.rows.length, 0);
});

// ---------------------------------------------------------------------------
// Field cleaning
// ---------------------------------------------------------------------------

test('a student ID must be exactly 7 digits', () => {
  assert.equal(normaliseStudentId('1234567'), '1234567');
  assert.equal(normaliseStudentId(' 123 4567 '), '1234567');
  assert.equal(normaliseStudentId('123456'), null, 'six digits is not a DISD id');
  assert.equal(normaliseStudentId('12345678'), null, 'eight digits is not a DISD id');
  assert.equal(normaliseStudentId('S1234567'), '1234567', 'a letter prefix is decoration');
  assert.equal(normaliseStudentId(''), null);
});

test('grade accepts the ways a form spells it, and rejects anything outside 9-12', () => {
  assert.equal(normaliseGrade('9'), '9');
  assert.equal(normaliseGrade('9th'), '9');
  assert.equal(normaliseGrade('Grade 12'), '12');
  assert.equal(normaliseGrade(''), null, 'blank is allowed');
  assert.equal(normaliseGrade('8'), undefined, 'out of range is a reportable error');
  assert.equal(normaliseGrade('senior'), undefined);
});

test('only "Yes" means Competitive', () => {
  assert.equal(normaliseCommitment('Yes'), 'Competitive');
  assert.equal(normaliseCommitment('Maybe'), 'Casual');
  assert.equal(normaliseCommitment('Just for fun'), 'Casual');
  assert.equal(normaliseCommitment(''), 'Casual');
});

test('experience snaps to the form option but keeps anything else verbatim', () => {
  assert.equal(normaliseExperience('play online a lot'), 'Play online a lot');
  assert.equal(normaliseExperience('I played in middle school'), 'I played in middle school');
  assert.equal(normaliseExperience(''), '');
});

test('a pasted profile URL or @handle reduces to the username', () => {
  assert.equal(normaliseUsername('https://www.chess.com/member/hikaru'), 'hikaru');
  assert.equal(normaliseUsername('https://lichess.org/@/DrNykterstein'), 'DrNykterstein');
  assert.equal(normaliseUsername('@jordan'), 'jordan');
  assert.equal(normaliseUsername('  jordan  '), 'jordan');
});

test('timestamps read as dates in both the US and ISO spellings', () => {
  assert.equal(parseTimestamp('9/20/2026 14:03:11'), '2026-09-20');
  assert.equal(parseTimestamp('2026-09-20 14:03:11'), '2026-09-20');
  assert.equal(parseTimestamp('not a date'), null);
  assert.equal(parseTimestamp(''), null);
});

test('highestPlayerNumber counts soft-deleted rows, whose ids are still taken', () => {
  const players = [{ playerId: 'CC-002' }, { playerId: 'CC-003', deletedAt: '2026-09-25' }];
  assert.equal(highestPlayerNumber(players), 3);
  assert.equal(highestPlayerNumber([]), 0);
});

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

test('a clean row imports as new, mapped onto roster fields', () => {
  const { rows, summary } = plan(csv(response()));
  assert.equal(summary.new, 1);
  const row = rows[0];
  assert.equal(row.kind, 'new');
  assert.equal(row.player.name, 'Jordan Reyes');
  assert.equal(row.player.grade, '10');
  assert.equal(row.player.joined, '2026-09-20');
  assert.equal(row.player.commitment, 'Competitive');
  assert.equal(row.player.experience, 'Play casually');
  assert.equal(row.player.goal, 'Endgames');
  assert.equal(row.player.guardianEmail, 'parent@example.com');
  assert.deepEqual(row.player.connections, { chesscom: { username: 'jreyes' } });
});

test('the student ID and school email stay out of the players payload', () => {
  const { rows } = plan(csv(response()));
  const row = rows[0];
  assert.equal(row.private.studentId, '1234567');
  assert.equal(row.private.schoolEmail, 'student@dallasisd.org');
  assert.equal(JSON.stringify(row.player).includes('1234567'), false);
  assert.equal(JSON.stringify(row.player).includes('dallasisd'), false);
});

test('a US Chess ID is stored as an identifier, never as a rating', () => {
  const { rows } = plan(csv(response({ uscfId: '30412345' })));
  assert.deepEqual(rows[0].player.connections.uscf, { id: '30412345' });
  assert.equal(rows[0].player.ratings, undefined, 'the importer never writes a rating it was not given');
});

test('new ids continue from the highest existing one, in signup order', () => {
  const existing = [{ playerId: 'CC-002', name: 'Anthony Villanueva-Parra' }, { playerId: 'CC-003', name: 'Magnus Carlsen' }];
  const { rows } = plan(
    csv(
      response({ timestamp: '9/22/2026 09:00:00', name: 'Second Signup', studentId: '2222222', email: 'b@dallasisd.org' }),
      response({ timestamp: '9/20/2026 09:00:00', name: 'First Signup', studentId: '1111111', email: 'a@dallasisd.org' }),
    ),
    existing,
  );
  // Display order follows the file...
  assert.equal(rows[0].name, 'Second Signup');
  assert.equal(rows[1].name, 'First Signup');
  // ...but the earlier signup gets the lower id.
  assert.equal(rows[1].playerId, 'CC-004');
  assert.equal(rows[0].playerId, 'CC-005');
});

test('a row with no timestamp still imports, numbered after the dated ones', () => {
  const { rows } = plan(
    csv(
      response({ timestamp: '', name: 'No Date', studentId: '9999999', email: 'z@dallasisd.org' }),
      response({ timestamp: '9/20/2026 09:00:00', name: 'Dated', studentId: '1111111', email: 'a@dallasisd.org' }),
    ),
  );
  assert.equal(rows[1].playerId, 'CC-001');
  assert.equal(rows[0].playerId, 'CC-002');
  assert.equal(rows[0].player.joined, '');
});

// -- negative cases ---------------------------------------------------------

test('a missing name is an error, not a blank player', () => {
  const { rows, summary } = plan(csv(response({ name: '   ' })));
  assert.equal(rows[0].kind, 'error');
  assert.match(rows[0].reason, /Full name is empty/);
  assert.equal(summary.new, 0);
});

test('a student ID that is not 7 digits is an error naming the value', () => {
  const { rows } = plan(csv(response({ studentId: '12345' })));
  assert.equal(rows[0].kind, 'error');
  assert.match(rows[0].reason, /"12345" is not 7 digits/);
});

test('an empty student ID reports as empty rather than as a bad format', () => {
  const { rows } = plan(csv(response({ studentId: '' })));
  assert.equal(rows[0].kind, 'error');
  assert.match(rows[0].reason, /Student ID is empty/);
});

test('an out-of-range grade is an error naming the value', () => {
  const { rows } = plan(csv(response({ grade: '8' })));
  assert.equal(rows[0].kind, 'error');
  assert.match(rows[0].reason, /Grade "8" is not 9, 10, 11 or 12/);
});

test('one bad row does not stop the good ones', () => {
  const { rows, summary } = plan(
    csv(
      response({ name: '', studentId: '1111111', email: 'a@dallasisd.org' }),
      response({ name: 'Fine Person', studentId: '2222222', email: 'b@dallasisd.org' }),
    ),
  );
  assert.equal(summary.error, 1);
  assert.equal(summary.new, 1);
  assert.equal(rows[1].kind, 'new');
});

test('a student ID repeated inside one file is rejected the second time', () => {
  const { rows, summary } = plan(
    csv(
      response({ timestamp: '9/20/2026 09:00:00', name: 'Jordan Reyes', studentId: '1234567', email: 'a@dallasisd.org' }),
      response({ timestamp: '9/21/2026 09:00:00', name: 'Jordan Reyes', studentId: '1234567', email: 'b@dallasisd.org' }),
    ),
  );
  assert.equal(rows[0].kind, 'new');
  assert.equal(rows[1].kind, 'error');
  assert.match(rows[1].reason, /already appears on line 2 of this file/);
  assert.equal(summary.new, 1, 'one member must not consume two CC ids');
});

test('a school email repeated inside one file is rejected the second time', () => {
  const { rows } = plan(
    csv(
      response({ timestamp: '9/20/2026 09:00:00', studentId: '1111111', email: 'same@dallasisd.org', name: 'A One' }),
      response({ timestamp: '9/21/2026 09:00:00', studentId: '2222222', email: 'same@dallasisd.org', name: 'B Two' }),
    ),
  );
  assert.equal(rows[0].kind, 'new');
  assert.equal(rows[1].kind, 'error');
  assert.match(rows[1].reason, /same@dallasisd\.org already appears on line 2/);
});

test('an unusable email is reported rather than stored', () => {
  const { rows } = plan(csv(response({ email: 'n/a' })));
  assert.equal(rows[0].kind, 'error');
  assert.match(rows[0].reason, /not an email address/);
});

test('an unusable guardian email is dropped, but does not fail the row', () => {
  const { rows } = plan(csv(response({ guardian: 'none' })));
  assert.equal(rows[0].kind, 'new');
  assert.equal(rows[0].player.guardianEmail, '');
});

// -- dedupe against the roster ---------------------------------------------

const ANTHONY = { playerId: 'CC-002', name: 'Anthony Villanueva-Parra' };
const PRIVATE = [{ playerId: 'CC-002', studentId: '1234567', schoolEmail: 'anthony@dallasisd.org' }];

test('a matching student ID updates the existing player', () => {
  const { rows } = plan(
    csv(response({ studentId: '1234567', email: 'different@dallasisd.org', name: 'Anthony V-P' })),
    [ANTHONY],
    PRIVATE,
  );
  assert.equal(rows[0].kind, 'update');
  assert.equal(rows[0].playerId, 'CC-002');
  assert.equal(rows[0].matchedBy, 'studentId');
});

test('student ID wins over school email when the two point at different people', () => {
  const players = [ANTHONY, { playerId: 'CC-004', name: 'Someone Else' }];
  const privateRows = [...PRIVATE, { playerId: 'CC-004', studentId: '7654321', schoolEmail: 'else@dallasisd.org' }];
  const { rows } = plan(csv(response({ studentId: '1234567', email: 'else@dallasisd.org' })), players, privateRows);
  assert.equal(rows[0].playerId, 'CC-002');
  assert.equal(rows[0].matchedBy, 'studentId');
});

test('school email matches when the student ID is new', () => {
  const { rows } = plan(csv(response({ studentId: '7777777', email: 'anthony@dallasisd.org' })), [ANTHONY], PRIVATE);
  assert.equal(rows[0].kind, 'update');
  assert.equal(rows[0].matchedBy, 'schoolEmail');
});

test('a name-only match is flagged for the coach and never written', () => {
  const { rows, summary } = plan(
    csv(response({ studentId: '7777777', email: 'new@dallasisd.org', name: 'anthony  villanueva-parra' })),
    [ANTHONY],
    PRIVATE,
  );
  assert.equal(rows[0].kind, 'duplicate');
  assert.equal(rows[0].matchedBy, 'name');
  assert.equal(summary.duplicate, 1);
  assert.equal(importableRows(rows).length, 0, 'a duplicate is not importable without a decision');
});

test('two different students with the same name flag rather than merge', () => {
  const { rows } = plan(
    csv(
      response({ timestamp: '9/20/2026 09:00:00', name: 'Daniel Nguyen', studentId: '1111111', email: 'dn1@dallasisd.org' }),
      response({ timestamp: '9/21/2026 09:00:00', name: 'Daniel Nguyen', studentId: '2222222', email: 'dn2@dallasisd.org' }),
    ),
  );
  assert.equal(rows[0].kind, 'new');
  assert.equal(rows[1].kind, 'duplicate');
  assert.match(rows[1].reason, /Same name as line 2 of this file/);
});

test('names compare ignoring case, punctuation and doubled spaces', () => {
  assert.equal(normaliseName("  D'Andre   O'Neil-Smith "), 'dandre oneilsmith');
  assert.equal(normaliseName('Jordan Reyes'), normaliseName('jordan  reyes'));
});

test('an update does not consume a new CC id', () => {
  const { rows } = plan(
    csv(
      response({ timestamp: '9/20/2026 09:00:00', studentId: '1234567', email: 'anthony@dallasisd.org', name: 'Anthony Villanueva-Parra' }),
      response({ timestamp: '9/21/2026 09:00:00', studentId: '5555555', email: 'new@dallasisd.org', name: 'Brand New' }),
    ),
    [ANTHONY, { playerId: 'CC-003', name: 'Magnus Carlsen' }],
    PRIVATE,
  );
  assert.equal(rows[0].kind, 'update');
  assert.equal(rows[0].playerId, 'CC-002');
  assert.equal(rows[1].kind, 'new');
  assert.equal(rows[1].playerId, 'CC-004');
});

test('importableRows takes new and update rows only', () => {
  const rows = [{ kind: 'new' }, { kind: 'update' }, { kind: 'duplicate' }, { kind: 'error' }];
  assert.deepEqual(importableRows(rows).map((r) => r.kind), ['new', 'update']);
});

test('a header-only file plans nothing and reports no missing headers', () => {
  const result = plan(csv());
  assert.deepEqual(result.missingHeaders, []);
  assert.equal(result.rows.length, 0);
  assert.equal(result.summary.total, 0);
});
