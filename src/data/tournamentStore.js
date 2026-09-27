/*
 * tournamentStore.js — club events: the event, who is in it, the pairings,
 * and the log of every manual override.
 *
 * Same five-part shape as gamesStore.js: a local store, row translation, a
 * cloud pull on sign-in, a push after every write, and hooks for pages.
 * Local by default, so a coach with no backend (or a dead school Wi-Fi) can
 * still pair a Tuesday round; mirrored to the four tables of 0019 once
 * Supabase is configured and someone is signed in.
 *
 * The rules — what round is next, what a swap does, when a board is locked —
 * live in src/tournament/eventOps.js, not here. This module only records the
 * outcome, so everything a coach can get wrong is tested without a browser.
 *
 * Writes are the coach's (0019's RLS); members read. Hiding the buttons on
 * the Events page is a courtesy, the policies are the boundary.
 */

import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';
import { seedEntrants, DEFAULT_RATING_SOURCE } from '../tournament/seeding.js';
import { normaliseTiebreakOrder } from '../tournament/tiebreaks.js';
import { pairNext, swapSeats as planSwap, lateEntryByes, isValidResult } from '../tournament/eventOps.js';
import { roundRobinRounds } from '../tournament/roundRobin.js';

const EMPTY = { tournaments: [], entrants: [], pairings: [], overrides: [] };
const store = createStore('cc-tournaments-v1', EMPTY);

// Older or hand-edited local data may lack a key; never let a page crash on it.
function state() {
  const value = store.get() || EMPTY;
  return {
    tournaments: value.tournaments || [],
    entrants: value.entrants || [],
    pairings: value.pairings || [],
    overrides: value.overrides || [],
  };
}

export function useTournamentState() {
  useStore(store);
  return state();
}

export function getTournamentState() {
  return state();
}

let cloudReady = false;
let channel = null;

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// -- row translation --------------------------------------------------------

function tournamentFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    startsOn: row.starts_on || '',
    format: row.format || 'swiss',
    timeControl: row.time_control || '',
    rounds: row.rounds,
    ratingSource: row.rating_source || DEFAULT_RATING_SOURCE,
    tiebreakOrder: normaliseTiebreakOrder(row.tiebreak_order),
    initialColour: row.initial_colour || 'w',
    pairedRounds: row.paired_rounds ?? 0,
    status: row.status || 'draft',
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

function tournamentToRow(t) {
  return {
    id: t.id,
    name: t.name,
    starts_on: t.startsOn || null,
    format: t.format,
    time_control: t.timeControl,
    rounds: t.rounds,
    rating_source: t.ratingSource,
    tiebreak_order: t.tiebreakOrder,
    initial_colour: t.initialColour,
    paired_rounds: t.pairedRounds,
    status: t.status,
    notes: t.notes || null,
  };
}

function entrantFromRow(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    playerId: row.player_id || '',
    name: row.name,
    rating: row.rating ?? null,
    ratingSource: row.rating_source,
    withdrawnFromRound: row.withdrawn_from_round ?? null,
    lateEntryRound: row.late_entry_round ?? null,
  };
}

function entrantToRow(e) {
  return {
    id: e.id,
    tournament_id: e.tournamentId,
    player_id: e.playerId || null,
    name: e.name,
    rating: e.rating,
    rating_source: e.ratingSource,
    withdrawn_from_round: e.withdrawnFromRound,
    late_entry_round: e.lateEntryRound,
  };
}

function pairingFromRow(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    round: row.round,
    board: row.board ?? null,
    white: row.white_player_id || null,
    black: row.black_player_id || null,
    result: row.result || null,
    byeType: row.bye_type || null,
    gameId: row.game_id || null,
  };
}

function pairingToRow(p) {
  return {
    id: p.id,
    tournament_id: p.tournamentId,
    round: p.round,
    board: p.board,
    white_player_id: p.white,
    black_player_id: p.black,
    result: p.result,
    bye_type: p.byeType,
    game_id: p.gameId || null,
  };
}

