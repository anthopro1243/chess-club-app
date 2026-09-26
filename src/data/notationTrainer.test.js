import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseSanInput,
  parseSan,
  resolveSan,
  gradeTypedSan,
  gradePlayedMove,
  canonicalSan,
  replaySans,
  buildGameDrill,
  buildSkillsDrill,
  positionAfter,
  shuffle,
  summariseDrill,
  SKILL_POSITIONS,
  SAMPLE_GAMES,
} from './notationTrainer.js';
import { NOTATION_GAME_PLIES } from './prepResults.js';
import { Chess } from '../engine/chess.js';

// Queen's Gambit Declined after 7.Bg5: knights on b8 and f6 can both reach d7.
const QGD = positionAfter(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5']);
const skill = (id) => SKILL_POSITIONS.find((p) => p.id === id);
const fenOf = (p) => p.fen || positionAfter(p.setup);

test('normaliseSanInput: the spellings real scoresheets use', () => {
  assert.equal(normaliseSanInput(' 0-0 '), 'O-O');
  assert.equal(normaliseSanInput('0-0-0+'), 'O-O-O+');
  assert.equal(normaliseSanInput('o-o'), 'O-O');
  assert.equal(normaliseSanInput('e8Q'), 'e8=Q');
  assert.equal(normaliseSanInput('exd8=q+'), 'exd8=Q+');
  assert.equal(normaliseSanInput('exd8(Q)'), 'exd8=Q');
  assert.equal(normaliseSanInput('exd6 e.p.'), 'exd6');
  assert.equal(normaliseSanInput('Nf3!?'), 'Nf3');
  assert.equal(normaliseSanInput(null), '');
});

test('normaliseSanInput: does not "fix" mixed castling or a bogus promotion square', () => {
  assert.equal(normaliseSanInput('0-O'), '0-O');
  assert.equal(normaliseSanInput('e7Q'), 'e7Q');
});

test('parseSan: pieces, pawns, castling', () => {
  assert.deepEqual(
    (({ piece, fromFile, fromRank, capture, to, check }) => ({ piece, fromFile, fromRank, capture, to, check }))(parseSan('Nbxd7+')),
    { piece: 'n', fromFile: 'b', fromRank: null, capture: true, to: 'd7', check: '+' },
  );
  assert.equal(parseSan('exd8=Q#').promotion, 'q');
  assert.equal(parseSan('exd8=Q#').fromFile, 'e');
  assert.equal(parseSan('O-O-O').castle, 'q');
  assert.equal(parseSan('Qh4e1').fromRank, '4');
});

test('parseSan: junk and lowercase pieces are malformed; "bxc3" is a pawn, not a bishop', () => {
  assert.equal(parseSan('Zz9').malformed, true);
  assert.equal(parseSan('').malformed, true);
  assert.deepEqual([parseSan('nf3').malformed, parseSan('nf3').lowercase], [true, true]);
  assert.equal(parseSan('bxc3').piece, 'p');
});

test('resolveSan: "Nd7" is ambiguous when two knights can go there', () => {
  const r = resolveSan(QGD, 'Nd7');
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.moves.map((m) => m.san).sort(), ['Nbd7', 'Nfd7']);
  assert.equal(resolveSan(QGD, 'Nbd7').status, 'ok');
  assert.equal(resolveSan(QGD, 'Ncd7').status, 'illegal');
  assert.equal(resolveSan(QGD, 'hello').status, 'malformed');
});

test('gradeTypedSan: the exact standard form is correct', () => {
  assert.deepEqual(gradeTypedSan(QGD, 'Nbd7', 'Nbd7'), {
    correct: true,
    code: 'ok',
    message: 'Correct.',
    canonical: 'Nbd7',
  });
  assert.equal(gradeTypedSan(fenOf(skill('castle-short')), 'O-O', '0-0').correct, true);
  assert.equal(gradeTypedSan(fenOf(skill('promote')), 'e8=Q', 'e8Q').correct, true);
  assert.equal(gradeTypedSan(fenOf(skill('en-passant')), 'exd6', 'exd6 e.p.').correct, true);
});

test('NEGATIVE: "Nd7" is rejected when two knights can go there', () => {
  const g = gradeTypedSan(QGD, 'Nbd7', 'Nd7');
  assert.equal(g.correct, false);
  assert.equal(g.code, 'ambiguous');
  assert.match(g.message, /Nbd7 or Nfd7|Nfd7 or Nbd7/);
});

