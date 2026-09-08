/*
 * rosterStore.js — the roster, made real, and now optionally shared.
 *
 * roster.js still holds the rubric definition; this module seeds a
 * persistent local store (empty, until people join) the first time the app
 * runs in a browser, then owns all reads and writes from there on. Every
 * exported function keeps the same signature whether or not a backend is
 * connected — add a player, edit their rubric, log a solved puzzle — so no
 * page needs to know or care which mode it's running in.
 *
 * With no Supabase project configured (see supabaseClient.js), everything
 * stays in this browser, same as before. Once one is configured, anyone can
 * sign in (email magic link, see auth.js) and claim their own player row —
 * this module fetches the shared table, mirrors every local write to it,
 * and subscribes to Realtime so every open tab, on any device, sees changes
 * as they land.
 *
 * Club ratings (see glicko2.js) live on each player row as `clubRating` —
 * updated here, not on the pages that trigger a result, so Play and
 * Training don't need to know the rating math.
 */

import { useEffect, useState } from 'react';
import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { PLAYERS as SAMPLE_PLAYERS } from './roster.js';
import { updateRating, DEFAULT_RATING } from './glicko2.js';

const store = createStore('cc-roster-v1', SAMPLE_PLAYERS);

export function usePlayers() {
  return useStore(store);
}

export function getPlayers() {
  return store.get();
}

// -- cloud sync --------------------------------------------------------

let cloudReady = false;
let channel = null;

function fromRow(row) {
  return {
    playerId: row.player_id,
    userId: row.user_id || null,
    name: row.name,
    grade: row.grade || '',
    joined: row.joined || '',
    boardRole: row.board_role || '',
    commitment: row.commitment || 'Casual',
    ratings: row.ratings || {},
    preferredOpenings: row.preferred_openings || [],
    style: row.style || '',
    rubric: row.rubric || {},
    goal: row.goal || '',
    trainingFocus: row.training_focus || '',
    coachNotes: row.coach_notes || '',
    puzzleStats: row.puzzle_stats || { solvedIds: [], attempts: 0, lastPlayed: null },
    clubRating: row.club_rating || { ...DEFAULT_RATING, count: 0 },
    ratingHistory: row.rating_history || [],
    assessments: row.assessments || [],
    attendance: row.attendance || [],
    connections: row.connections || {},
    importedGameIds: row.imported_game_ids || [],
  };
}

function toRow(player) {
  return {
    player_id: player.playerId,
    user_id: player.userId || null,
    name: player.name,
    grade: player.grade,
    joined: player.joined || null,
    board_role: player.boardRole,
    commitment: player.commitment,
    ratings: player.ratings,
    preferred_openings: player.preferredOpenings,
    style: player.style,
    rubric: player.rubric,
    goal: player.goal,
    training_focus: player.trainingFocus,
    coach_notes: player.coachNotes,
    puzzle_stats: player.puzzleStats,
    club_rating: player.clubRating,
    rating_history: player.ratingHistory || [],
    assessments: player.assessments || [],
    attendance: player.attendance || [],
    connections: player.connections || {},
    imported_game_ids: player.importedGameIds || [],
  };
}

async function syncFromCloud() {
  const { data, error } = await supabase.from('players').select('*').order('player_id');
  if (error) {
    console.error('Roster fetch from Supabase failed:', error.message);
    return;
  }
  cloudReady = true;
  store.set(data.map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('players-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
      syncFromCloud();
    })
    .subscribe();
}

function unsubscribeRealtime() {
  if (!channel) return;
  supabase.removeChannel(channel);
  channel = null;
}

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      syncFromCloud();
      subscribeRealtime();
    } else {
      cloudReady = false;
      unsubscribeRealtime();
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

async function pushToCloud(player) {
  if (!cloudActive() || !player) return;
  const { error } = await supabase.from('players').upsert(toRow(player));
  if (error) console.error('Roster sync to Supabase failed:', error.message);
}

async function deleteFromCloud(playerId) {
  if (!cloudActive()) return;
  const { error } = await supabase.from('players').delete().eq('player_id', playerId);
  if (error) console.error('Roster delete from Supabase failed:', error.message);
}

/** Whether the roster is backed by a live, shared connection right now. */
export function useCloudStatus() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    configured: isSupabaseConfigured,
    signedIn: !!session,
    email: session?.user?.email,
    userId: session?.user?.id,
  };
}

