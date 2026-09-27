/*
 * reportCard.js — the one-page player report card (research F011).
 *
 * For the coach: everything about one member on a single page that opens in
 * two taps from the Roster page and prints cleanly for a parent meeting.
 * Pure, so every rule about what goes on it is tested without a browser.
 *
 * What it shows, and where each piece comes from:
 *   - ratings: US Chess from the roster row, the coach's club rating, and the
 *     member's Chess.com / Lichess ratings (platform_ratings), each labelled
 *     with its pool, never mixed into one number;
 *   - activity: games and puzzles in the last 30 days, and the last day the
 *     member did anything;
 *   - skills: the same view the member's home page uses (buildPlayerHome),
 *     so the card never shows a score the member's own page would hide;
 *   - tactics missed most often in their games (motif counts);
 *   - goal, training focus and the coach's note.
 *
 * Retired members get no card, like every other member view.
 */

import { buildPlayerHome, motifTotals } from './playerHome.js';
import { MOTIF_LABELS } from './clubWeaknesses.js';

export const ACTIVITY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const PLATFORM_LABEL = { chesscom: 'Chess.com', lichess: 'Lichess' };
const TIME_CONTROL_ORDER = ['rapid', 'blitz', 'classical', 'bullet', 'daily'];

const toMs = (value) => {
  if (value == null || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const capitalise = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Ratings, each with the pool it comes from. Unknown pools are left out. */
export function ratingLines(player, platformRatings = [], overrides = []) {
  const lines = [];
  const uscf = Number(player?.ratings?.uscf);
  if (Number.isFinite(uscf) && uscf > 0) lines.push({ key: 'uscf', label: 'US Chess', rating: uscf });
  const coach = overrides.find((o) => o?.playerId === player?.playerId)?.clubRating;
  if (Number.isFinite(Number(coach)) && coach != null) lines.push({ key: 'coach', label: 'Club rating (coach)', rating: Number(coach) });
  const mine = platformRatings
    .filter((r) => r?.playerId === player?.playerId && PLATFORM_LABEL[r.platform] && TIME_CONTROL_ORDER.includes(r.timeControl))
    .filter((r) => Number.isFinite(Number(r.rating)))
    .sort(
      (a, b) =>
        a.platform.localeCompare(b.platform) ||
        TIME_CONTROL_ORDER.indexOf(a.timeControl) - TIME_CONTROL_ORDER.indexOf(b.timeControl),
    );
  for (const r of mine) {
    lines.push({
      key: `${r.platform}:${r.timeControl}`,
      label: `${PLATFORM_LABEL[r.platform]} ${r.timeControl}`,
      rating: Number(r.rating),
      provisional: !!r.provisional,
    });
  }
  return lines;
}

/** Games and puzzles in the last ACTIVITY_DAYS, and the last active day. */
export function activityFor(playerId, { games = [], attempts = [], now = Date.now() } = {}) {
  const since = now - ACTIVITY_DAYS * DAY_MS;
  const gameTimes = games
    .filter((g) => g && (g.whitePlayerId === playerId || g.blackPlayerId === playerId) && !g.deletedAt)
    .map((g) => toMs(g.playedAt))
    .filter((t) => t != null && t <= now);
  const attemptRows = attempts.filter((a) => a && a.playerId === playerId);
  const attemptTimes = attemptRows.map((a) => toMs(a.attemptedAt)).filter((t) => t != null && t <= now);
  const recentAttempts = attemptRows.filter((a) => (toMs(a.attemptedAt) ?? -Infinity) >= since);
  const last = Math.max(-Infinity, ...gameTimes, ...attemptTimes);
  return {
    days: ACTIVITY_DAYS,
    games: gameTimes.filter((t) => t >= since).length,
    gamesTotal: gameTimes.length,
    puzzles: recentAttempts.length,
    puzzlesSolved: recentAttempts.filter((a) => a.correct).length,
    lastActiveAt: Number.isFinite(last) ? new Date(last).toISOString() : null,
    daysSinceActive: Number.isFinite(last) ? Math.floor((now - last) / DAY_MS) : null,
  };
}

/** The most-missed tactics in this member's own analysed games, most first. */
export function missedTactics(analyses = [], playerId, limit = 3) {
  const totals = motifTotals(analyses.filter((a) => a && a.playerId === playerId));
  return Object.entries(totals)
    .filter(([motif]) => MOTIF_LABELS[motif])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([motif, count]) => ({ motif, label: MOTIF_LABELS[motif], count }));
}

/**
 * The whole card, or `{ available: false, reason }`.
 * `viewer` must be staff: the card is the coach's view of a member.
 */
export function buildReportCard({
  player,
  viewer,
  platformRatings = [],
  overrides = [],
  games = [],
  attempts = [],
  skillRows = [],
  analyses = [],
  coachNote = '',
  now = Date.now(),
} = {}) {
  if (!player?.playerId) return { available: false, reason: 'no-player' };
  if (player.deletedAt) return { available: false, reason: 'retired' };
  if (!viewer || !['coach', 'admin'].includes(viewer.role)) return { available: false, reason: 'not-allowed' };

  const home = buildPlayerHome({ player, viewer, skillRows, analyses, games, now });
  if (!home.available) return { available: false, reason: home.reason };

  const measured = home.categories.filter((c) => c.showNumber);
  const weakest = [...measured].sort((a, b) => (a.level ?? 0) - (b.level ?? 0)).slice(0, 3);

  return {
    available: true,
    playerId: player.playerId,
    name: player.name || player.playerId,
    grade: player.grade || '',
    commitment: player.commitment || '',
    joined: player.joined || '',
    ratings: ratingLines(player, platformRatings, overrides),
    activity: activityFor(player.playerId, { games, attempts, now }),
    priority: home.priority,
    trend: home.trend,
    categories: home.categories,
    weakest,
    analysedCount: home.analysedCount,
    missedTactics: missedTactics(analyses, player.playerId),
    goal: String(player.goal || '').trim(),
    trainingFocus: String(player.trainingFocus || '').trim(),
    coachNote: String(coachNote || '').trim(),
    generatedAt: new Date(now).toISOString(),
    // One sentence for the top of the card, in plain words.
    headline: headlineFor({ activity: activityFor(player.playerId, { games, attempts, now }), priority: home.priority }),
  };
}

function headlineFor({ activity, priority }) {
  const parts = [];
  if (activity.daysSinceActive == null) parts.push('No games or puzzles recorded yet.');
  else if (activity.daysSinceActive >= 14) parts.push(`Inactive for ${activity.daysSinceActive} days.`);
  else parts.push(`${activity.games} game${activity.games === 1 ? '' : 's'} and ${activity.puzzles} puzzle${activity.puzzles === 1 ? '' : 's'} in the last ${activity.days} days.`);
  if (priority?.label) parts.push(`Working on: ${capitalise(priority.label)}.`);
  return parts.join(' ');
}
