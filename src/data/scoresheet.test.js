// Dates are "today in Dallas"; pinned so the answers do not depend on the machine.
process.env.TZ = 'America/Chicago';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, START_FEN } from '../engine/chess.js';
import { parseAndValidate } from '../analysis/pgn.js';
import { analyzeGame } from '../analysis/analyzeGame.js';
import {
  absolutePly,
  plyToMove,
  describePly,
  startPlyOf,
  placementFromFen,
  fenFromPlacement,
  possibleCastling,
  setupAfterGap,
  validateSetup,
  blankSheet,
  checkSheet,
  buildScoresheetGame,
  scoresheetGapOf,
} from './scoresheet.js';

const OPERA = [
  'e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5', 'Bc4', 'Nf6', 'Qb3', 'Qe7',
  'Nc3', 'c6', 'Bg5', 'b5', 'Nxb5', 'cxb5', 'Bxb5+', 'Nbd7', 'O-O-O', 'Rd8', 'Rxd7', 'Rxd7', 'Rd1',
  'Qe6', 'Bxd7+', 'Nxd7', 'Qb8+', 'Nxb8', 'Rd8#',
];

const fenAfter = (tokens) => {
  const chess = new Chess();
  for (const t of tokens) chess.move(t);
  return chess.fen();
};

const ROSTER = [
  { playerId: 'CC-010', name: 'Ada Lopez' },
  { playerId: 'CC-011', name: 'Ben Ortiz' },
];
const NOW = Date.parse('2026-10-25T15:00:00Z');

const sheet = (overrides = {}) => ({
  ...blankSheet('2026-10-24'),
  whiteId: 'CC-010',
  blackName: 'J.D.',
  event: 'DISD District Championship',
  round: '3',
  board: '4',
  timeControl: 'g/30 d5',
  result: '1-0',
  segments: [{ fen: START_FEN, tokens: [...OPERA] }],
  ...overrides,
});

// -- plies -------------------------------------------------------------------

test('absolutePly, plyToMove, describePly and startPlyOf agree', () => {
  assert.equal(absolutePly(1, 'w'), 0);
  assert.equal(absolutePly(20, 'w'), 38);
  assert.equal(absolutePly(19, 'b'), 37);
  assert.deepEqual(plyToMove(37), { moveNumber: 19, color: 'b' });
  assert.equal(describePly(38), '20. White');
  assert.equal(describePly(37), '19... Black');
  assert.equal(startPlyOf(START_FEN), 0);
  assert.equal(startPlyOf('4k3/8/8/8/8/8/8/4K3 b - - 0 20'), 39);
});

// -- set-up positions --------------------------------------------------------

test('placementFromFen and fenFromPlacement round-trip', () => {
  const { squares, castling } = placementFromFen(START_FEN);
  assert.equal(squares.e1, 'K');
  assert.equal(squares.d8, 'q');
  assert.equal(Object.keys(squares).length, 32);
  assert.equal(fenFromPlacement(squares, { turn: 'w', moveNumber: 1, castling }), START_FEN);
});

test('possibleCastling: a right survives only with king and rook at home', () => {
  const { squares } = placementFromFen(START_FEN);
  assert.equal(possibleCastling(squares), 'KQkq');
  const moved = { ...squares, f1: 'K' };
  delete moved.e1;
  assert.equal(possibleCastling(moved), 'kq');
  const noRook = { ...squares };
  delete noRook.a8;
  assert.equal(possibleCastling(noRook, 'KQkq'), 'KQk');
  assert.equal(possibleCastling(squares, 'Kq'), 'Kq', 'a right already lost is not given back');
  assert.equal(possibleCastling({ e1: 'K', e8: 'k' }), '-');
});

