/*
 * trackedScores.js — a player's tracked skill scores, worked out from their
 * analysed games in the order the games were PLAYED.
 *
 * Why this exists. The tracked score is a running average: each step blends a
 * snapshot of "all games so far" into the score before it, so what comes
 * early in the sequence leaves a mark on the final number. That is harmless
 * while games are analysed in the order they were played. It stops being
 * harmless once the queue works newest-first: the same 200 games analysed
 * oldest-first and newest-first land on different scores (14 points apart in
 * the worst case tested), purely because of the order the engine got to them.
 *
 * So the score is no longer carried forward from whatever was stored. It is
 * rebuilt from the games every time, oldest to newest, which makes it the same
 * answer whichever game the engine happened to finish last, and the same
 * answer in every browser that does the sum.
 *
 * Pure: no React, no Supabase.
 */

import { aggregateRaw, rubricScores, updatePlayerScores } from './scoring.js';

const toReport = (a) => ({
  raw: a.raw || {},
  movesPlayed: a.movesPlayed ?? 0,
  movesCounted: a.movesCounted ?? 0,
  motifCounts: a.motifCounts || {},
});

/** Oldest first by game date; ties (and undated games) fall back to game id so the order is always the same. */
export function inPlayedOrder(analyses = []) {
  return [...(analyses || [])].sort(
    (a, b) =>
      String(a.playedAt ?? '').localeCompare(String(b.playedAt ?? ''))
      || String(a.gameId ?? '').localeCompare(String(b.gameId ?? '')),
  );
}

/**
 * Replay a player's analysed games oldest to newest.
 *
 * @param analyses  one entry per analysed game: { gameId, playedAt, raw, movesPlayed, movesCounted, motifCounts }
 * @returns { tracked, scores } — `tracked` is updatePlayerScores' result after the
 *   last game; `scores` is rubricScores over every game (what `n` is read from).
 */
export function trackedScoresByDate(analyses = []) {
  const ordered = inPlayedOrder(analyses).map((a) => ({ ...a, report: toReport(a) }));
  let tracked = null;
  let scores = null;
  const seen = [];
  for (const entry of ordered) {
    seen.push(entry.report);
    scores = rubricScores(aggregateRaw(seen));
    tracked = updatePlayerScores(tracked, scores);
  }
  return { tracked, scores, reports: seen, ordered };
}
