/*
 * playerRows.js — the pure half of the roster store: how a player maps to a
 * `players` row and back, and the store updates that don't touch the
 * network. Kept apart from rosterStore.js so Node tests can import it.
 */

import { updateRating, DEFAULT_RATING } from '../ratings/glicko2.js';

export function fromRow(row) {
  return {
    playerId: row.player_id,
    userId: row.user_id || null,
    name: row.name,
    grade: row.grade || '',
    joined: row.joined || '',
    boardRole: row.board_role || '',
    commitment: row.commitment || 'Casual',
    experience: row.experience || '',
    guardianEmail: row.guardian_email || '',
    // null = not recorded, which privacy.js treats as "no release".
    mediaRelease: row.media_release ?? null,
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

export function toRow(player) {
  return {
    player_id: player.playerId,
    user_id: player.userId || null,
    name: player.name,
    grade: player.grade,
    joined: player.joined || null,
    board_role: player.boardRole,
    commitment: player.commitment,
    experience: player.experience || null,
    guardian_email: player.guardianEmail || null,
    media_release: player.mediaRelease ?? null,
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

/** Which database column each field of a player lives in. */
const COLUMN_FOR = {
  playerId: 'player_id',
  userId: 'user_id',
  name: 'name',
  grade: 'grade',
  joined: 'joined',
  boardRole: 'board_role',
  commitment: 'commitment',
  experience: 'experience',
  guardianEmail: 'guardian_email',
  mediaRelease: 'media_release',
  ratings: 'ratings',
  preferredOpenings: 'preferred_openings',
  style: 'style',
  rubric: 'rubric',
  goal: 'goal',
  trainingFocus: 'training_focus',
  coachNotes: 'coach_notes',
  puzzleStats: 'puzzle_stats',
  clubRating: 'club_rating',
  ratingHistory: 'rating_history',
  assessments: 'assessments',
  attendance: 'attendance',
  connections: 'connections',
  importedGameIds: 'imported_game_ids',
};

/** Only the named fields of a player, as database columns. */
export function toRowPatch(player, fields) {
  const row = toRow(player);
  const patch = {};
  for (const field of fields) {
    const column = COLUMN_FOR[field];
    if (column && column !== 'player_id') patch[column] = row[column];
  }
  return patch;
}

/*
 * Apply one Realtime change to the store. The event carries the whole new
 * row, so there is no need to download the entire table again (which every
 * open tab used to do on every change from any client).
 */
export function applyRealtimeChange(players, payload) {
  const row = payload?.new && Object.keys(payload.new).length ? payload.new : null;
  const goneId = payload?.eventType === 'DELETE' ? payload.old?.player_id : null;
  if (goneId) return players.filter((p) => p.playerId !== goneId);
  if (!row?.player_id) return players;
  if (row.deleted_at) return players.filter((p) => p.playerId !== row.player_id);
  const next = fromRow(row);
  const found = players.some((p) => p.playerId === next.playerId);
  const merged = found ? players.map((p) => (p.playerId === next.playerId ? next : p)) : [...players, next];
  return merged.sort((a, b) => a.playerId.localeCompare(b.playerId));
}

/**
 * Apply one puzzle outcome to puzzle stats in a single write. Puzzle stats
 * are `puzzle_stats` on the row:
 *   solvedIds  puzzles solved at least once
 *   attempts   rated or unrated tries that were written here
 *   lastPlayed
 *   rating     a Glicko-2 puzzle rating, kept apart from the club rating
 *              (puzzleRating.js decides when an outcome may move it)
 *
 * `rated` is null for "don't touch the rating", or
 * { opponentRating, opponentRd, score }.
 */
export function applyPuzzleOutcome(stats, { puzzleId, solved, rated = null, at = new Date().toISOString() }) {
  const base = stats || { solvedIds: [], attempts: 0, lastPlayed: null };
  const solvedIds = base.solvedIds || [];
  const next = {
    ...base,
    solvedIds: solved && !solvedIds.includes(puzzleId) ? [...solvedIds, puzzleId] : solvedIds,
    attempts: (base.attempts || 0) + 1,
    lastPlayed: at,
  };
  if (rated) {
    const current = base.rating || { ...DEFAULT_RATING, count: 0 };
    const updatedRating = updateRating(current, [rated]);
    next.rating = { ...updatedRating, count: (current.count || 0) + 1 };
  }
  return next;
}