test('NEGATIVE: wrong disambiguation is rejected', () => {
  // The other knight: a different, legal move.
  const other = gradeTypedSan(QGD, 'Nbd7', 'Nfd7');
  assert.deepEqual([other.correct, other.code], [false, 'wrong-move']);
  // Rank where the file tells them apart.
  const byRank = gradeTypedSan(QGD, 'Nbd7', 'N8d7');
  assert.deepEqual([byRank.correct, byRank.code], [false, 'wrong-disambiguation']);
  // A file with no knight on it.
  assert.equal(gradeTypedSan(QGD, 'Nbd7', 'Ncd7').code, 'illegal');
  // File where the rank is needed (both rooks are on the a-file).
  const rooks = fenOf(skill('rooks-rank'));
  assert.equal(gradeTypedSan(rooks, 'R1a3', 'Raa3').code, 'ambiguous');
  assert.equal(gradeTypedSan(rooks, 'R1a3', 'Ra1a3').code, 'wrong-disambiguation');
  // Not enough for three queens.
  const queens = fenOf(skill('queens-square'));
  assert.equal(gradeTypedSan(queens, 'Qh4e1', 'Qhe1').code, 'ambiguous');
  assert.equal(gradeTypedSan(queens, 'Qh4e1', 'Qh4e1').correct, true);
});

test('NEGATIVE: disambiguating when only one piece can go there is not the standard form', () => {
  const fen = positionAfter(['e4', 'e5']);
  const g = gradeTypedSan(fen, 'Nf3', 'Ngf3');
  assert.deepEqual([g.correct, g.code], [false, 'over-disambiguated']);
});

test('NEGATIVE: captures need the x, and only captures', () => {
  const fen = fenOf(skill('piece-capture'));
  assert.equal(gradeTypedSan(fen, 'Nxe5', 'Ne5').code, 'missing-capture');
  assert.equal(gradeTypedSan(positionAfter(['e4', 'd5']), 'exd5', 'ed5').code, 'missing-capture');
  assert.equal(gradeTypedSan(positionAfter(['e4', 'e5']), 'Nf3', 'Nxf3').code, 'extra-capture');
});

test('NEGATIVE: check and mate marks must match', () => {
  const check = fenOf(skill('check'));
  assert.equal(gradeTypedSan(check, 'Bb5+', 'Bb5').code, 'missing-check');
  assert.equal(gradeTypedSan(check, 'Bb5+', 'Bb5#').code, 'extra-check');
  const mate = fenOf(skill('mate'));
  assert.equal(gradeTypedSan(mate, 'Qxf7#', 'Qxf7+').code, 'mate-mark');
  assert.equal(gradeTypedSan(positionAfter(['e4', 'e5']), 'Nf3', 'Nf3+').code, 'extra-check');
});

test('NEGATIVE: promotions must name the piece, and the right one', () => {
  const fen = fenOf(skill('promote'));
  assert.equal(gradeTypedSan(fen, 'e8=Q', 'e8').code, 'missing-promotion');
  assert.equal(gradeTypedSan(fenOf(skill('underpromote')), 'f8=N+', 'f8=Q').code, 'wrong-move');
});

test('NEGATIVE: lowercase pieces, junk and blanks are rejected with a reason', () => {
  const fen = positionAfter(['e4', 'e5']);
  assert.equal(gradeTypedSan(fen, 'Nf3', 'nf3').code, 'lowercase-piece');
  assert.equal(gradeTypedSan(fen, 'Nf3', 'knight f3').code, 'malformed');
  assert.equal(gradeTypedSan(fen, 'Nf3', '   ').code, 'empty');
  assert.equal(gradeTypedSan(fen, 'Nf3', 'Nf6').code, 'illegal');
});

test('gradeTypedSan refuses an expected move that is not legal', () => {
  assert.throws(() => gradeTypedSan(positionAfter(['e4', 'e5']), 'Nf6', 'Nf6'));
});

