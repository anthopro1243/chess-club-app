import test from 'node:test';
import assert from 'node:assert/strict';

import {
  openingKey,
  repertoireReport,
  weakestLines,
  playerScore,
  DEFAULT_PLIES,
} from './repertoire.js';

const ITALIAN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6'];
const SICILIAN = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6'];
const FRENCH = ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5'];

/** A game row as the report expects it. */
const game = (white, black, result, sanMoves) => ({
  whitePlayerId: white,
  blackPlayerId: black,
  result,
  sanMoves,
});

/* ── openingKey ───────────────────────────────────────────────────────────── */

test('openingKey numbers the moves the way a player writes them', () => {
  assert.equal(openingKey(ITALIAN, 4), '1.e4 e5 2.Nf3 Nc6');
  assert.equal(openingKey(ITALIAN, 8), '1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6');
  assert.equal(openingKey(ITALIAN), openingKey(ITALIAN, DEFAULT_PLIES));
});

test('an odd cut ends on White with no dangling separator', () => {
  assert.equal(openingKey(ITALIAN, 5), '1.e4 e5 2.Nf3 Nc6 3.Bc4');
  assert.equal(openingKey(ITALIAN, 1), '1.e4');
});

test('the key is stable and only as long as the game is', () => {
  assert.equal(openingKey(['e4', 'e5'], 8), '1.e4 e5', 'a two-move game is not padded');
  assert.equal(openingKey(ITALIAN, 4), openingKey([...ITALIAN], 4), 'same moves, same key');
  assert.notEqual(openingKey(ITALIAN, 4), openingKey(SICILIAN, 4));
});

test('openingKey returns an empty string rather than throwing on junk', () => {
  assert.equal(openingKey([]), '');
  assert.equal(openingKey(undefined), '');
  assert.equal(openingKey(null, 4), '');
  assert.equal(openingKey(['e4', '', 'Nf3'], 8), '1.e4 Nf3', 'blank entries are dropped');
});

/* ── playerScore ──────────────────────────────────────────────────────────── */

test('a result is worth what it is worth to THIS player', () => {
  assert.equal(playerScore('1-0', 'w'), 1);
  assert.equal(playerScore('1-0', 'b'), 0);
  assert.equal(playerScore('0-1', 'b'), 1, 'a win as Black is a win');
  assert.equal(playerScore('0-1', 'w'), 0);
  assert.equal(playerScore('1/2-1/2', 'w'), 0.5);
  assert.equal(playerScore('1/2-1/2', 'b'), 0.5);
  assert.equal(playerScore('*', 'w'), null, 'an undecided game scores nothing');
  assert.equal(playerScore(undefined, 'w'), null);
});

/* ── repertoireReport ─────────────────────────────────────────────────────── */

test('three e4 games as White, two wins and a loss, report as 3 games scoring 2/3', () => {
  const games = [
    game('P1', 'P2', '1-0', ITALIAN),
    game('P1', 'P3', '1-0', ITALIAN),
    game('P1', 'P4', '0-1', ITALIAN),
  ];
  const report = repertoireReport(games, 'P1');

  assert.equal(report.asWhite.length, 1);
  assert.equal(report.asBlack.length, 0, 'they never had Black here');

  const line = report.asWhite[0];
  assert.equal(line.key, openingKey(ITALIAN, 8));
  assert.equal(line.games, 3);
  assert.equal(line.wins, 2);
  assert.equal(line.draws, 0);
  assert.equal(line.losses, 1);
  assert.equal(line.score, 2 / 3);
});

test('results as Black are scored from Black’s side', () => {
  const games = [
    game('P2', 'P1', '0-1', SICILIAN), // P1 wins with Black
    game('P3', 'P1', '0-1', SICILIAN), // and again
    game('P4', 'P1', '1-0', SICILIAN), // loses one
    game('P5', 'P1', '1/2-1/2', SICILIAN), // draws one
  ];
  const { asWhite, asBlack } = repertoireReport(games, 'P1');

  assert.equal(asWhite.length, 0);
  assert.equal(asBlack.length, 1);
  assert.equal(asBlack[0].games, 4);
  assert.equal(asBlack[0].wins, 2);
  assert.equal(asBlack[0].draws, 1);
  assert.equal(asBlack[0].losses, 1);
  assert.equal(asBlack[0].score, 2.5 / 4, 'not 1.5/4 — the White-POV answer');
});

test('the two colours are kept apart even when the moves are identical', () => {
  const games = [
    game('P1', 'P2', '1-0', ITALIAN),
    game('P1', 'P3', '1-0', ITALIAN),
    game('P4', 'P1', '1-0', ITALIAN),
    game('P5', 'P1', '1-0', ITALIAN),
  ];
  const report = repertoireReport(games, 'P1');

  assert.equal(report.asWhite[0].score, 1, 'won both as White');
  assert.equal(report.asBlack[0].score, 0, 'lost both as Black');
  assert.equal(report.asWhite[0].key, report.asBlack[0].key, 'same line, opposite sides');
});

