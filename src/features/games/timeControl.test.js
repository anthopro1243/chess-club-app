import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePgnTimeControl,
  parseUsChessTimeControl,
  estimatedMinutes,
  formatUsChess,
  toPgnTimeControlTag,
  timeControlOfGame,
} from './timeControl.js';

test('parsePgnTimeControl: base and increment in seconds', () => {
  assert.deepEqual(parsePgnTimeControl('600+5'), {
    baseSeconds: 600,
    incrementSeconds: 5,
    delaySeconds: 0,
    daily: false,
  });
  assert.equal(parsePgnTimeControl('180').baseSeconds, 180);
  assert.equal(parsePgnTimeControl('180').incrementSeconds, 0);
  assert.equal(parsePgnTimeControl(' 900+10 ').incrementSeconds, 10);
});

test('parsePgnTimeControl: daily games are flagged, multi-period reads the first period', () => {
  assert.equal(parsePgnTimeControl('1/259200').daily, true);
  const classical = parsePgnTimeControl('40/5400:1800+30');
  assert.equal(classical.daily, false);
  assert.equal(classical.baseSeconds, 5400);
  assert.equal(parsePgnTimeControl('*60').baseSeconds, 60);
});

test('parsePgnTimeControl: unknown and junk give null, never a guess', () => {
  for (const junk of ['-', '?', '', '   ', 'rapid', 'G/30;d5', '10|5', null, undefined, 42]) {
    assert.equal(parsePgnTimeControl(junk), null, String(junk));
  }
});

test('parseUsChessTimeControl: the spellings flyers use', () => {
  const g30d5 = parseUsChessTimeControl('G/30;d5');
  assert.deepEqual(g30d5, { baseSeconds: 1800, incrementSeconds: 0, delaySeconds: 5, daily: false });
  for (const variant of ['G/30 d5', 'G30;d5', 'Game/30, d5', 'g/30; D5', ' G / 30 ;d5 ']) {
    assert.deepEqual(parseUsChessTimeControl(variant), g30d5, variant);
  }
  assert.equal(parseUsChessTimeControl('G/60+5').incrementSeconds, 5);
  assert.equal(parseUsChessTimeControl('G/60;inc5').incrementSeconds, 5);
  assert.equal(parseUsChessTimeControl('G/60').delaySeconds, 0);
  const twoPeriod = parseUsChessTimeControl('40/90, SD/30;d5');
  assert.equal(twoPeriod.baseSeconds, 90 * 60);
  assert.equal(twoPeriod.delaySeconds, 5);
});

test('parseUsChessTimeControl: typos and PGN seconds are refused', () => {
  for (const junk of ['', 'G/', 'G/0', 'G/30 d5 please', 'rapid', '600+5', '30+5', null, undefined]) {
    assert.equal(parseUsChessTimeControl(junk), null, String(junk));
  }
});

test('estimatedMinutes: base plus forty moves of increment or delay', () => {
  assert.equal(estimatedMinutes(parsePgnTimeControl('600')), 10);
  assert.equal(estimatedMinutes(parsePgnTimeControl('900+10')), 15 + (40 * 10) / 60);
  assert.ok(Math.abs(estimatedMinutes(parseUsChessTimeControl('G/30;d5')) - 33.33) < 0.01);
  assert.equal(estimatedMinutes(parsePgnTimeControl('1/259200')), null, 'daily is not a sitting');
  assert.equal(estimatedMinutes(null), null);
});

test('formatUsChess and toPgnTimeControlTag: one control, both spellings', () => {
  const tc = parseUsChessTimeControl('G/30;d5');
  assert.equal(formatUsChess(tc), 'G/30;d5');
  // Same convention as the Play page's pgnTimeControlTag: delay written as +N.
  assert.equal(toPgnTimeControlTag(tc), '1800+5');
  assert.equal(formatUsChess(parsePgnTimeControl('600+5')), 'G/10+5');
  assert.equal(toPgnTimeControlTag(null), '-');
  assert.equal(formatUsChess(null), '');
});

test('timeControlOfGame: the column wins, then the PGN tag, else null', () => {
  const pgn = '[Event "x"]\n[TimeControl "180+2"]\n\n1. e4 *';
  assert.equal(timeControlOfGame({ pgn }).baseSeconds, 180);
  assert.equal(timeControlOfGame({ pgn, timeControl: 'G/30;d5' }).baseSeconds, 1800);
  // An unreadable column falls back to the tag rather than to nothing.
  assert.equal(timeControlOfGame({ pgn, timeControl: 'rapid' }).baseSeconds, 180);
  assert.equal(timeControlOfGame({ pgn: '1. e4 e5 *' }), null);
  assert.equal(timeControlOfGame({ pgn: '[TimeControl "-"]\n\n1. e4 *' }), null);
  assert.equal(timeControlOfGame(null), null);
});
