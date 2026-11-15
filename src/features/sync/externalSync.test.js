/*
 * Syncing a linked account end to end, in local mode with the two sites
 * replaced by canned answers. What is being pinned down:
 *   - a new link brings in about HISTORY_DEPTH games;
 *   - only the games the rating has always been fed with are rated, and the
 *     rating comes out exactly as it did before this change;
 *   - the extra, older games are archived for analysis only;
 *   - bullet is archived and rated, but filed as skipped;
 *   - a member who linked earlier is topped up once, and a short account is
 *     not topped up again on every sync.
 */

import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, getPlayers, setConnection } from '../roster/rosterStore.js';
import { getGames } from '../games/gamesStore.js';
import { syncPlatform } from './externalSync.js';
import { clearUserData } from '../../services/store.js';
import { HISTORY_DEPTH } from './historyTopUp.js';
import { fetchGames } from '../../services/external/externalChess.js';
import { updateRating, DEFAULT_RATING } from '../ratings/glicko2.js';
import { BULLET_SKIP_REASON } from '../analysis/bulletGames.js';

const realFetch = globalThis.fetch;
let requests = [];

const MONTHS = 6;
const PER_MONTH = 40;

/** Six months of Chess.com games for `user`: every 5th is bullet, each month oldest first like the real site. */
function chesscomMonths(user, { months = MONTHS, perMonth = PER_MONTH } = {}) {
  const out = {};
  for (let m = 1; m <= months; m += 1) {
    out[m] = Array.from({ length: perMonth }, (_, i) => {
      const bullet = i % 5 === 0;
      return {
        uuid: `${user}-${m}-${i}`,
        rated: true,
        rules: 'chess',
        end_time: Math.floor(Date.UTC(2026, m - 1, 1 + i % 28, 12, i) / 1000),
        time_class: bullet ? 'bullet' : 'blitz',
        url: `https://chess.com/${user}/${m}/${i}`,
        pgn: `[TimeControl "${bullet ? 60 : 300}"]\n\n1. e4 e5 1-0`,
        white: { username: user, rating: 1200, result: i % 3 === 0 ? 'win' : 'resigned' },
        black: { username: `opp${i}`, rating: 1150 + i, result: i % 3 === 0 ? 'resigned' : 'win' },
      };
    });
  }
  return out;
}