test('gradePlayedMove: the right squares (and promotion piece) are correct', () => {
  assert.equal(gradePlayedMove(QGD, 'Nbd7', { from: 'b8', to: 'd7' }).correct, true);
  const wrong = gradePlayedMove(QGD, 'Nbd7', { from: 'f6', to: 'd7' });
  assert.deepEqual([wrong.correct, wrong.playedSan, wrong.canonical], [false, 'Nfd7', 'Nbd7']);
  const promo = fenOf(skill('underpromote'));
  assert.equal(gradePlayedMove(promo, 'f8=N+', { from: 'f7', to: 'f8', promotion: 'n' }).correct, true);
  assert.equal(gradePlayedMove(promo, 'f8=N+', { from: 'f7', to: 'f8', promotion: 'q' }).correct, false);
  assert.equal(gradePlayedMove(QGD, 'Nbd7', { from: 'a1', to: 'a8' }).correct, false);
  assert.equal(gradePlayedMove(QGD, 'Nbd7', null).correct, false);
});

test('canonicalSan names a move from its squares', () => {
  assert.equal(canonicalSan(QGD, { from: 'b8', to: 'd7' }), 'Nbd7');
  assert.throws(() => canonicalSan(QGD, { from: 'b8', to: 'b6' }));
});

test('every skill position is legal and its answer is already the standard form', () => {
  for (const p of SKILL_POSITIONS) {
    const fen = fenOf(p);
    const chess = new Chess(fen);
    const move = chess.move(p.san);
    assert.ok(move, `${p.id}: ${p.san} is not legal`);
    assert.equal(move.san, p.san, `${p.id}: standard form is ${move.san}`);
    assert.equal(gradeTypedSan(fen, p.san, p.san).correct, true, p.id);
  }
});

test('the skill set covers castling, captures, checks, promotion and disambiguation', () => {
  const categories = new Set(SKILL_POSITIONS.map((p) => p.category));
  for (const c of ['Castling', 'Captures', 'Checks', 'Promotion', 'Disambiguation']) assert.ok(categories.has(c), c);
  const sans = SKILL_POSITIONS.map((p) => p.san);
  for (const s of ['O-O', 'O-O-O', 'Nbd7', 'R1a3', 'Qh4e1', 'exd8=Q+', 'f8=N+', 'Qxf7#']) assert.ok(sans.includes(s), s);
});

test('buildSkillsDrill gives one step per position with its FEN and squares', () => {
  const steps = buildSkillsDrill();
  assert.equal(steps.length, SKILL_POSITIONS.length);
  const nbd7 = steps.find((s) => s.id === 'knights-file');
  assert.deepEqual([nbd7.from, nbd7.to, nbd7.san, nbd7.color], ['b8', 'd7', 'Nbd7', 'b']);
});

test('both sample games replay legally and are long enough for the 40-move drill', () => {
  for (const game of SAMPLE_GAMES) {
    const steps = replaySans(game.moves);
    assert.ok(steps.length >= NOTATION_GAME_PLIES, `${game.id} has ${steps.length} plies`);
    // The listed SAN is already standard, so the drill's answer key is the list itself.
    steps.forEach((step, i) => assert.equal(step.san, game.moves[i], `${game.id} ply ${i + 1}`));
  }
  const drill = buildGameDrill(SAMPLE_GAMES[0], NOTATION_GAME_PLIES);
  assert.equal(drill.length, 80);
  assert.equal(drill[0].label, '1.');
  assert.equal(drill[1].label, '1...');
  assert.equal(drill[79].label, '40...');
});

test('the sample games exercise the notation the drill promises', () => {
  const all = SAMPLE_GAMES.flatMap((g) => g.moves);
  for (const s of ['O-O', 'O-O-O', 'Rcf1', 'R1f2', 'Rbb7', 'Nbxd5', 'Qf4+', 'Re7+']) assert.ok(all.includes(s), s);
});

test('NEGATIVE: replaySans names the first illegal move', () => {
  assert.throws(() => replaySans(['e4', 'e5', 'Ke3']), /Move 3 \(Ke3\) is illegal/);
  assert.throws(() => positionAfter(['e4', 'e4']), /Setup move 2/);
});

test('shuffle keeps every item and can be pinned', () => {
  const list = [1, 2, 3, 4, 5];
  const out = shuffle(list, () => 0);
  assert.deepEqual([...out].sort(), list);
  assert.deepEqual(list, [1, 2, 3, 4, 5]);
  assert.deepEqual(shuffle(list, () => 0.999), list);
});

test('summariseDrill counts and times a run', () => {
  assert.deepEqual(summariseDrill([true, true, false, true], 61.6), { score: 3, total: 4, accuracy: 0.75, seconds: 62 });
  assert.deepEqual(summariseDrill([], -3), { score: 0, total: 0, accuracy: 0, seconds: 0 });
});