/** The signed-in user's own player row, or null if they haven't claimed one yet. */
export function useMyProfile() {
  const players = usePlayers();
  const cloud = useCloudStatus();
  if (!cloud.signedIn) return null;
  return players.find((p) => p.userId === cloud.userId) || null;
}

// -- reads and writes ----------------------------------------------------

function nextPlayerId(players) {
  const numbers = players
    .map((p) => Number(String(p.playerId || '').replace(/\D/g, '')))
    .filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `CC-${String(next).padStart(3, '0')}`;
}

const emptyRubric = () =>
  Object.fromEntries(['opening', 'tactics', 'positional', 'endgame', 'timeManagement', 'boardVision', 'resilience', 'notation'].map((k) => [k, 5]));

function blankPlayer(playerId, overrides) {
  return {
    playerId,
    userId: null,
    name: 'New player',
    grade: '',
    joined: new Date().toISOString().slice(0, 10),
    boardRole: '',
    commitment: 'Casual',
    ratings: { uscf: null, chesscomRapid: null, chesscomBlitz: null, lichessPuzzles: null },
    preferredOpenings: [],
    style: '',
    rubric: emptyRubric(),
    goal: '',
    trainingFocus: '',
    coachNotes: '',
    puzzleStats: { solvedIds: [], attempts: 0, lastPlayed: null },
    clubRating: { ...DEFAULT_RATING, count: 0 },
    ratingHistory: [],
    assessments: [],
    attendance: [],
    connections: {},
    importedGameIds: [],
    ...overrides,
  };
}

/** Add a player from a partial form object (coach-entered, no account). Returns the new playerId. */
export function addPlayer(partial) {
  let created = null;
  store.set((players) => {
    created = blankPlayer(nextPlayerId(players), {
      name: partial.name?.trim() || 'New player',
      grade: partial.grade?.trim() || '',
      boardRole: partial.boardRole?.trim() || '',
      commitment: partial.commitment || 'Casual',
      ratings: { uscf: partial.uscf ? Number(partial.uscf) : null, chesscomRapid: null, chesscomBlitz: null, lichessPuzzles: null },
      style: partial.style?.trim() || '',
      goal: partial.goal?.trim() || '',
    });
    return [...players, created];
  });
  pushToCloud(created);
  return created.playerId;
}

/**
 * Create the signed-in user's own player row. Returns the new player, or
 * the existing one if they'd already claimed a profile.
 */
export async function claimProfile({ name, grade }) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured for this deployment.');
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new Error('Sign in first.');

  const existing = store.get().find((p) => p.userId === session.user.id);
  if (existing) return existing;

  let created = null;
  store.set((players) => {
    created = blankPlayer(nextPlayerId(players), {
      userId: session.user.id,
      name: name?.trim() || session.user.email,
      grade: grade?.trim() || '',
    });
    return [...players, created];
  });
  await pushToCloud(created);
  return created;
}

export function updatePlayer(playerId, patch) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      updated = { ...p, ...patch };
      return updated;
    }),
  );
  pushToCloud(updated);
}

export function updateRubric(playerId, rubricPatch) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      updated = { ...p, rubric: { ...p.rubric, ...rubricPatch } };
      return updated;
    }),
  );
  pushToCloud(updated);
}

export function removePlayer(playerId) {
  store.set((players) => players.filter((p) => p.playerId !== playerId));
  deleteFromCloud(playerId);
}

/** Called when a trainee solves a puzzle — writes the result onto their row. */
export function recordPuzzleSolved(playerId, puzzleId) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      const stats = p.puzzleStats || { solvedIds: [], attempts: 0, lastPlayed: null };
      const solvedIds = stats.solvedIds.includes(puzzleId)
        ? stats.solvedIds
        : [...stats.solvedIds, puzzleId];
      updated = {
        ...p,
        puzzleStats: {
          solvedIds,
          attempts: (stats.attempts || 0) + 1,
          lastPlayed: new Date().toISOString(),
        },
      };
      return updated;
    }),
  );
  pushToCloud(updated);
}