function stubChesscom(user, months) {
  const base = 'https://api.chess.com/pub/player/' + user;
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    const u = String(url);
    if (u === base) return json({ username: user, url: `https://chess.com/member/${user}` });
    if (u === `${base}/stats`) return json({ chess_blitz: { last: { rating: 1210 } } });
    if (u === `${base}/games/archives`) {
      return json({ archives: Object.keys(months).map((m) => `${base}/games/2026/${String(m).padStart(2, '0')}`) });
    }
    const month = /\/games\/2026\/(\d\d)$/.exec(u);
    if (month) return json({ games: months[Number(month[1])] || [] });
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

const archiveOf = (playerId) =>
  getGames().filter((g) => g.mode === 'chesscom' && g.whitePlayerId === playerId);
const archiveRequests = () => requests.filter((u) => /\/games\/2026\/\d\d$/.test(u));

beforeEach(() => {
  // The local game list keeps only the newest 500, so each test starts empty.
  clearUserData();
  requests = [];
});
after(() => {
  globalThis.fetch = realFetch;
});

test('a new link: about 200 recent games archived, but only the first 50 rated, exactly as before', async () => {
  const user = 'newkid';
  const months = chesscomMonths(user);
  stubChesscom(user, months);
  const playerId = addPlayer({ name: 'New Kid' });
  setConnection(playerId, 'chesscom', { username: user, lastGameAt: null, lastSyncedAt: null });

  // What the rating has always been fed with: the old first-sync fetch, untouched.
  const rated = (await fetchGames('chesscom', user, { limit: 50 })).filter((g) => g.opponentRating != null);
  requests = [];

  const result = await syncPlatform(playerId, 'chesscom');
  const player = getPlayers().find((p) => p.playerId === playerId);

  // Rating: the same 50 games, the same order, the same arithmetic.
  assert.equal(player.importedGameIds.length, 50);
  assert.deepEqual([...player.importedGameIds].sort(), rated.map((g) => g.externalId).sort());
  let expected = { ...DEFAULT_RATING, count: 0 };
  for (const g of [...rated].sort((a, b) => String(a.playedAt).localeCompare(String(b.playedAt)))) {
    expected = updateRating(expected, [{ opponentRating: g.opponentRating, opponentRd: 80, score: g.score }]);
  }
  assert.equal(player.clubRating.rating, expected.rating);
  assert.equal(player.clubRating.rd, expected.rd);
  assert.equal(player.clubRating.count, 50);
  assert.equal(result.imported, 50);

  // Archive: the newest HISTORY_DEPTH games, and nothing twice.
  const archive = archiveOf(playerId);
  assert.equal(archive.length, HISTORY_DEPTH);
  assert.equal(new Set(archive.map((g) => g.id)).size, HISTORY_DEPTH);
  assert.equal(result.historyAdded, HISTORY_DEPTH - 50);
  const analysisOnly = archive.filter((g) => !player.importedGameIds.includes(g.id));
  assert.equal(analysisOnly.length, HISTORY_DEPTH - 50);

  // The job is noted as finished, so it is not repeated.
  assert.ok(player.connections.chesscom.historyToppedUpAt);
});

test('bullet is archived and rated like any game, but filed as skipped for the engine', async () => {
  const user = 'bulletkid';
  stubChesscom(user, chesscomMonths(user));
  const playerId = addPlayer({ name: 'Bullet Kid' });
  setConnection(playerId, 'chesscom', { username: user, lastGameAt: null, lastSyncedAt: null });
  await syncPlatform(playerId, 'chesscom');

  const player = getPlayers().find((p) => p.playerId === playerId);
  const archive = archiveOf(playerId);
  const skipped = archive.filter((g) => g.analysisStatus === 'skipped');
  assert.ok(skipped.length > 0);
  assert.ok(skipped.every((g) => g.analysisError === BULLET_SKIP_REASON && /TimeControl "60"/.test(g.pgn)));
  assert.ok(archive.filter((g) => g.analysisStatus !== 'skipped').every((g) => /TimeControl "300"/.test(g.pgn)));
  // Rated games include bullet ones, as before.
  const ratedBullet = skipped.filter((g) => player.importedGameIds.includes(g.id));
  assert.ok(ratedBullet.length > 0);
});

test('a second sync does not fetch history again or add anything twice', async () => {
  const user = 'twice';
  stubChesscom(user, chesscomMonths(user));
  const playerId = addPlayer({ name: 'Twice' });
  setConnection(playerId, 'chesscom', { username: user, lastGameAt: null, lastSyncedAt: null });
  await syncPlatform(playerId, 'chesscom');
  const before = archiveOf(playerId).length;

  requests = [];
  await syncPlatform(playerId, 'chesscom');
  assert.equal(archiveOf(playerId).length, before);
  // Only the usual "anything new since last time?" month check, no history walk.
  assert.ok(archiveRequests().length <= 1, `month requests: ${archiveRequests().length}`);
});

test('a member who linked before: topped up once with older games, analysis only', async () => {
  const user = 'oldtimer';
  const months = chesscomMonths(user);
  stubChesscom(user, months);
  const playerId = addPlayer({ name: 'Old Timer' });
  // Linked and synced earlier: only the newest ~50 are in the archive, no note on the connection.
  setConnection(playerId, 'chesscom', { username: user, lastGameAt: null, lastSyncedAt: null });
  await syncPlatform(playerId, 'chesscom');
  const rated = getPlayers().find((p) => p.playerId === playerId).importedGameIds.length;
  setConnection(playerId, 'chesscom', { historyToppedUpAt: null }); // as a pre-change member looks
  // Pretend the earlier deep copy never happened: drop everything but the rated 50.
  const keep = new Set(getPlayers().find((p) => p.playerId === playerId).importedGameIds);
  const store = getGames();
  for (let i = store.length - 1; i >= 0; i -= 1) {
    if (store[i].mode === 'chesscom' && store[i].whitePlayerId === playerId && !keep.has(store[i].id)) store.splice(i, 1);
  }
  assert.equal(archiveOf(playerId).length, rated);

  await syncPlatform(playerId, 'chesscom');
  const player = getPlayers().find((p) => p.playerId === playerId);
  assert.equal(archiveOf(playerId).length, HISTORY_DEPTH);
  assert.equal(player.importedGameIds.length, rated, 'the extra games never reach the rating');
  assert.ok(player.connections.chesscom.historyToppedUpAt);
});

test('a short account (fewer than 200 games in total) is finished once and not asked again', async () => {
  const user = 'shortie';
  stubChesscom(user, chesscomMonths(user, { months: 2, perMonth: 30 })); // 60 games ever
  const playerId = addPlayer({ name: 'Shortie' });
  setConnection(playerId, 'chesscom', { username: user, lastGameAt: null, lastSyncedAt: null });
  await syncPlatform(playerId, 'chesscom');

  let player = getPlayers().find((p) => p.playerId === playerId);
  assert.equal(archiveOf(playerId).length, 60);
  assert.ok(player.connections.chesscom.historyToppedUpAt, 'marked finished although 60 < 200');

  requests = [];
  await syncPlatform(playerId, 'chesscom');
  // No archive list request for a history walk: just the ordinary incremental check.
  assert.ok(requests.filter((u) => u.endsWith('/games/archives')).length <= 1);
  assert.ok(archiveRequests().length <= 1);
  player = getPlayers().find((p) => p.playerId === playerId);
  assert.equal(archiveOf(playerId).length, 60);
});

test('a rate limit during the top-up is passed on (so the back-off applies); the rated import already happened', async () => {
  const user = 'limited';
  const months = chesscomMonths(user);
  stubChesscom(user, months);
  const inner = globalThis.fetch;
  let walks = 0;
  globalThis.fetch = async (url) => {
    if (/\/games\/archives$/.test(String(url)) && ++walks === 2) return { ok: false, status: 429, json: async () => ({}) };
    return inner(url);
  };
  const playerId = addPlayer({ name: 'Limited' });
  setConnection(playerId, 'chesscom', { username: user, lastGameAt: null, lastSyncedAt: null });
  await assert.rejects(() => syncPlatform(playerId, 'chesscom'), (e) => e.status === 429);

  const player = getPlayers().find((p) => p.playerId === playerId);
  assert.equal(player.importedGameIds.length, 50);
  assert.ok(!player.connections.chesscom.historyToppedUpAt, 'not finished, so the next sync tries again');
});