function overrideFromRow(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    round: row.round ?? null,
    action: row.action,
    detail: row.detail || {},
    reason: row.reason || '',
    madeByName: row.made_by_name || '',
    createdAt: row.created_at,
  };
}

// made_by is left to the database default (auth.uid()): the client cannot be
// trusted to say who it is, the session can.
function overrideToRow(o) {
  return {
    id: o.id,
    tournament_id: o.tournamentId,
    round: o.round,
    action: o.action,
    detail: o.detail,
    reason: o.reason || null,
    made_by_name: o.madeByName || null,
    created_at: o.createdAt,
  };
}

// -- cloud sync -----------------------------------------------------------

async function syncFromCloud() {
  const [t, e, p, o] = await Promise.all([
    supabase.from('tournaments').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('tournament_entrants').select('*').limit(5000),
    supabase.from('tournament_pairings').select('*').limit(10000),
    supabase.from('tournament_overrides').select('*').order('created_at', { ascending: true }).limit(5000),
  ]);
  const error = t.error || e.error || p.error || o.error;
  if (error) {
    // Until 0019 is applied the tables do not exist. That is a deployment
    // step, not something every member should see a red banner about on
    // every page, so it only goes to the console and the page stays local.
    const missing = error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '');
    if (missing) console.warn('Club events are local only: migration 0019 is not applied.', error.message);
    else reportSyncError('club events', error.message);
    return;
  }
  cloudReady = true;
  store.set({
    tournaments: t.data.map(tournamentFromRow),
    entrants: e.data.map(entrantFromRow),
    pairings: p.data.map(pairingFromRow),
    overrides: o.data.map(overrideFromRow),
  });
}

// Pairing a round writes a dozen rows, and each one fires a change event.
// One refetch after the burst is enough.
let refetchTimer = null;
function scheduleRefetch() {
  clearTimeout(refetchTimer);
  refetchTimer = setTimeout(syncFromCloud, 300);
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase.channel('tournament-changes');
  for (const table of ['tournaments', 'tournament_entrants', 'tournament_pairings', 'tournament_overrides']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefetch);
  }
  channel.subscribe();
}

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      syncFromCloud();
      subscribeRealtime();
    } else {
      cloudReady = false;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    }
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      syncFromCloud();
      subscribeRealtime();
    }
  });
}

function cloudActive() {
  return isSupabaseConfigured && cloudReady;
}

/*
 * Cloud writes run one at a time, in the order they were made. Order matters
 * here in a way it does not for the game archive: "undo pairing" deletes a
 * round's boards and the next "pair round" inserts boards with the same
 * (event, round, board) numbers. Sent in parallel, the insert can land first
 * and hit the unique constraint. A queue costs nothing at club scale.
 */
let writes = Promise.resolve();
function serial(task) {
  writes = writes.then(task).catch(() => {});
  return writes;
}

function push(table, rows, what) {
  if (!cloudActive() || !rows.length) return;
  serial(async () => {
    const { error } = await supabase.from(table).upsert(rows);
    if (error) reportSyncError(what, error.message);
  });
}

function remove(table, ids, what) {
  if (!cloudActive() || !ids.length) return;
  serial(async () => {
    const { error } = await supabase.from(table).delete().in('id', ids);
    if (error) reportSyncError(what, error.message);
  });
}

// -- local helpers ----------------------------------------------------------

function patchState(fn) {
  store.set((current) => fn({ ...EMPTY, ...(current || {}) }));
}

function findTournament(id) {
  return state().tournaments.find((t) => t.id === id) || null;
}

function saveTournament(tournament) {
  patchState((s) => ({ ...s, tournaments: s.tournaments.map((t) => (t.id === tournament.id ? tournament : t)) }));
  push('tournaments', [tournamentToRow(tournament)], 'that event');
}