export function resetRoster() {
  store.set(SAMPLE_PLAYERS);
}

// -- club rating (Glicko-2, see glicko2.js) -------------------------------

/**
 * Apply one rating result to a single player — a puzzle, or a game against
 * the computer, where there's no second player row to update in tandem.
 * `score` is 1 (win), 0.5 (draw), 0 (loss) from this player's side.
 */
export function recordRatingResult(playerId, { opponentRating, opponentRd, score, source = 'game', detail = '' }) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      const current = p.clubRating || { ...DEFAULT_RATING, count: 0 };
      const next = updateRating(current, [{ opponentRating, opponentRd, score }]);
      updated = {
        ...p,
        clubRating: { ...next, count: (current.count || 0) + 1 },
        ratingHistory: appendHistory(p, {
          rating: next.rating,
          rd: next.rd,
          change: next.rating - current.rating,
          opponentRating,
          score,
          source,
          detail,
        }),
      };
      return updated;
    }),
  );
  pushToCloud(updated);
  return updated?.clubRating ?? null;
}

/** Rating history is capped so a very active player's row can't grow without bound. */
const HISTORY_LIMIT = 500;

function appendHistory(player, entry) {
  const history = player.ratingHistory || [];
  return [...history, { at: new Date().toISOString(), ...entry }].slice(-HISTORY_LIMIT);
}

/**
 * Apply a game result to both players at once, from each other's pre-game
 * rating — the correct way to do it, rather than updating one and then
 * using its already-changed rating as the other's opponent.
 */
export function recordGameResult(whitePlayerId, blackPlayerId, whiteScore) {
  let whiteUpdated = null;
  let blackUpdated = null;
  store.set((players) => {
    const white = players.find((p) => p.playerId === whitePlayerId);
    const black = players.find((p) => p.playerId === blackPlayerId);
    if (!white || !black) return players;

    const whiteRating = white.clubRating || { ...DEFAULT_RATING, count: 0 };
    const blackRating = black.clubRating || { ...DEFAULT_RATING, count: 0 };
    const newWhite = updateRating(whiteRating, [
      { opponentRating: blackRating.rating, opponentRd: blackRating.rd, score: whiteScore },
    ]);
    const newBlack = updateRating(blackRating, [
      { opponentRating: whiteRating.rating, opponentRd: whiteRating.rd, score: 1 - whiteScore },
    ]);

    return players.map((p) => {
      if (p.playerId === whitePlayerId) {
        whiteUpdated = {
          ...p,
          clubRating: { ...newWhite, count: (whiteRating.count || 0) + 1 },
          ratingHistory: appendHistory(p, {
            rating: newWhite.rating,
            rd: newWhite.rd,
            change: newWhite.rating - whiteRating.rating,
            opponentRating: blackRating.rating,
            score: whiteScore,
            source: 'club-game',
            detail: `vs ${black.name} (White)`,
          }),
        };
        return whiteUpdated;
      }
      if (p.playerId === blackPlayerId) {
        blackUpdated = {
          ...p,
          clubRating: { ...newBlack, count: (blackRating.count || 0) + 1 },
          ratingHistory: appendHistory(p, {
            rating: newBlack.rating,
            rd: newBlack.rd,
            change: newBlack.rating - blackRating.rating,
            opponentRating: whiteRating.rating,
            score: 1 - whiteScore,
            source: 'club-game',
            detail: `vs ${white.name} (Black)`,
          }),
        };
        return blackUpdated;
      }
      return p;
    });
  });
  pushToCloud(whiteUpdated);
  pushToCloud(blackUpdated);
}

// -- linked Chess.com / Lichess accounts ----------------------------------

/*
 * A player row remembers which online accounts belong to them, and which
 * games it has already counted. That second list is what stops a second
 * sync from rating the same game twice: the check and the rating update
 * happen inside one store update, so two syncs racing each other still
 * cannot both claim the same game.
 */

const IMPORTED_ID_LIMIT = 2000;

/** Link (or relink) an online account to a player. */
export function setConnection(playerId, platform, connection) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      updated = {
        ...p,
        connections: {
          ...(p.connections || {}),
          [platform]: { ...(p.connections?.[platform] || {}), ...connection },
        },
      };
      return updated;
    }),
  );
  pushToCloud(updated);
  return updated;
}

