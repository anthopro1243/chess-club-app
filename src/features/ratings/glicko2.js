/*
 * glicko2.js — the actual Glicko-2 rating system (Mark Glickman,
 * http://www.glicko.net/glicko/glicko2.pdf), the algorithm Chess.com's
 * ratings are built on. Implemented from the published spec, not
 * approximated: every step below (steps 1-8 in the paper) has a matching
 * function or block here.
 *
 * We apply it the way Lichess and Chess.com do for "live" ratings: one
 * rating period per result, rather than batching a period's worth of games
 * before updating. That's a standard, documented adaptation of the same
 * method, not a different one.
 *
 * A rating is { rating, rd, volatility }. New players start at the paper's
 * own defaults: rating 1500, rd 350, volatility 0.06.
 */

const SCALE = 173.7178;
const TAU = 0.5; // system constant — constrains how fast volatility can change
const EPSILON = 0.000001;

export const DEFAULT_RATING = { rating: 1500, rd: 350, volatility: 0.06 };

// Glicko-2 internal scale (μ, φ) rather than the public (rating, RD) scale.
function toInternal({ rating, rd }) {
  return { mu: (rating - 1500) / SCALE, phi: rd / SCALE };
}

function toPublic({ mu, phi }) {
  return { rating: mu * SCALE + 1500, rd: phi * SCALE };
}

function g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu, muJ, phiJ) {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Update one player's rating from a batch of results in a single period.
 * `player` is { rating, rd, volatility }. `results` is a list of
 * { opponentRating, opponentRd, score } — score is 1 (win), 0.5 (draw), or
 * 0 (loss), from `player`'s point of view.
 *
 * With no results, only step 6 applies: RD widens to reflect a period of
 * no data (we don't currently call this path — see ratingStore.js — but
 * it's here because it's part of the actual algorithm, not an extra).
 */
export function updateRating(player, results) {
  const { mu, phi } = toInternal(player);
  const sigma = player.volatility ?? DEFAULT_RATING.volatility;

  if (!results.length) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { ...toPublic({ mu, phi: phiStar }), volatility: sigma };
  }

  const terms = results.map(({ opponentRating, opponentRd, score }) => {
    const oj = toInternal({ rating: opponentRating, rd: opponentRd });
    const gj = g(oj.phi);
    const Ej = E(mu, oj.mu, oj.phi);
    return { gj, Ej, score };
  });

  // Step 3: estimated variance of the rating from this period's outcomes.
  const vInv = terms.reduce((sum, t) => sum + t.gj * t.gj * t.Ej * (1 - t.Ej), 0);
  const v = 1 / vInv;

  // Step 4: Δ, the estimated improvement in rating.
  const delta = v * terms.reduce((sum, t) => sum + t.gj * (t.score - t.Ej), 0);

  // Step 5: solve for the new volatility via the paper's Illinois algorithm.
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) ** 2;
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k += 1;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  // Step 6-7: new RD and rating.
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * terms.reduce((sum, t) => sum + t.gj * (t.score - t.Ej), 0);

  return { ...toPublic({ mu: muPrime, phi: phiPrime }), volatility: newSigma };
}

/** Convenience for the common case: one result at a time. */
export function applyResult(player, opponentRating, opponentRd, score) {
  return updateRating(player, [{ opponentRating, opponentRd, score }]);
}