test('setupAfterGap: the last known position, with the resuming side and move number', () => {
  const fen = setupAfterGap(START_FEN, absolutePly(20, 'b'));
  assert.equal(fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 20');
});

test('validateSetup NEGATIVE: kings, pawns on the back rank, and the wrong side in check', () => {
  assert.deepEqual(validateSetup(START_FEN), []);
  assert.match(validateSetup('4k3/8/8/8/8/8/8/4KK2 w - - 0 1').join(' '), /exactly one king/);
  assert.match(validateSetup('4k3/8/8/8/8/8/8/8 w - - 0 1').join(' '), /White needs exactly one king/);
  assert.match(validateSetup('P3k3/8/8/8/8/8/8/4K3 w - - 0 1').join(' '), /first or last rank/);
  // Black is in check from the rook, but it is White to move.
  assert.match(validateSetup('4k3/8/8/8/8/8/8/4RK2 w - - 0 1').join(' '), /Black is in check but it is not their move/);
  assert.match(validateSetup('4k3/pppppppp/p7/8/8/8/8/4K3 w - - 0 1').join(' '), /more than 8 pawns/);
});

// -- a whole game ------------------------------------------------------------

test('buildScoresheetGame: the Opera Game as a tournament scoresheet', () => {
  const built = buildScoresheetGame(sheet(), { roster: ROSTER, now: NOW });
  assert.equal(built.ok, true, JSON.stringify(built.errors));
  const { game, pgn } = built;
  assert.match(game.id, /^pgn:[0-9a-f]{16}$/);
  assert.equal(game.playedAt, '2026-10-24T12:00:00.000Z');
  assert.equal(game.whitePlayerId, 'CC-010');
  assert.equal(game.whiteName, 'Ada Lopez', 'a member is filed under their roster name');
  assert.equal(game.blackPlayerId, '');
  assert.equal(game.blackName, 'J.D.');
  assert.equal(game.result, '1-0');
  assert.equal(game.reason, 'Checkmate');
  assert.equal(game.moveCount, 33);
  assert.equal(game.mode, 'human');
  assert.equal(game.event, 'DISD District Championship');
  assert.equal(game.round, '3');
  assert.equal(game.board, 4);
  assert.equal(game.timeControl, 'G/30;d5', 'the time control is normalised');
  assert.match(pgn, /\[Event "DISD District Championship"\]/);
  assert.match(pgn, /\[Round "3"\]/);
  assert.match(pgn, /\[Board "4"\]/);
  assert.match(pgn, /\[TimeControl "1800\+5"\]/);
  assert.match(pgn, /\[Date "2026\.10\.24"\]/);
  assert.doesNotMatch(pgn, /SetUp|FEN|ScoresheetGap/);
  const [parsed] = parseAndValidate(pgn);
  assert.equal(parsed.moves.length, 33);
  assert.equal(built.analysedPlies, 33);
  assert.equal(built.note, '');
  // Entering the same sheet twice gives the same id, so the archive dedupes it.
  assert.equal(buildScoresheetGame(sheet(), { roster: ROSTER, now: NOW }).game.id, game.id);
});

test('buildScoresheetGame NEGATIVE: an illegal move at ply 17 blocks saving and names the ply', () => {
  const tokens = [...OPERA];
  tokens[16] = 'Ke3';
  const built = buildScoresheetGame(sheet({ segments: [{ fen: START_FEN, tokens }] }), { roster: ROSTER, now: NOW });
  assert.equal(built.ok, false);
  const moveError = built.errors.find((e) => e.field === 'moves');
  assert.equal(moveError.segment, 0);
  assert.equal(moveError.index, 16);
  assert.match(moveError.message, /^9\. Ke3 is not a legal move/);
});

test('buildScoresheetGame NEGATIVE: a result that contradicts the mate on the board', () => {
  const built = buildScoresheetGame(sheet({ result: '0-1' }), { roster: ROSTER, now: NOW });
  assert.equal(built.ok, false);
  assert.ok(built.errors.some((e) => e.field === 'result' && /checkmate/.test(e.message)));
});

test('buildScoresheetGame NEGATIVE: players, date, tags and result are all checked', () => {
  const built = buildScoresheetGame(
    sheet({
      whiteId: 'CC-011',
      blackId: 'CC-011',
      date: '2026-10-26',
      round: 'round three!',
      board: 'four',
      timeControl: 'thirty minutes',
      result: '',
    }),
    { roster: ROSTER, now: NOW },
  );
  assert.equal(built.ok, false);
  const fields = built.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['blackName', 'board', 'date', 'result', 'round', 'timeControl']);

  const nobody = buildScoresheetGame(sheet({ whiteId: '', whiteName: '', blackName: '' }), { roster: ROSTER, now: NOW });
  assert.ok(nobody.errors.some((e) => e.field === 'whiteName' && /Who played White/.test(e.message)));
  const strangers = buildScoresheetGame(sheet({ whiteId: '', whiteName: 'A.B.' }), { roster: ROSTER, now: NOW });
  assert.ok(strangers.errors.some((e) => /club member/.test(e.message)));
  const ghost = buildScoresheetGame(sheet({ whiteId: 'CC-999' }), { roster: ROSTER, now: NOW });
  assert.ok(ghost.errors.some((e) => /not on the roster/.test(e.message)));
  const empty = buildScoresheetGame(sheet({ segments: [{ fen: START_FEN, tokens: [] }] }), { roster: ROSTER, now: NOW });
  assert.ok(empty.errors.some((e) => e.field === 'moves' && /at least one move/.test(e.message)));
});

// -- gaps (F066) -------------------------------------------------------------

// 11... Nbd7 and 12. O-O-O are unreadable; the coach sets up the position
// before 12... Rd8 and carries on from the sheet.
const gapSheet = () => {
  const resumeFen = fenAfter(OPERA.slice(0, 23));
  return sheet({
    segments: [
      { fen: START_FEN, tokens: OPERA.slice(0, 21) },
      { fen: resumeFen, tokens: OPERA.slice(23) },
    ],
  });
};