/** Unlink an account. Games already counted stay counted. */
export function removeConnection(playerId, platform) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      const rest = { ...(p.connections || {}) };
      delete rest[platform];
      updated = { ...p, connections: rest };
      return updated;
    }),
  );
  pushToCloud(updated);
}

/** Merge freshly-read platform ratings into the row's `ratings` block. */
function mergePlatformRatings(existing, platform, ratings) {
  const prefix = platform === 'chesscom' ? 'chesscom' : 'lichess';
  const merged = { ...existing };
  for (const [key, value] of Object.entries(ratings || {})) {
    merged[`${prefix}${key[0].toUpperCase()}${key.slice(1)}`] = value ?? null;
  }
  return merged;
}

/**
 * Apply a batch of already-rated online games to one player, oldest first,
 * in a single write.
 *
 * Each game must arrive carrying the opponent rating already converted to
 * the club's scale (see externalSync.js) — the same division of labour the
 * Play and Training pages use, where the caller decides what the opponent
 * was worth and this module only does the maths.
 *
 * Returns which games were actually new, so the caller knows what to
 * archive and what to report.
 */
export function recordExternalResults(playerId, platform, games, { ratings, ...connectionPatch } = {}) {
  let updated = null;
  let accepted = [];
  let before = null;

  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;

      const already = new Set(p.importedGameIds || []);
      accepted = games.filter((g) => !already.has(g.externalId));

      const startRating = p.clubRating || { ...DEFAULT_RATING, count: 0 };
      before = startRating;

      let rating = startRating;
      const history = [];
      for (const game of accepted) {
        const next = updateRating(rating, [
          { opponentRating: game.clubOpponentRating, opponentRd: game.opponentRd, score: game.score },
        ]);
        history.push({
          at: game.playedAt,
          rating: next.rating,
          rd: next.rd,
          change: next.rating - rating.rating,
          opponentRating: game.clubOpponentRating,
          score: game.score,
          source: platform,
          detail: `${game.timeClass} vs ${game.opponentName} (${game.opponentRating ?? '?'})`,
        });
        rating = next;
      }

      const mergedHistory = [...(p.ratingHistory || []), ...history]
        .sort((a, b) => String(a.at).localeCompare(String(b.at)))
        .slice(-HISTORY_LIMIT);

      updated = {
        ...p,
        clubRating: { ...rating, count: (startRating.count || 0) + accepted.length },
        ratingHistory: mergedHistory,
        ratings: ratings ? mergePlatformRatings(p.ratings || {}, platform, ratings) : p.ratings,
        importedGameIds: [...(p.importedGameIds || []), ...accepted.map((g) => g.externalId)].slice(
          -IMPORTED_ID_LIMIT,
        ),
        connections: {
          ...(p.connections || {}),
          [platform]: {
            ...(p.connections?.[platform] || {}),
            ...connectionPatch,
            ratings: ratings ?? p.connections?.[platform]?.ratings ?? null,
          },
        },
      };
      return updated;
    }),
  );

  pushToCloud(updated);
  return {
    imported: accepted,
    ratingBefore: before?.rating ?? null,
    ratingAfter: updated?.clubRating?.rating ?? null,
  };
}

// -- coach records --------------------------------------------------------

/** Log a dated skill assessment against the 8-category rubric, keeping history. */
export function recordAssessment(playerId, rubric, notes = '') {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      const entry = { at: new Date().toISOString(), rubric: { ...rubric }, notes };
      updated = {
        ...p,
        rubric: { ...p.rubric, ...rubric }, // the current rubric is the latest assessment
        assessments: [...(p.assessments || []), entry],
      };
      return updated;
    }),
  );
  pushToCloud(updated);
}

/** Mark a player present or absent for a given club date (YYYY-MM-DD). */
export function setAttendance(playerId, date, present) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      const rest = (p.attendance || []).filter((a) => a.date !== date);
      updated = { ...p, attendance: [...rest, { date, present }].sort((a, b) => a.date.localeCompare(b.date)) };
      return updated;
    }),
  );
  pushToCloud(updated);
}
