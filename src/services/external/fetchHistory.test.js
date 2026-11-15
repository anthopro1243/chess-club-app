/*
 * fetchRecentHistory: the deeper, analysis-only look back. The two sites are
 * replaced by canned answers; what matters is how they are asked (one request
 * at a time, newest months first, a sensible `max`) and what comes back.
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRecentHistory } from './externalChess.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const chesscomGame = (uuid, endTime) => ({
  uuid, rated: true, rules: 'chess', end_time: endTime, time_class: 'blitz', pgn: '1. e4 e5 1-0',
  white: { username: 'kid', rating: 1000, result: 'win' },
  black: { username: 'opp', rating: 1000, result: 'resigned' },
});

function stubChesscom(monthsNewestLast) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  globalThis.fetch = async (url) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight -= 1;
    calls.push(String(url));
    const u = String(url);
    if (u.endsWith('/games/archives')) {
      return { ok: true, status: 200, json: async () => ({ archives: monthsNewestLast.map((_, i) => `https://api.chess.com/pub/player/kid/games/2026/${String(i + 1).padStart(2, '0')}`) }) };
    }
    const i = Number(u.slice(-2)) - 1;
    return { ok: true, status: 200, json: async () => ({ games: monthsNewestLast[i] }) };
  };
  return { calls, maxInFlight: () => maxInFlight };
}

test('Chess.com: walks months newest first, one at a time, and stops once it has enough', async () => {
  // 5 months of 30 games; limit 70 needs the 3 newest months.
  const months = Array.from({ length: 5 }, (_, m) =>
    Array.from({ length: 30 }, (_, i) => chesscomGame(`m${m}-${i}`, 1_700_000_000 + m * 3_000_000 + i * 60)));
  const spy = stubChesscom(months);
  const { games, reachedEnd } = await fetchRecentHistory('chesscom', 'kid', { limit: 70, pauseMs: 0 });

  assert.equal(games.length, 70);
  assert.equal(reachedEnd, false);
  const monthCalls = spy.calls.filter((u) => !u.endsWith('/archives'));
  assert.deepEqual(monthCalls.map((u) => u.slice(-2)), ['05', '04', '03']);
  assert.equal(spy.maxInFlight(), 1, 'requests are never in parallel');
  // Newest first, even though the site lists each month oldest first.
  const stamps = games.map((g) => g.playedAt);
  assert.deepEqual(stamps, [...stamps].sort().reverse());
});

test('Chess.com: a short account is reported as fully seen', async () => {
  const spy = stubChesscom([[chesscomGame('a', 1_700_000_000), chesscomGame('b', 1_700_000_100)]]);
  const { games, reachedEnd } = await fetchRecentHistory('chesscom', 'kid', { limit: 200, pauseMs: 0 });
  assert.equal(games.length, 2);
  assert.equal(reachedEnd, true);
  assert.equal(spy.calls.length, 2);
});

test('Chess.com: a time limit stops the walk and says it is unfinished', async () => {
  const months = Array.from({ length: 4 }, (_, m) => [chesscomGame(`x${m}`, 1_700_000_000 + m * 3_000_000)]);
  stubChesscom(months);
  const { games, reachedEnd } = await fetchRecentHistory('chesscom', 'kid', { limit: 200, pauseMs: 0, deadlineAt: Date.now() - 1 });
  assert.equal(games.length, 0);
  assert.equal(reachedEnd, false);
});

test('Chess.com: a 429 is thrown with its status so the caller can back off', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(() => fetchRecentHistory('chesscom', 'kid', { pauseMs: 0 }), (e) => e.status === 429);
});

test('Lichess: one request asking for the newest `limit` games; fewer back means the end of the account', async () => {
  const line = (id, at) => JSON.stringify({
    id, rated: true, variant: 'standard', perf: 'blitz', createdAt: at, lastMoveAt: at, status: 'mate', winner: 'white',
    players: { white: { user: { id: 'kid', name: 'Kid' }, rating: 1500 }, black: { user: { id: 'x', name: 'X' }, rating: 1500 } },
    moves: 'e4 e5', pgn: '1. e4 e5',
  });
  let url = '';
  globalThis.fetch = async (u) => {
    url = String(u);
    return { ok: true, status: 200, text: async () => [line('a', 2000), line('b', 3000)].join('\n') };
  };
  const { games, reachedEnd } = await fetchRecentHistory('lichess', 'Kid', { limit: 200 });
  assert.match(url, /max=200/);
  assert.match(url, /sort=dateDesc/);
  assert.deepEqual(games.map((g) => g.externalId), ['lichess:b', 'lichess:a']);
  assert.equal(reachedEnd, true);
});
