/*
 * Tests for the Chess.com / Lichess adapters.
 *
 * The fixtures below are trimmed copies of real API responses. What is
 * being checked is the part that is easy to get quietly wrong: the two
 * sites encode a result completely differently, and getting a colour or a
 * score backwards would corrupt a member's club rating without ever
 * throwing an error.
 */

import {
  normalizeChesscomGame,
  normalizeLichessGame,
  resultFromScore,
  countPlies,
} from './externalChess.js';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed += 1;
  } else {
    passed += 1;
  }
}

// -- result encoding ------------------------------------------------------

check('white win', resultFromScore(1, 'white'), '1-0');
check('white loss', resultFromScore(0, 'white'), '0-1');
check('black win', resultFromScore(1, 'black'), '0-1');
check('black loss', resultFromScore(0, 'black'), '1-0');
check('white draw', resultFromScore(0.5, 'white'), '1/2-1/2');
check('black draw', resultFromScore(0.5, 'black'), '1/2-1/2');

// -- Chess.com ------------------------------------------------------------

const chesscomGame = (white, black, extra = {}) => ({
  uuid: 'abc-123',
  rated: true,
  rules: 'chess',
  end_time: 1704133706,
  time_class: 'blitz',
  url: 'https://www.chess.com/game/live/1',
  pgn: '[Event "Live Chess"]\n\n1. e4 {[%clk 0:02:57.9]} e5 {[%clk 0:02:58.1]} 2. Nf3 1-0',
  white,
  black,
  ...extra,
});

{
  const g = normalizeChesscomGame(
    chesscomGame(
      { username: 'ClubKid', rating: 1200, result: 'win' },
      { username: 'Rival', rating: 1250, result: 'resigned' },
    ),
    'clubkid',
  );
  check('chess.com: our member is white', g.color, 'white');
  check('chess.com: a win scores 1', g.score, 1);
  check('chess.com: win result tag', g.result, '1-0');
  check('chess.com: opponent read off the other side', g.opponentName, 'Rival');
  check('chess.com: opponent rating', g.opponentRating, 1250);
  check('chess.com: reason comes from the loser', g.reason, 'Resignation');
  check('chess.com: id is namespaced', g.externalId, 'chesscom:abc-123');
  check('chess.com: clock annotations are not counted as moves', g.moveCount, 3);
}

{
  // The same game seen from the other side: our member lost as Black.
  const g = normalizeChesscomGame(
    chesscomGame(
      { username: 'Rival', rating: 1250, result: 'win' },
      { username: 'ClubKid', rating: 1200, result: 'checkmated' },
    ),
    'ClubKid',
  );
  check('chess.com: our member is black', g.color, 'black');
  check('chess.com: a loss scores 0', g.score, 0);
  check('chess.com: loss result tag', g.result, '1-0');
  check('chess.com: reason is our own word when we lost', g.reason, 'Checkmate');
}

{
  const g = normalizeChesscomGame(
    chesscomGame(
      { username: 'ClubKid', rating: 1200, result: 'agreed' },
      { username: 'Rival', rating: 1250, result: 'agreed' },
    ),
    'clubkid',
  );
  check('chess.com: an agreed draw scores 0.5', g.score, 0.5);
  check('chess.com: draw result tag', g.result, '1/2-1/2');
}

{
  const g = normalizeChesscomGame(
    chesscomGame(
      { username: 'ClubKid', rating: 1200, result: 'timevsinsufficient' },
      { username: 'Rival', rating: 1250, result: 'timeout' },
    ),
    'clubkid',
  );
  check('chess.com: time vs insufficient material is a draw', g.score, 0.5);
}

check(
  'chess.com: unrated games are skipped',
  normalizeChesscomGame(
    chesscomGame(
      { username: 'ClubKid', rating: 1200, result: 'win' },
      { username: 'Rival', rating: 1250, result: 'resigned' },
      { rated: false },
    ),
    'clubkid',
  ),
  null,
);

check(
  'chess.com: variants are skipped',
  normalizeChesscomGame(
    chesscomGame(
      { username: 'ClubKid', rating: 1200, result: 'win' },
      { username: 'Rival', rating: 1250, result: 'resigned' },
      { rules: 'chess960' },
    ),
    'clubkid',
  ),
  null,
);

// -- Lichess --------------------------------------------------------------

const lichessGame = (extra = {}) => ({
  id: 'xyz789',
  rated: true,
  variant: 'standard',
  perf: 'rapid',
  status: 'mate',
  createdAt: 1704133000000,
  lastMoveAt: 1704133706000,
  moves: 'e4 e5 Nf3 Nc6 Bc4',
  players: {
    white: { user: { id: 'clubkid', name: 'ClubKid' }, rating: 1600 },
    black: { user: { id: 'rival', name: 'Rival' }, rating: 1550 },
  },
  winner: 'white',
  ...extra,
});

{
  const g = normalizeLichessGame(lichessGame(), 'ClubKid');
  check('lichess: our member is white', g.color, 'white');
  check('lichess: winning colour scores 1', g.score, 1);
  check('lichess: win result tag', g.result, '1-0');
  check('lichess: opponent name', g.opponentName, 'Rival');
  check('lichess: rapid maps to rapid', g.timeClass, 'rapid');
  check('lichess: id is namespaced', g.externalId, 'lichess:xyz789');
  check('lichess: plies counted from the move list', g.moveCount, 5);
  check('lichess: reason', g.reason, 'Checkmate');
}

{
  const g = normalizeLichessGame(lichessGame({ winner: 'black' }), 'clubkid');
  check('lichess: losing as white scores 0', g.score, 0);
  check('lichess: loss result tag', g.result, '0-1');
}

{
  // A draw omits `winner` entirely rather than saying so.
  const g = normalizeLichessGame(lichessGame({ winner: undefined, status: 'draw' }), 'clubkid');
  check('lichess: a missing winner is a draw', g.score, 0.5);
  check('lichess: draw result tag', g.result, '1/2-1/2');
}

{
  const g = normalizeLichessGame(
    lichessGame({
      players: {
        white: { user: { id: 'rival', name: 'Rival' }, rating: 1550 },
        black: { user: { id: 'clubkid', name: 'ClubKid' }, rating: 1600, provisional: true },
      },
      winner: 'black',
    }),
    'clubkid',
  );
  check('lichess: our member is black', g.color, 'black');
  check('lichess: winning as black scores 1', g.score, 1);
  check('lichess: black win result tag', g.result, '0-1');
  check('lichess: provisional flag is carried through', g.opponentProvisional, false);
}

{
  const g = normalizeLichessGame(lichessGame({ perf: 'ultraBullet' }), 'clubkid');
  check('lichess: ultraBullet folds into bullet', g.timeClass, 'bullet');
}

check(
  'lichess: unrated games are skipped',
  normalizeLichessGame(lichessGame({ rated: false }), 'clubkid'),
  null,
);

check(
  'lichess: variants are skipped',
  normalizeLichessGame(lichessGame({ variant: 'atomic' }), 'clubkid'),
  null,
);

// -- PGN move counting ----------------------------------------------------

check('plies: empty pgn', countPlies(''), 0);
check('plies: headers are not moves', countPlies('[White "A"]\n[Black "B"]\n\n1. e4 e5 *'), 2);
check(
  'plies: comments and results are not moves',
  countPlies('1. e4 {good} e5 {also good} 2. Nf3 1-0'),
  3,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