function upsertPairings(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  patchState((s) => ({
    ...s,
    pairings: [...s.pairings.filter((p) => !byId.has(p.id)), ...rows],
  }));
  push('tournament_pairings', rows.map(pairingToRow), 'the pairings');
}

function removePairings(ids) {
  const gone = new Set(ids);
  patchState((s) => ({ ...s, pairings: s.pairings.filter((p) => !gone.has(p.id)) }));
  remove('tournament_pairings', ids, 'the pairings');
}

function upsertEntrants(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  patchState((s) => ({
    ...s,
    entrants: [...s.entrants.filter((e) => !byId.has(e.id)), ...rows],
  }));
  push('tournament_entrants', rows.map(entrantToRow), 'the entrants');
}

/** Append to the override log. `by` is the display name of whoever did it. */
function log(tournamentId, { round = null, action, detail = {}, reason = '', by = '' }) {
  const entry = {
    id: newId('O'),
    tournamentId,
    round,
    action,
    detail,
    reason: String(reason || '').trim(),
    madeByName: by || '',
    createdAt: new Date().toISOString(),
  };
  patchState((s) => ({ ...s, overrides: [...s.overrides, entry] }));
  push('tournament_overrides', [overrideToRow(entry)], 'the override log');
  return entry;
}

// -- events -----------------------------------------------------------------

/**
 * Create an event with its entrants. `players` are roster players; their
 * ratings are snapshotted on the event's rating source now.
 * Returns the new tournament id.
 */
export function createTournament(fields, players) {
  const format = fields.format === 'round-robin' ? 'round-robin' : 'swiss';
  const ratingSource = fields.ratingSource || DEFAULT_RATING_SOURCE;
  const seeded = seedEntrants(players, ratingSource);
  const tournament = {
    id: newId('T'),
    name: String(fields.name || '').trim() || 'Club event',
    startsOn: fields.startsOn || '',
    format,
    timeControl: fields.timeControl || 'G/30 d5',
    rounds: format === 'round-robin' ? roundRobinRounds(seeded.length) : Number(fields.rounds) || 4,
    ratingSource,
    tiebreakOrder: normaliseTiebreakOrder(fields.tiebreakOrder),
    initialColour: fields.initialColour === 'b' ? 'b' : 'w',
    pairedRounds: 0,
    status: 'draft',
    notes: fields.notes || '',
    createdAt: new Date().toISOString(),
  };
  const entrants = seeded.map((e) => ({
    id: newId('E'),
    tournamentId: tournament.id,
    playerId: e.playerId,
    name: e.name,
    rating: e.rating,
    ratingSource: e.ratingSource,
    withdrawnFromRound: null,
    lateEntryRound: null,
  }));

  patchState((s) => ({ ...s, tournaments: [tournament, ...s.tournaments], entrants: [...s.entrants, ...entrants] }));
  if (cloudActive()) {
    // Entrants reference the event, so the event row has to land first, and
    // there is no point sending them if it did not.
    serial(async () => {
      const { error } = await supabase.from('tournaments').insert(tournamentToRow(tournament));
      if (error) {
        reportSyncError('that event', error.message);
        return;
      }
      const res = await supabase.from('tournament_entrants').upsert(entrants.map(entrantToRow));
      if (res.error) reportSyncError('the entrants', res.error.message);
    });
  }
  return tournament.id;
}

/** Change settings (name, date, time control, notes; tiebreak order and rounds before round 1). */
export function updateTournament(id, patch, { by = '' } = {}) {
  const current = findTournament(id);
  if (!current) return;
  const next = { ...current, ...patch };
  if (patch.tiebreakOrder) next.tiebreakOrder = normaliseTiebreakOrder(patch.tiebreakOrder);
  saveTournament(next);
  const changed = Object.keys(patch).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(current[k]));
  if (changed.length && current.pairedRounds > 0) {
    log(id, { action: 'settings', detail: { changed }, by });
  }
}

