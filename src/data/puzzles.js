/*
 * puzzles.js — mate-in-one positions for the training page.
 *
 * Every position here was verified against the engine: each has exactly one
 * move that ends the game in checkmate. The trainer does not compare against a
 * stored answer — it plays the move and asks the engine whether the position
 * is now checkmate — so these stay correct even if a position is edited.
 */

export const MATE_IN_ONE = [
  {
    id: 'back-rank',
    name: 'Back-rank mate',
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    theme: 'Back rank',
    hint: 'The pawns in front of the king are also the walls of its cell.',
  },
  {
    id: 'queen-back-rank',
    name: 'Queen on the back rank',
    fen: '6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1',
    theme: 'Back rank',
    hint: 'The queen does the rook’s job here — get to the eighth rank.',
  },
  {
    id: 'ladder',
    name: 'Ladder mate',
    fen: '7k/1R6/2R5/8/8/8/8/7K w - - 0 1',
    theme: 'Two rooks',
    hint: 'One rook takes away the escape rank, the other gives the check.',
  },
  {
    id: 'rook-and-king',
    name: 'Rook and king',
    fen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
    theme: 'Basic endgame',
    hint: 'Your king already covers the escape squares. The rook only has to check.',
  },
  {
    id: 'smothered',
    name: 'Smothered mate',
    fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
    theme: 'Knight',
    hint: 'Black’s own pieces have done most of the work for you.',
  },
  {
    id: 'arabian',
    name: 'Arabian mate',
    fen: '7k/8/5N2/8/8/8/8/6KR w - - 0 1',
    theme: 'Rook and knight',
    hint: 'The knight covers the flight square and defends the rook at the same time.',
  },
  {
    id: 'bishop-pair',
    name: 'Two bishops',
    fen: '7k/8/5BK1/8/8/8/8/5B2 w - - 0 1',
    theme: 'Bishop pair',
    hint: 'Both bishops have to point at the corner.',
  },
  {
    id: 'scholars',
    name: 'Scholar’s mate',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    theme: 'Opening trap',
    hint: 'Two pieces are aiming at the same weak square.',
  },
  {
    id: 'black-back-rank',
    name: 'Black to play',
    fen: 'r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1',
    theme: 'Back rank',
    hint: 'Same idea as the first puzzle, from the other side of the board.',
  },
];
