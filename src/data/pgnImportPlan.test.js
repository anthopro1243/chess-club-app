import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPgnImport, rowProblem, recordsToImport, summarise } from './pgnImportPlan.js';

const ROSTER = [
  { playerId: 'CC-002', name: 'Anthony Villanueva-Parra' },
  { playerId: 'CC-004', name: 'Ada Chen' },
];

const DATED = `[Event "Tuesday Club"]
[Date "2026.09.22"]
[White "Ada Chen"]
[Black "?"]
[Result "1-0"]

1. e4 e5 2. Bc4 Bc5 3. Qh5 Nf6 4. Qxf7# 1-0
`;

const UNDATED = `[Event "Tuesday Club"]
[Date "????.??.??"]
[White "?"]
[Black "?"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1
`;

const ILLEGAL = `[Event "Tuesday Club"]
[Date "2026.09.22"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Qh8 1-0
`;

test('planPgnImport: matches names and pre-fills the pickers', () => {
  const { rows, errors } = planPgnImport(DATED, { roster: ROSTER });
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].whitePlayerId, 'CC-004');
  assert.equal(rows[0].blackPlayerId, '');
  assert.equal(rows[0].playedOn, '2026-09-22');
  assert.equal(rows[0].needsDate, false);
  assert.equal(rowProblem(rows[0]), null);
});

test('planPgnImport: an illegal game is an error and the rest still imports', () => {
  const { rows, errors } = planPgnImport(`${DATED}\n${ILLEGAL}`, { roster: ROSTER });
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /game 2/);
});

test('planPgnImport: a game already archived is marked and unticked', () => {
  const first = planPgnImport(DATED, { roster: ROSTER });
  const again = planPgnImport(DATED, { roster: ROSTER, existingIds: [first.rows[0].game.id] });
  assert.equal(again.rows[0].alreadyArchived, true);
  assert.equal(again.rows[0].include, false);
  assert.equal(rowProblem(again.rows[0]), 'Already in the archive.');
  assert.equal(recordsToImport(again.rows, ROSTER).length, 0);
});

test('rowProblem: the same member on both sides is refused', () => {
  const { rows } = planPgnImport(DATED, { roster: ROSTER });
  const row = { ...rows[0], blackPlayerId: 'CC-004' };
  assert.match(rowProblem(row), /both sides/);
  assert.equal(recordsToImport([row], ROSTER).length, 0);
});

test('undated game: held back until a date is chosen, never invented', () => {
  const { rows } = planPgnImport(UNDATED, { roster: ROSTER });
  assert.equal(rows[0].needsDate, true);
  assert.equal(rows[0].playedOn, '');
  assert.match(rowProblem(rows[0]), /no date/);
  assert.equal(recordsToImport(rows, ROSTER).length, 0);

  const dated = { ...rows[0], playedOn: '2026-09-22' };
  const [record] = recordsToImport([dated], ROSTER);
  assert.equal(record.playedAt, '2026-09-22T12:00:00.000Z');
});

test('recordsToImport: a picked member replaces a placeholder name, not a real one', () => {
  const { rows } = planPgnImport(UNDATED, { roster: ROSTER });
  const row = { ...rows[0], playedOn: '2026-09-22', whitePlayerId: 'CC-002', blackPlayerId: 'CC-004' };
  const [record] = recordsToImport([row], ROSTER);
  assert.equal(record.whiteName, 'Anthony Villanueva-Parra');
  assert.equal(record.blackName, 'Ada Chen');
  assert.equal(record.whitePlayerId, 'CC-002');
  assert.equal(record.mode, 'human');

  const tagged = planPgnImport(DATED, { roster: ROSTER }).rows[0];
  const [kept] = recordsToImport([{ ...tagged, whitePlayerId: 'CC-002' }], ROSTER);
  assert.equal(kept.whiteName, 'Ada Chen', 'the scoresheet name is kept when it is a real name');
});

test('recordsToImport: an unticked row is left out', () => {
  const { rows } = planPgnImport(DATED, { roster: ROSTER });
  assert.equal(recordsToImport([{ ...rows[0], include: false }], ROSTER).length, 0);
});

test('summarise: counts each state once', () => {
  const { rows, errors } = planPgnImport(`${DATED}\n${UNDATED}\n${ILLEGAL}`, { roster: ROSTER });
  assert.deepEqual(summarise(rows, errors), { ready: 1, archived: 0, blocked: 1, errors: 1 });
});

test('planPgnImport: empty text is an error, not a crash', () => {
  const { rows, errors } = planPgnImport('', { roster: ROSTER });
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 1);
});