export function deleteTournament(id) {
  patchState((s) => ({
    tournaments: s.tournaments.filter((t) => t.id !== id),
    entrants: s.entrants.filter((e) => e.tournamentId !== id),
    pairings: s.pairings.filter((p) => p.tournamentId !== id),
    overrides: s.overrides.filter((o) => o.tournamentId !== id),
  }));
  // The foreign keys cascade, so one delete clears the event's rows too.
  remove('tournaments', [id], 'deleting that event');
}

/**
 * Before round 1: make the entrant list match `players` exactly, snapshotting
 * ratings for newcomers. After round 1 use addLateEntrant/withdrawEntrant.
 */
export function setEntrants(id, players, { by = '' } = {}) {
  const t = findTournament(id);
  if (!t || t.pairedRounds > 0) return;
  const current = state().entrants.filter((e) => e.tournamentId === id);
  const wanted = new Set(players.map((p) => p.playerId));
  const have = new Set(current.map((e) => e.playerId));
  const removed = current.filter((e) => !wanted.has(e.playerId));
  const added = seedEntrants(players.filter((p) => !have.has(p.playerId)), t.ratingSource).map((e) => ({
    id: newId('E'),
    tournamentId: id,
    playerId: e.playerId,
    name: e.name,
    rating: e.rating,
    ratingSource: e.ratingSource,
    withdrawnFromRound: null,
    lateEntryRound: null,
  }));
  const gone = new Set(removed.map((e) => e.id));
  patchState((s) => ({ ...s, entrants: [...s.entrants.filter((e) => !gone.has(e.id)), ...added] }));
  remove('tournament_entrants', [...gone], 'the entrants');
  push('tournament_entrants', added.map(entrantToRow), 'the entrants');
  // Requested byes belong to the entrant; drop the ones of anyone removed.
  const orphanByes = state().pairings.filter((p) => p.tournamentId === id && removed.some((e) => e.playerId === p.white));
  if (orphanByes.length) removePairings(orphanByes.map((p) => p.id));
  if (t.format === 'round-robin') {
    const count = current.length - removed.length + added.length;
    saveTournament({ ...t, rounds: Math.max(1, roundRobinRounds(count)) });
  }
  if (removed.length || added.length) {
    log(id, {
      action: 'entrants',
      detail: { added: added.map((e) => e.name), removed: removed.map((e) => e.name) },
      by,
    });
  }
}

/**
 * Add a player after round 1 has been paired. They are paired from `round`
 * on; with `halfByes`, each round they missed scores ½ (US Chess leaves this
 * to the director, so it is the coach's tick box, off by default).
 */
export function addLateEntrant(id, player, { round, halfByes = false, reason = '', by = '' }) {
  const t = findTournament(id);
  if (!t || t.format === 'round-robin') return { ok: false, message: 'A round robin has a fixed field.' };
  if (state().entrants.some((e) => e.tournamentId === id && e.playerId === player.playerId)) {
    return { ok: false, message: `${player.name} is already entered.` };
  }
  const [seed] = seedEntrants([player], t.ratingSource);
  const entrant = {
    id: newId('E'),
    tournamentId: id,
    playerId: seed.playerId,
    name: seed.name,
    rating: seed.rating,
    ratingSource: seed.ratingSource,
    withdrawnFromRound: null,
    lateEntryRound: round > 1 ? round : null,
  };
  upsertEntrants([entrant]);
  if (halfByes && round > 1) {
    upsertPairings(
      lateEntryByes(entrant.playerId, round).map((row) => ({ ...row, id: newId('P'), tournamentId: id, gameId: null })),
    );
  }
  log(id, { round, action: 'late-entry', detail: { player: entrant.name, fromRound: round, halfByes }, reason, by });
  return { ok: true };
}

