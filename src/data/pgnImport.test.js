/*
 * pgnImport.test.js — run with: node --test src/data/pgnImport.test.js
 *
 * The cases here are the ones that actually go wrong on a club laptop: a
 * tournament export with one mangled game in it, a phone export full of
 * clock annotations, the same file imported twice by two different people,
 * and a pairing program that writes "Last, First" while the roster says
 * "First Last".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  importPgnText,
  matchPlayer,
  stableGameId,
  dedupe,
  splitPgnGames,
  playedAtFromTags,
} from './pgnImport.js';

const ROSTER = [
  { playerId: 'P-anthony', name: 'Anthony Villanueva-Parra' },
  { playerId: 'P-blessing', name: 'Blessing Okafor' },
  { playerId: 'P-ada', name: 'Ada Chen' },
];

/** Scholar's mate, White wins. Seven plies. */
const GOOD_GAME = `[Event "Club Ladder"]
[Site "Lincoln Middle School"]
[Date "2026.02.11"]
[Round "3"]
[White "Villanueva-Parra, Anthony"]
[Black "Okafor, Blessing"]
[Result "1-0"]

1. e4 e5 2. Bc4 Bc5 3. Qh5 Nf6 4. Qxf7# 1-0
`;

/** Same opening, but White's fifth move is a queen teleport. */
const BAD_GAME = `[Event "Club Ladder"]
[Site "Lincoln Middle School"]
[Date "2026.02.11"]
[Round "4"]
[White "Ada Chen"]
[Black "Okafor, Blessing"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. Qh8 1-0
`;

const CLOCK_GAME = `[Event "Rapid 10+5"]
[Site "?"]
[Date "2026.03.01"]
[Round "-"]
[White "Ada Chen"]
[Black "Sam Rivera"]
[Result "0-1"]
[TimeControl "600+5"]

1. d4 {[%clk 0:10:00]} d5 {[%clk 0:09:58]} 2. c4 {[%clk 0:09:51]} dxc4 {[%clk 0:09:40]} 0-1
`;

// ---------------------------------------------------------------------------

test('a valid single game imports as one archive record', () => {
  const { games, errors, skipped } = importPgnText(GOOD_GAME, { roster: ROSTER });

  assert.equal(errors.length, 0, 'a legal game produces no errors');
  assert.equal(skipped, 0);
  assert.equal(games.length, 1);

  const game = games[0];
  assert.equal(game.moveCount, 7, 'seven plies, counted as half-moves like the club archive');
  assert.equal(game.result, '1-0');
  assert.equal(game.mode, 'human');
  assert.equal(game.whiteName, 'Villanueva-Parra, Anthony');
  assert.equal(game.blackName, 'Okafor, Blessing');
  assert.equal(game.whitePlayerId, 'P-anthony', 'White matched onto the roster');
  assert.equal(game.blackPlayerId, 'P-blessing', 'Black matched onto the roster');
  assert.equal(game.playedAt, '2026-02-11T00:00:00.000Z');
  assert.equal(game.reason, 'Checkmate', 'the "#" on the last move says how it ended');
  assert.ok(game.id.startsWith('pgn:'), `id should be namespaced, got ${game.id}`);
  assert.match(game.pgn, /Qxf7#/, 'the original movetext is stored');

  // Exactly the fields gamesStore reads back off a row.
  for (const field of [
    'id',
    'playedAt',
    'whitePlayerId',
    'blackPlayerId',
    'whiteName',
    'blackName',
    'result',
    'reason',
    'moveCount',
    'mode',
    'pgn',
  ]) {
    assert.ok(field in game, `archive record is missing ${field}`);
  }
});

test('an unmatched name leaves the id blank rather than guessing', () => {
  const { games } = importPgnText(CLOCK_GAME, { roster: ROSTER });
  assert.equal(games[0].whitePlayerId, 'P-ada');
  assert.equal(games[0].blackPlayerId, '', 'Sam Rivera is not on the roster');
  assert.equal(games[0].blackName, 'Sam Rivera', 'but the name is still kept');
});

test('one illegal game does not stop the rest of the file', () => {
  const file = `${GOOD_GAME}\n${BAD_GAME}\n${CLOCK_GAME}`;
  const { games, errors, skipped } = importPgnText(file, { roster: ROSTER });

  assert.equal(games.length, 2, 'the two legal games still import');
  assert.equal(errors.length, 1, 'exactly one game is rejected');
  assert.equal(skipped, 1);

  assert.equal(errors[0].index, 1, 'the error points at the second game in the file');
  assert.match(errors[0].message, /illegal move/i);
  assert.match(errors[0].message, /5\./, 'the error names the move number');
  assert.match(errors[0].message, /Qh8/, 'the error names the SAN of the bad move');
  assert.match(errors[0].message, /game 2/, 'the error names which game in the file');

  assert.equal(games[0].result, '1-0', 'the first game survived intact');
  assert.equal(games[0].moveCount, 7);
  assert.equal(games[1].result, '0-1', 'the third game survived too');
  assert.ok(
    !games.some((g) => g.pgn.includes('Qh8')),
    'no part of the rejected game leaks into the good records',
  );
});

test('a truncated game is rejected whole, never silently shortened', () => {
  const { games, errors } = importPgnText(BAD_GAME, { roster: ROSTER });
  assert.equal(games.length, 0, 'a game with an illegal move is not imported at all');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Qh8/);
});

