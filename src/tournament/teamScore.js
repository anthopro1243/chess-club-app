/*
 * teamScore.js — "top N scores count" team scoring (research F081).
 *
 * The usual US Chess scholastic method: a school's team score is the sum of
 * its N best individual scores (N = 4, or 3 in some sections). Dallas ISD
 * hasn't published its format, so N is a setting, and the coach can model the
 * other possibility (team-vs-team with board order) with boardOrder.js.
 *
 * Only the coach's own players are known for certain; rival schools' scores
 * are optional numbers the coach types in from the wall chart. Nothing here
 * guesses how another school will do.
 */

const round1 = (x) => Math.round(x * 10) / 10;

/** Team score: the sum of the best `n` scores. Players with no score count as 0. */
export function teamScore(scores = [], n = 4) {
  if (!Number.isInteger(n) || n < 1) throw new Error('n must be a positive whole number');
  return round1(
    [...scores]
      .map((s) => (Number.isFinite(Number(s)) ? Number(s) : 0))
      .sort((a, b) => b - a)
      .slice(0, n)
      .reduce((sum, s) => sum + s, 0),
  );
}

/** Which players' scores are counting right now (ids of the top n; ties broken by input order). */
export function countingPlayers(players = [], n = 4) {
  return [...players]
    .map((p, index) => ({ ...p, index }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.index - b.index)
    .slice(0, n)
    .map((p) => p.id);
}

/**
 * Projection after `roundsPlayed` of `totalRounds`:
 *  - now:      the team score today
 *  - ceiling:  every counting-eligible player wins every remaining game
 *  - floor:    nobody scores again
 *  - needed:   extra points the team needs to reach `target` (if given), or null
 */
export function projectTeam(players = [], { n = 4, roundsPlayed = 0, totalRounds = 0, target = null } = {}) {
  const remaining = Math.max(0, totalRounds - roundsPlayed);
  const scores = players.map((p) => p.score ?? 0);
  const now = teamScore(scores, n);
  const ceiling = teamScore(
    players.map((p) => (p.withdrawn ? p.score ?? 0 : (p.score ?? 0) + remaining)),
    n,
  );
  const needed = target == null ? null : round1(Math.max(0, Number(target) - now));
  return { now, floor: now, ceiling, remaining, needed, reachable: needed == null ? null : now + needed <= ceiling };
}

/**
 * What if these results happen in the next round? `results` maps player id to
 * 1, 0.5 or 0. Returns the new team score and which players would count.
 */
export function whatIf(players = [], results = {}, n = 4) {
  const next = players.map((p) => ({
    ...p,
    score: round1((p.score ?? 0) + (Number(results[p.id]) || 0)),
  }));
  return { score: teamScore(next.map((p) => p.score), n), counting: countingPlayers(next, n), players: next };
}

/**
 * Rank the school among rival team scores the coach typed in.
 * Returns 1-based rank (ties share a rank) and how many teams are ahead.
 */
export function rankAmong(ourScore, rivals = []) {
  const ahead = rivals.filter((s) => Number(s) > ourScore).length;
  return { rank: ahead + 1, ahead, tied: rivals.filter((s) => Number(s) === ourScore).length };
}
