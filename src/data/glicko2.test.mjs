import { updateRating } from './glicko2.js';

// The worked example from Glickman's own Glicko-2 paper (section "Example
// application"): player at rating 1500, RD 200, volatility 0.06, playing
// three games in one period. Expected result: rating 1464.06, RD 151.52,
// volatility 0.05999.
const result = updateRating(
  { rating: 1500, rd: 200, volatility: 0.06 },
  [
    { opponentRating: 1400, opponentRd: 30, score: 1 },
    { opponentRating: 1550, opponentRd: 100, score: 0 },
    { opponentRating: 1700, opponentRd: 300, score: 0 },
  ],
);

console.log('Got:     ', result);
console.log('Expected: { rating: 1464.06, rd: 151.52, volatility: 0.05999 }');

const close = (a, b, eps) => Math.abs(a - b) < eps;
const ok =
  close(result.rating, 1464.06, 0.01) &&
  close(result.rd, 151.52, 0.01) &&
  close(result.volatility, 0.05999, 0.00001);

console.log(ok ? 'MATCH' : 'MISMATCH');
process.exit(ok ? 0 : 1);