/** Stop pairing a player from `fromRound` on. Their results so far stand. */
export function withdrawEntrant(id, playerId, { fromRound, reason = '', by = '' }) {
  const entrant = state().entrants.find((e) => e.tournamentId === id && e.playerId === playerId);
  if (!entrant) return;
  upsertEntrants([{ ...entrant, withdrawnFromRound: fromRound }]);
  // A bye they asked for in a round they will no longer play means nothing.
  const futureByes = state().pairings.filter(
    (p) => p.tournamentId === id && p.white === playerId && p.byeType && p.byeType !== 'full' && p.round >= fromRound,
  );
  if (futureByes.length) removePairings(futureByes.map((p) => p.id));
  log(id, { round: fromRound, action: 'withdraw', detail: { player: entrant.name, fromRound }, reason, by });
}

export function reinstateEntrant(id, playerId, { reason = '', by = '' } = {}) {
  const entrant = state().entrants.find((e) => e.tournamentId === id && e.playerId === playerId);
  if (!entrant) return;
  upsertEntrants([{ ...entrant, withdrawnFromRound: null }]);
  log(id, { action: 'reinstate', detail: { player: entrant.name }, reason, by });
}

/** Record a requested bye (half or zero) for a round that is not paired yet. */
export function requestBye(id, playerId, { round, type = 'half', reason = '', by = '' }) {
  const t = findTournament(id);
  if (!t || round <= t.pairedRounds) return { ok: false, message: `Round ${round} is already paired.` };
  if (!['half', 'zero'].includes(type)) return { ok: false, message: 'Only half- and zero-point byes can be requested.' };
  const existing = state().pairings.find((p) => p.tournamentId === id && p.round === round && p.white === playerId && p.byeType);
  if (existing) return { ok: false, message: 'That player already has a bye that round.' };
  const entrant = state().entrants.find((e) => e.tournamentId === id && e.playerId === playerId);
  upsertPairings([{ id: newId('P'), tournamentId: id, round, board: null, white: playerId, black: null, result: null, byeType: type, gameId: null }]);
  log(id, { round, action: 'bye', detail: { player: entrant?.name || playerId, type }, reason, by });
  return { ok: true };
}

export function cancelBye(id, pairingId, { reason = '', by = '' } = {}) {
  const row = state().pairings.find((p) => p.id === pairingId);
  const t = findTournament(id);
  if (!row || !row.byeType || !t || row.round <= t.pairedRounds) return;
  removePairings([pairingId]);
  const entrant = state().entrants.find((e) => e.tournamentId === id && e.playerId === row.white);
  log(id, { round: row.round, action: 'cancel-bye', detail: { player: entrant?.name || row.white, type: row.byeType }, reason, by });
}

// -- rounds -------------------------------------------------------------------

/** Pair the next round. Returns { ok, round, warnings } or { ok: false, message }. */
export function pairNextRound(id) {
  const s = state();
  const tournament = s.tournaments.find((t) => t.id === id);
  if (!tournament) return { ok: false, message: 'That event no longer exists.' };
  const result = pairNext({
    tournament,
    entrants: s.entrants.filter((e) => e.tournamentId === id),
    pairings: s.pairings.filter((p) => p.tournamentId === id),
  });
  if (!result.ok) return result;

  const rows = result.rows.map((row) => ({ ...row, id: newId('P'), tournamentId: id, gameId: null }));
  const next = { ...tournament, pairedRounds: result.round, status: 'running' };
  patchState((st) => ({
    ...st,
    tournaments: st.tournaments.map((t) => (t.id === id ? next : t)),
    pairings: [...st.pairings, ...rows],
  }));
  if (cloudActive()) {
    // Rows first, then the round counter, so a reader never sees round N
    // announced with no boards in it.
    serial(async () => {
      const { error } = await supabase.from('tournament_pairings').upsert(rows.map(pairingToRow));
      if (error) {
        reportSyncError('the pairings', error.message);
        return;
      }
      const res = await supabase.from('tournaments').upsert([tournamentToRow(next)]);
      if (res.error) reportSyncError('that event', res.error.message);
    });
  }
  return { ok: true, round: result.round, warnings: result.warnings || [] };
}

