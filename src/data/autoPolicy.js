/*
 * autoPolicy.js — the rules for what the app does by itself.
 *
 * Background work replaces chores (sync on open, analyse without a button,
 * retry a failure later), and each of those needs a limit, or it turns into
 * a hammered API, a hot laptop or a spinner that never ends. The limits live
 * here as pure functions, so they are tested rather than tuned by feel inside
 * a React effect.
 */

/* ── retrying failed analyses ───────────────────────────────────────────── */

/** First retry after 2 minutes, then 8, then 32; never more than 2 hours. */
export const RETRY_BASE_MS = 2 * 60 * 1000;
export const RETRY_MAX_MS = 2 * 60 * 60 * 1000;

/** How long to wait before retrying something that has failed `attempts` times. */
export function backoffMs(attempts, { baseMs = RETRY_BASE_MS, maxMs = RETRY_MAX_MS, factor = 4 } = {}) {
  const n = Number(attempts);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(maxMs, baseMs * factor ** (n - 1));
}

/**
 * Whether a pending queue row may be claimed now. A row that has never been
 * tried is always ready; one that failed waits out its backoff from the time
 * it was last touched. Rows with no timestamp are ready: refusing them would
 * park them forever.
 */
export function readyForRetry(row, now = Date.now()) {
  const attempts = row?.analysis_attempts ?? 0;
  if (!attempts) return true;
  const last = Date.parse(row?.analysis_updated_at ?? '');
  if (!Number.isFinite(last)) return true;
  return now - last >= backoffMs(attempts);
}

/**
 * Put the viewer's own games first, keeping the original (newest-first)
 * order inside each group. A player who just finished a game should see
 * their analysis before the club backlog, not after it.
 */
export function viewerFirst(rows = [], viewerId = null) {
  if (!viewerId) return [...(rows || [])];
  const mine = [];
  const rest = [];
  for (const row of rows || []) {
    const white = row?.white_player_id ?? row?.whitePlayerId;
    const black = row?.black_player_id ?? row?.blackPlayerId;
    (white === viewerId || black === viewerId ? mine : rest).push(row);
  }
  return [...mine, ...rest];
}

/* ── syncing linked accounts on open ────────────────────────────────────── */

/** Do not sync a linked account more than once every 30 minutes. */
export const AUTO_SYNC_MIN_INTERVAL_MS = 30 * 60 * 1000;

/**
 * The linked platforms worth syncing now: those with a username whose last
 * sync is older than the minimum interval (or has never happened).
 */
export function platformsDueForSync(connections = {}, now = Date.now(), minIntervalMs = AUTO_SYNC_MIN_INTERVAL_MS) {
  const due = [];
  for (const [platform, connection] of Object.entries(connections || {})) {
    if (platform !== 'chesscom' && platform !== 'lichess') continue;
    if (!connection?.username) continue;
    const last = Date.parse(connection.lastSyncedAt ?? '');
    if (Number.isFinite(last) && now - last < minIntervalMs) continue;
    due.push(platform);
  }
  return due;
}

/* ── timeouts ───────────────────────────────────────────────────────────── */

export class TimeoutError extends Error {
  constructor(label, ms) {
    super(`${label} took longer than ${Math.round(ms / 1000)}s and was stopped.`);
    this.name = 'TimeoutError';
  }
}

/**
 * Race a promise against a timer. `onTimeout` runs when time is up, so the
 * caller can abort the real work instead of leaving it running unseen.
 */
export function withTimeout(promise, ms, { label = 'That', onTimeout } = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        reject(new TimeoutError(label, ms));
      }
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run `fn` up to `attempts` times, waiting `backoff(n)` between tries. The
 * last error is rethrown. `sleep` is injectable so tests do not wait.
 */
export async function retry(fn, {
  attempts = 3,
  backoff = (n) => 1000 * 2 ** (n - 1),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  shouldRetry = () => true,
} = {}) {
  let lastError;
  for (let n = 1; n <= attempts; n += 1) {
    try {
      return await fn(n);
    } catch (error) {
      lastError = error;
      if (n === attempts || !shouldRetry(error)) break;
      await sleep(backoff(n));
    }
  }
  throw lastError;
}
