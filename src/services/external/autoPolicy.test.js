import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backoffMs,
  readyForRetry,
  viewerFirst,
  platformsDueForSync,
  withTimeout,
  retry,
  TimeoutError,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  AUTO_SYNC_MIN_INTERVAL_MS,
} from './autoPolicy.js';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

test('backoffMs: grows by four each time and is capped', () => {
  assert.equal(backoffMs(0), 0);
  assert.equal(backoffMs(1), RETRY_BASE_MS);
  assert.equal(backoffMs(2), RETRY_BASE_MS * 4);
  assert.equal(backoffMs(3), RETRY_BASE_MS * 16);
  assert.equal(backoffMs(50), RETRY_MAX_MS);
});

test('backoffMs: nonsense attempts mean no wait, not NaN', () => {
  assert.equal(backoffMs(undefined), 0);
  assert.equal(backoffMs('x'), 0);
  assert.equal(backoffMs(-2), 0);
});

test('readyForRetry: a game never tried is ready', () => {
  assert.equal(readyForRetry({ analysis_attempts: 0 }, NOW), true);
  assert.equal(readyForRetry({}, NOW), true);
});

test('readyForRetry: NOT ready while the backoff is still running', () => {
  const row = { analysis_attempts: 1, analysis_updated_at: ago(RETRY_BASE_MS - 1000) };
  assert.equal(readyForRetry(row, NOW), false);
});

test('readyForRetry: ready once the backoff has passed', () => {
  const row = { analysis_attempts: 2, analysis_updated_at: ago(RETRY_BASE_MS * 4 + 1) };
  assert.equal(readyForRetry(row, NOW), true);
});

test('readyForRetry: a row with no timestamp is not parked forever', () => {
  assert.equal(readyForRetry({ analysis_attempts: 2, analysis_updated_at: null }, NOW), true);
});

test('viewerFirst: own games first, order kept within each group', () => {
  const rows = [
    { id: 1, white_player_id: 'CC-009' },
    { id: 2, black_player_id: 'CC-002' },
    { id: 3, white_player_id: 'CC-010' },
    { id: 4, white_player_id: 'CC-002' },
  ];
  assert.deepEqual(viewerFirst(rows, 'CC-002').map((r) => r.id), [2, 4, 1, 3]);
});

test('viewerFirst: with no viewer the order is untouched', () => {
  const rows = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(viewerFirst(rows, null).map((r) => r.id), [1, 2]);
});

test('platformsDueForSync: never-synced and stale accounts are due', () => {
  const due = platformsDueForSync({
    chesscom: { username: 'a', lastSyncedAt: null },
    lichess: { username: 'b', lastSyncedAt: ago(AUTO_SYNC_MIN_INTERVAL_MS + 1) },
  }, NOW);
  assert.deepEqual(due, ['chesscom', 'lichess']);
});

test('platformsDueForSync: NOT due when synced recently, unlinked, or not a sync platform', () => {
  const due = platformsDueForSync({
    chesscom: { username: 'a', lastSyncedAt: ago(60 * 1000) },
    lichess: { username: '' },
    uscf: { id: '12345678' },
  }, NOW);
  assert.deepEqual(due, []);
  assert.deepEqual(platformsDueForSync(null, NOW), []);
});

test('withTimeout: resolves with the value when fast enough', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 1000), 7);
});

test('withTimeout: rejects with a readable TimeoutError and calls onTimeout', async () => {
  let aborted = false;
  const never = new Promise(() => {});
  await assert.rejects(
    withTimeout(never, 10, { label: 'Syncing Lichess', onTimeout: () => { aborted = true; } }),
    (error) => error instanceof TimeoutError && /Syncing Lichess took longer/.test(error.message),
  );
  assert.equal(aborted, true);
});

test('retry: succeeds on a later attempt, waiting between tries', async () => {
  const waits = [];
  let calls = 0;
  const value = await retry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('flaky');
    return 'ok';
  }, { attempts: 3, sleep: async (ms) => waits.push(ms) });
  assert.equal(value, 'ok');
  assert.deepEqual(waits, [1000, 2000]);
});

test('retry: rethrows the last error once attempts run out', async () => {
  let calls = 0;
  await assert.rejects(
    retry(async () => { calls += 1; throw new Error(`fail ${calls}`); }, { attempts: 2, sleep: async () => {} }),
    /fail 2/,
  );
  assert.equal(calls, 2);
});

test('retry: stops early when shouldRetry says no', async () => {
  let calls = 0;
  await assert.rejects(
    retry(async () => { calls += 1; throw new Error('no such user'); }, {
      attempts: 5,
      sleep: async () => {},
      shouldRetry: (e) => !/no such user/.test(e.message),
    }),
  );
  assert.equal(calls, 1);
});