test('[%clk] annotations survive into the stored PGN', () => {
  const { games, errors } = importPgnText(CLOCK_GAME, { roster: ROSTER });

  assert.equal(errors.length, 0);
  assert.equal(games.length, 1);
  const game = games[0];

  assert.equal(game.moveCount, 4, 'clock comments are not counted as moves');
  assert.match(game.pgn, /\[%clk 0:10:00\]/, 'the first clock reading is stored');
  assert.match(game.pgn, /\[%clk 0:09:40\]/, 'the last clock reading is stored');
  assert.equal(
    (game.pgn.match(/\[%clk/g) || []).length,
    4,
    'all four clock readings survive the round trip',
  );
  assert.match(game.pgn, /\[TimeControl "600\+5"\]/, 'the TimeControl tag comes along too');
  assert.equal(game.reason, '', 'no Termination tag and no mate: no reason invented');
});

test('re-importing the same text gives identical ids, and dedupe drops the second set', () => {
  const file = `${GOOD_GAME}\n${CLOCK_GAME}`;
  const first = importPgnText(file, { roster: ROSTER });
  const second = importPgnText(file, { roster: ROSTER });

  assert.equal(first.games.length, 2);
  assert.deepEqual(
    second.games.map((g) => g.id),
    first.games.map((g) => g.id),
    'ids are a pure function of the file contents',
  );

  const existing = new Set(first.games.map((g) => g.id));
  assert.equal(dedupe(second.games, existing).length, 0, 'a second import adds nothing');
  assert.equal(dedupe(first.games, []).length, 2, 'a first import against an empty archive keeps both');
  assert.equal(
    dedupe([...first.games, ...second.games], []).length,
    2,
    'duplicates inside one batch collapse as well',
  );
  assert.equal(dedupe(first.games, ['pgn:nope']).length, 2, 'unrelated ids do not block anything');
});

test('importPgnText itself collapses a game repeated inside one file', () => {
  const { games, skipped } = importPgnText(`${GOOD_GAME}\n${GOOD_GAME}`, { roster: ROSTER });
  assert.equal(games.length, 1, 'the same game twice in one file is one game');
  assert.equal(skipped, 1, 'the dropped copy is counted as skipped');
});

test('stableGameId changes when the moves change and survives an added comment', () => {
  const base = { tags: { White: 'A', Black: 'B', Date: '2026.01.01' }, moves: [{ san: 'e4' }] };
  const same = { tags: { White: 'A', Black: 'B', Date: '2026.01.01' }, moves: [{ san: 'e4' }] };
  const other = { tags: { White: 'A', Black: 'B', Date: '2026.01.01' }, moves: [{ san: 'd4' }] };

  assert.equal(stableGameId(base), stableGameId(same), 'same game, same id');
  assert.notEqual(stableGameId(base), stableGameId(other), 'different moves, different id');
  assert.match(stableGameId(base), /^pgn:[0-9a-f]{16}$/);

  // A re-export with commentary is still the same game.
  const annotated = importPgnText(GOOD_GAME, { roster: ROSTER }).games[0];
  const withComment = GOOD_GAME.replace('4. Qxf7#', '4. Qxf7# {Scholar\'s mate!}');
  const reannotated = importPgnText(withComment, { roster: ROSTER }).games[0];
  assert.equal(reannotated.id, annotated.id, 'comments do not change a game\'s identity');
});

test('matchPlayer tolerates "Last, First" against "First Last"', () => {
  assert.equal(matchPlayer('Villanueva-Parra, Anthony', ROSTER), 'P-anthony');
  assert.equal(matchPlayer('Anthony Villanueva-Parra', ROSTER), 'P-anthony');
  assert.equal(matchPlayer('anthony villanueva-parra', ROSTER), 'P-anthony', 'case-insensitive');
  assert.equal(matchPlayer('  Anthony   Villanueva Parra  ', ROSTER), 'P-anthony', 'spacing is forgiven');
  assert.equal(matchPlayer('Okafor, Blessing', ROSTER), 'P-blessing');
});

test('matchPlayer returns null rather than guessing wrong', () => {
  assert.equal(matchPlayer('Sam Rivera', ROSTER), null, 'an unknown name is null, not a near miss');
  assert.equal(matchPlayer('Anthony', ROSTER), null, 'a first name alone is not enough');
  assert.equal(matchPlayer('Anthony Villanueva', ROSTER), null, 'a partial surname is not enough');
  assert.equal(matchPlayer('?', ROSTER), null, 'the PGN placeholder is not a player');
  assert.equal(matchPlayer('', ROSTER), null);
  assert.equal(matchPlayer(null, ROSTER), null);
  assert.equal(matchPlayer('Ada Chen', []), null, 'an empty roster matches nobody');
});

test('matchPlayer refuses an ambiguous name unless the importer is one of them', () => {
  const twins = [
    { playerId: 'P-1', name: 'Ada Chen' },
    { playerId: 'P-2', name: 'Chen, Ada' },
  ];
  assert.equal(matchPlayer('Ada Chen', twins), null, 'two roster rows with one name is ambiguous');
  assert.equal(matchPlayer('Ada Chen', twins, { preferId: 'P-2' }), 'P-2', 'the importer breaks the tie');
  assert.equal(matchPlayer('Ada Chen', twins, { preferId: 'P-9' }), null, 'an outsider breaks nothing');

  const { games } = importPgnText(CLOCK_GAME, { roster: twins, playerId: 'P-2' });
  assert.equal(games[0].whitePlayerId, 'P-2', 'importPgnText passes the importer through as the tiebreak');
});

test('matchPlayer accepts the roster id spelling the caller happens to hold', () => {
  assert.equal(matchPlayer('Ada Chen', [{ player_id: 'P-x', name: 'Ada Chen' }]), 'P-x');
  assert.equal(matchPlayer('Ada Chen', [{ id: 'P-y', name: 'Ada Chen' }]), 'P-y');
  assert.equal(matchPlayer('Ada Chen', [{ name: 'Ada Chen' }]), null, 'a row with no id cannot be matched');
});

test('splitPgnGames keeps a bracketed clock inside a comment out of the boundary logic', () => {
  const chunks = splitPgnGames(`${GOOD_GAME}\n${CLOCK_GAME}`);
  assert.equal(chunks.length, 2, 'two games, and [%clk] does not open a third');
  assert.match(chunks[0], /Club Ladder/);
  assert.match(chunks[1], /Rapid 10\+5/);
  assert.equal(splitPgnGames('').length, 0);
  assert.equal(splitPgnGames('   \n\n  ').length, 0, 'whitespace is not a game');
});

test('variations and NAGs do not split a game or inflate its move count', () => {
  const withVariation = `[Event "Analysis"]
[Date "2026.04.02"]
[White "Ada Chen"]
[Black "Sam Rivera"]
[Result "*"]

1. e4! e5 (1... c5 2. Nf3 d6) 2. Nf3 $2 Nc6 *
`;
  const { games, errors } = importPgnText(withVariation, { roster: ROSTER });
  assert.equal(errors.length, 0);
  assert.equal(games.length, 1, 'a variation is not a second game');
  assert.equal(games[0].moveCount, 4, 'variation moves are not mainline plies');
  assert.equal(games[0].result, '*');
});

test('a file with no usable date reports null rather than inventing one', () => {
  const undated = GOOD_GAME.replace('[Date "2026.02.11"]', '[Date "????.??.??"]');
  const { games } = importPgnText(undated, { roster: ROSTER });
  assert.equal(games[0].playedAt, null);

  assert.equal(playedAtFromTags({ Date: '2026.02.11', Time: '18:30:00' }), '2026-02-11T18:30:00.000Z');
  assert.equal(
    playedAtFromTags({ Date: '2020.01.01', UTCDate: '2026.02.11' }),
    '2026-02-11T00:00:00.000Z',
    'UTCDate wins over the local Date tag',
  );
  assert.equal(playedAtFromTags({}), null);
});

test('a Termination tag supplies the reason when the moves do not', () => {
  const resigned = CLOCK_GAME.replace(
    '[TimeControl "600+5"]',
    '[TimeControl "600+5"]\n[Termination "Sam Rivera won by resignation"]',
  );
  assert.equal(importPgnText(resigned, { roster: ROSTER }).games[0].reason, 'Resignation');

  const flagged = CLOCK_GAME.replace('[TimeControl "600+5"]', '[Termination "Time forfeit"]');
  assert.equal(importPgnText(flagged, { roster: ROSTER }).games[0].reason, 'Time');
});

test('empty and junk input come back as errors, not as exceptions', () => {
  const empty = importPgnText('', { roster: ROSTER });
  assert.equal(empty.games.length, 0);
  assert.equal(empty.errors.length, 1);
  assert.equal(empty.skipped, 1);

  const tagsOnly = importPgnText('[Event "Nothing"]\n[White "Ada Chen"]\n', { roster: ROSTER });
  assert.equal(tagsOnly.games.length, 0);
  assert.match(tagsOnly.errors[0].message, /no moves/i);

  const nullMove = importPgnText(
    '[Event "Null"]\n[White "Ada Chen"]\n[Black "Sam Rivera"]\n[Result "*"]\n\n1. e4 -- 2. d4 *\n',
    { roster: ROSTER },
  );
  assert.equal(nullMove.games.length, 0, 'a null move is refused, not replayed as something else');
  assert.equal(nullMove.errors.length, 1);
});