test('lines below minGames are left out, so a one-off is not a repertoire', () => {
  const games = [
    game('P1', 'P2', '1-0', ITALIAN),
    game('P1', 'P3', '0-1', ITALIAN),
    game('P1', 'P4', '1-0', FRENCH), // played exactly once
  ];

  const report = repertoireReport(games, 'P1');
  assert.equal(report.asWhite.length, 1, 'the singleton is filtered');
  assert.equal(report.asWhite[0].key, openingKey(ITALIAN, 8));

  const everything = repertoireReport(games, 'P1', { minGames: 1 });
  assert.equal(everything.asWhite.length, 2, 'minGames: 1 keeps it');
});

test('lines are ordered most-played first', () => {
  const games = [
    game('P1', 'P2', '1-0', ITALIAN),
    game('P1', 'P3', '1-0', ITALIAN),
    game('P1', 'P4', '1-0', ITALIAN),
    game('P1', 'P5', '0-1', FRENCH),
    game('P1', 'P6', '0-1', FRENCH),
  ];
  const { asWhite } = repertoireReport(games, 'P1');
  assert.deepEqual(
    asWhite.map((l) => l.games),
    [3, 2],
  );
  assert.equal(asWhite[0].key, openingKey(ITALIAN, 8));
});

test('the plies option controls how fine the lines are split', () => {
  const sameFirstFour = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];
  const games = [
    game('P1', 'P2', '1-0', ITALIAN),
    game('P1', 'P3', '1-0', ITALIAN),
    game('P1', 'P4', '0-1', sameFirstFour),
    game('P1', 'P5', '0-1', sameFirstFour),
  ];

  assert.equal(repertoireReport(games, 'P1', { plies: 8 }).asWhite.length, 2, 'Italian vs Ruy');
  const merged = repertoireReport(games, 'P1', { plies: 4 }).asWhite;
  assert.equal(merged.length, 1, 'at four plies they are the same line');
  assert.equal(merged[0].games, 4);
  assert.equal(merged[0].score, 0.5);
});

test('other people’s games, undecided games and moveless rows are skipped', () => {
  const games = [
    game('P2', 'P3', '1-0', ITALIAN), // P1 not involved
    game('P1', 'P2', '*', ITALIAN), // adjourned
    game('P1', 'P3', '1-0', []), // no movetext stored
    game('P1', 'P4', '1-0', ITALIAN),
    game('P1', 'P5', '1-0', ITALIAN),
  ];
  const { asWhite } = repertoireReport(games, 'P1');
  assert.equal(asWhite.length, 1);
  assert.equal(asWhite[0].games, 2, 'only the two complete, recorded games count');
  assert.equal(asWhite[0].score, 1);
});

test('an empty history returns empty arrays rather than throwing', () => {
  assert.deepEqual(repertoireReport([], 'P1'), { asWhite: [], asBlack: [] });
  assert.deepEqual(repertoireReport(undefined, 'P1'), { asWhite: [], asBlack: [] });
  assert.deepEqual(repertoireReport([game('P1', 'P2', '1-0', ITALIAN)], null), {
    asWhite: [],
    asBlack: [],
  });
});

/* ── weakestLines ─────────────────────────────────────────────────────────── */

test('weakestLines puts the worst-scoring line first, across both colours', () => {
  const games = [
    // Italian as White: 3 wins.
    game('P1', 'P2', '1-0', ITALIAN),
    game('P1', 'P3', '1-0', ITALIAN),
    game('P1', 'P4', '1-0', ITALIAN),
    // French as Black: 3 losses — the problem.
    game('P2', 'P1', '1-0', FRENCH),
    game('P3', 'P1', '1-0', FRENCH),
    game('P4', 'P1', '1-0', FRENCH),
  ];
  const report = repertoireReport(games, 'P1');
  const weak = weakestLines(report);

  assert.equal(weak.length, 2);
  assert.equal(weak[0].side, 'b');
  assert.equal(weak[0].key, openingKey(FRENCH, 8));
  assert.equal(weak[0].score, 0);
  assert.equal(weak[1].score, 1, 'the good line sorts last');
});

test('weakestLines demands more evidence than the report does', () => {
  const games = [
    game('P1', 'P2', '0-1', FRENCH),
    game('P1', 'P3', '0-1', FRENCH), // two games: in the report, not yet a lesson
    game('P2', 'P1', '1-0', SICILIAN),
    game('P3', 'P1', '1-0', SICILIAN),
    game('P4', 'P1', '1/2-1/2', SICILIAN),
  ];
  const report = repertoireReport(games, 'P1');
  assert.equal(report.asWhite.length, 1, 'two games is enough for the report');

  const weak = weakestLines(report);
  assert.equal(weak.length, 1, 'but not for the coaching prompt');
  assert.equal(weak[0].key, openingKey(SICILIAN, 8));
  assert.equal(weak[0].games, 3);

  assert.equal(weakestLines(report, { minGames: 2 }).length, 2);
  assert.equal(weakestLines(report, { minGames: 3, limit: 0 }).length, 0);
});

test('weakestLines handles an empty or malformed report', () => {
  assert.deepEqual(weakestLines({ asWhite: [], asBlack: [] }), []);
  assert.deepEqual(weakestLines(repertoireReport([], 'P1')), []);
  assert.deepEqual(weakestLines(undefined), []);
  assert.deepEqual(weakestLines({}), []);
});