/**
 * Take back the last round's pairing (only while no board has a result):
 * the fix for "paired before the late arrival walked in". Requested byes
 * for that round stay requested.
 */
export function unpairLastRound(id, { reason = '', by = '' } = {}) {
  const t = findTournament(id);
  if (!t || t.pairedRounds < 1) return { ok: false, message: 'Nothing is paired yet.' };
  const round = t.pairedRounds;
  const rows = state().pairings.filter((p) => p.tournamentId === id && p.round === round);
  if (rows.some((p) => p.result)) return { ok: false, message: `Round ${round} already has results. Clear them first.` };
  const generated = rows.filter((p) => !p.byeType || p.byeType === 'full' || t.format === 'round-robin');
  removePairings(generated.map((p) => p.id));
  saveTournament({ ...t, pairedRounds: round - 1, status: round - 1 ? 'running' : 'draft' });
  log(id, { round, action: 'unpair', detail: { boards: generated.filter((p) => !p.byeType).length }, reason, by });
  return { ok: true };
}

/** The two-tap swap. `a` and `b` are { pairingId, side }. */
export function swapSeats(id, a, b, { reason = '', by = '', nameOf = (x) => x } = {}) {
  const pairings = state().pairings.filter((p) => p.tournamentId === id);
  const plan = planSwap(pairings, a, b);
  if (!plan.ok) return plan;
  upsertPairings(plan.rows);
  const named = (side) => ({ ...plan.detail[side], player: nameOf(plan.detail[side].player) });
  log(id, { round: plan.detail.round, action: 'swap', detail: { a: named('a'), b: named('b') }, reason, by });
  return { ok: true, round: plan.detail.round };
}

/**
 * Enter or correct a result. A first entry is routine; changing a result that
 * was already there is an override and goes in the log.
 */
export function setResult(pairingId, result, { by = '', reason = '' } = {}) {
  if (!isValidResult(result)) return { ok: false, message: 'Not a result code.' };
  const row = state().pairings.find((p) => p.id === pairingId);
  if (!row || row.byeType) return { ok: false, message: 'Byes have no result to enter.' };
  const next = result || null;
  if (row.result === next) return { ok: true };
  upsertPairings([{ ...row, result: next }]);
  if (row.result) {
    log(row.tournamentId, {
      round: row.round,
      action: 'result-change',
      detail: { board: row.board, from: row.result, to: next },
      reason,
      by,
    });
  }
  return { ok: true };
}

/** Link (or unlink with null) the archived game played on a board. */
export function linkGame(pairingId, gameId) {
  const row = state().pairings.find((p) => p.id === pairingId);
  if (!row || row.byeType) return;
  upsertPairings([{ ...row, gameId: gameId || null }]);
}

export function finishTournament(id) {
  const t = findTournament(id);
  if (t) saveTournament({ ...t, status: 'finished' });
}

export function reopenTournament(id) {
  const t = findTournament(id);
  if (t) saveTournament({ ...t, status: t.pairedRounds ? 'running' : 'draft' });
}

/**
 * The time control of the event a practice clock should default to (F084):
 * the soonest event that is not finished, else the most recent one.
 */
export function currentEventTimeControl() {
  const events = state().tournaments;
  if (!events.length) return null;
  const open = events
    .filter((t) => t.status !== 'finished')
    .sort((a, b) => String(a.startsOn || '9999').localeCompare(String(b.startsOn || '9999')));
  const pick = open[0] || [...events].sort((a, b) => String(b.startsOn).localeCompare(String(a.startsOn)))[0];
  return pick?.timeControl || null;
}