test('buildScoresheetGame: two unreadable moves — saved, noted, and analysed from after the gap', () => {
  const built = buildScoresheetGame(gapSheet(), { roster: ROSTER, now: NOW });
  assert.equal(built.ok, true, JSON.stringify(built.errors));
  assert.equal(built.note, '11... Black to 12. White could not be read');
  assert.equal(built.analysedFrom, '12... Black');
  assert.equal(built.analysedPlies, 10);
  assert.equal(built.game.moveCount, 33, 'the game was 33 plies long, gap included');
  assert.equal(built.game.reason, 'Checkmate');

  const { pgn } = built;
  assert.match(pgn, /\[SetUp "1"\]/);
  assert.match(pgn, /\[FEN "[^"]+ b kq - \d+ 12"\]/);
  assert.equal(scoresheetGapOf(pgn), '11... Black to 12. White could not be read');
  assert.match(pgn, /Readable moves before the gap: 1\. e4 e5 2\. Nf3/);
  assert.match(pgn, /11\. Bxb5\+/);
  assert.match(pgn, /12\.\.\. Rd8 13\. Rxd7/);

  const [parsed] = parseAndValidate(pgn);
  assert.equal(parsed.moves.length, 10, 'only the known segment is the mainline');
  assert.equal(parsed.tags.FEN, gapSheet().segments[1].fen);
});

test('the analyser takes a gap game and analyses only the known segment', async () => {
  const { pgn } = buildScoresheetGame(gapSheet(), { roster: ROSTER, now: NOW });
  const seen = [];
  const stubEngine = {
    async evaluate(fen) {
      seen.push(fen);
      return { lines: [{ cp: 20, mate: null, pv: [] }, { cp: 10, mate: null, pv: [] }, { cp: 0, mate: null, pv: [] }] };
    },
  };
  const analysis = await analyzeGame(pgn, stubEngine, { whitePlayerId: 'CC-010' });
  assert.equal(analysis.plies.length, 10);
  assert.equal(analysis.plies[0].fullmove, 12);
  assert.equal(analysis.plies[0].san, 'Rd8');
  assert.equal(seen[0], gapSheet().segments[1].fen, 'the first position analysed is the one set up after the gap');
});

test('buildScoresheetGame: the rest of the game unreadable', () => {
  const built = buildScoresheetGame(
    sheet({ segments: [{ fen: START_FEN, tokens: OPERA.slice(0, 30) }], endsUnknown: true, result: '1-0', reason: 'Resignation' }),
    { roster: ROSTER, now: NOW },
  );
  assert.equal(built.ok, true, JSON.stringify(built.errors));
  assert.equal(built.note, 'The moves after 15... Black could not be read');
  assert.match(built.pgn, /\{The rest of the game could not be read\.\} 1-0/);
  assert.doesNotMatch(built.pgn, /FEN/);
  assert.equal(built.game.reason, 'Resignation');
  assert.equal(parseAndValidate(built.pgn)[0].moves.length, 30);
});

test('buildScoresheetGame NEGATIVE: gap problems block saving', () => {
  const overlapping = gapSheet();
  overlapping.segments[1] = { fen: fenAfter(OPERA.slice(0, 20)), tokens: OPERA.slice(20) };
  const a = buildScoresheetGame(overlapping, { roster: ROSTER, now: NOW });
  assert.ok(a.errors.some((e) => /must start after/.test(e.message)));

  const badSetup = gapSheet();
  badSetup.segments[1] = { fen: '4k3/8/8/8/8/8/8/4KK2 b - - 0 12', tokens: [] };
  const b = buildScoresheetGame(badSetup, { roster: ROSTER, now: NOW });
  assert.ok(b.errors.some((e) => /set-up position/.test(e.message)));

  const noMovesAfter = gapSheet();
  noMovesAfter.segments[1] = { ...noMovesAfter.segments[1], tokens: [] };
  const c = buildScoresheetGame(noMovesAfter, { roster: ROSTER, now: NOW });
  assert.ok(c.errors.some((e) => /at least one move after the position you set up/.test(e.message)));

  const mateThenGap = sheet({
    segments: [
      { fen: START_FEN, tokens: ['f3', 'e5', 'g4', 'Qh4#'] },
      { fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 10', tokens: ['Kd2'] },
    ],
    result: '0-1',
  });
  const d = buildScoresheetGame(mateThenGap, { roster: ROSTER, now: NOW });
  assert.ok(d.errors.some((e) => /ended \(checkmate\) before the gap/.test(e.message)));
});

test('checkSheet: the first problem anywhere on the sheet, with its segment', () => {
  const s = gapSheet();
  s.segments[1].tokens[2] = 'Qz9';
  const checked = checkSheet(s);
  assert.equal(checked.firstError.segment, 1);
  assert.equal(checked.firstError.index, 2);
  assert.equal(checked.segments[0].endPly, 21);
  assert.equal(checked.segments[1].startPly, 23);
});

test('scoresheetGapOf: nothing for an ordinary PGN', () => {
  assert.equal(scoresheetGapOf('[Event "x"]\n\n1. e4 *'), '');
  assert.equal(scoresheetGapOf(null), '');
});
