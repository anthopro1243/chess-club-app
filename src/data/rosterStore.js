/*
 * rosterStore.js — the roster, made real.
 *
 * roster.js still holds the sample players and the rubric math; this module
 * seeds a persistent store from that sample the first time the app runs in a
 * browser, then owns all reads and writes from there on. Everything a club
 * does with the roster — add a player, edit their rubric, log a solved
 * puzzle — goes through the functions here so every page sees the same data.
 */

import { createStore, useStore } from './store.js';
import { PLAYERS as SAMPLE_PLAYERS } from './roster.js';

const store = createStore('cc-roster-v1', SAMPLE_PLAYERS);

export function usePlayers() {
  return useStore(store);
}

export function getPlayers() {
  return store.get();
}

function nextPlayerId(players) {
  const numbers = players
    .map((p) => Number(String(p.playerId || '').replace(/\D/g, '')))
    .filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `CC-${String(next).padStart(3, '0')}`;
}

const emptyRubric = () =>
  Object.fromEntries(['opening', 'tactics', 'positional', 'endgame', 'timeManagement', 'boardVision', 'resilience', 'notation'].map((k) => [k, 5]));

/** Add a player from a partial form object. Returns the new playerId. */
export function addPlayer(partial) {
  let createdId = null;
  store.set((players) => {
    const playerId = nextPlayerId(players);
    createdId = playerId;
    const player = {
      playerId,
      name: partial.name?.trim() || 'New player',
      grade: partial.grade?.trim() || '',
      joined: new Date().toISOString().slice(0, 10),
      boardRole: partial.boardRole?.trim() || '',
      commitment: partial.commitment || 'Casual',
      ratings: {
        uscf: partial.uscf ? Number(partial.uscf) : null,
        chesscomRapid: null,
        chesscomBlitz: null,
        lichessPuzzles: null,
      },
      preferredOpenings: [],
      style: partial.style?.trim() || '',
      rubric: emptyRubric(),
      goal: partial.goal?.trim() || '',
      trainingFocus: '',
      coachNotes: '',
      puzzleStats: { solvedIds: [], attempts: 0, lastPlayed: null },
    };
    return [...players, player];
  });
  return createdId;
}

export function updatePlayer(playerId, patch) {
  store.set((players) =>
    players.map((p) => (p.playerId === playerId ? { ...p, ...patch } : p)),
  );
}

export function updateRubric(playerId, rubricPatch) {
  store.set((players) =>
    players.map((p) =>
      p.playerId === playerId ? { ...p, rubric: { ...p.rubric, ...rubricPatch } } : p,
    ),
  );
}

export function removePlayer(playerId) {
  store.set((players) => players.filter((p) => p.playerId !== playerId));
}

/** Called when a trainee solves a puzzle — writes the result onto their row. */
export function recordPuzzleSolved(playerId, puzzleId) {
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      const stats = p.puzzleStats || { solvedIds: [], attempts: 0, lastPlayed: null };
      const solvedIds = stats.solvedIds.includes(puzzleId)
        ? stats.solvedIds
        : [...stats.solvedIds, puzzleId];
      return {
        ...p,
        puzzleStats: {
          solvedIds,
          attempts: (stats.attempts || 0) + 1,
          lastPlayed: new Date().toISOString(),
        },
      };
    }),
  );
}

export function resetRoster() {
  store.set(SAMPLE_PLAYERS);
}
