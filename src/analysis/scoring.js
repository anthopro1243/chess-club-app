/**
 * src/analysis/scoring.js
 *
 * Pure scoring math for the Chess Club game analyzer.
 *
 * This file has NO dependencies — not on the chess engine, not on Stockfish,
 * not on the DOM, not on Supabase. Everything here is a pure function of the
 * per-ply records produced by the evaluation pass. That is deliberate: this is
 * the part that is easy to get subtly wrong, so it must be testable on its own.
 *
 * Pipeline position:
 *
 *   PGN text
 *     -> parsePgn()            (src/analysis/pgn.js — you write this)
 *     -> replay through engine -> FEN per ply
 *     -> evaluate() each FEN   (src/engine/stockfishClient.js — you extend this)
 *     -> PlyRecord[]           (the shape documented below)
 *     -> THIS FILE             -> game report + eight 0-100 rubric scores
 *     -> updatePlayerScores()  -> tracked scores over time
 *     -> improvementPlan()     -> what the player should work on next
 *
 * ── Sign convention, the thing most likely to bite you ────────────────────
 * Stockfish reports `score cp` from the perspective of the side to move in the
 * position being searched. After White plays a move it is Black to move, so the
 * raw eval of the resulting position is from BLACK's point of view. Every
 * cp/mate value handed to this module must already be normalised to the point
 * of view of the player who MADE the move. See normaliseAfter() below; use it.
 */

/* ───────────────────────── constants you may tune ───────────────────────── */

/** Lichess's published centipawn -> win% constant. */
export const WIN_PROB_K = 0.00368208;

/** Lichess's published accuracy constants. */
export const ACC_A = 103.1668;
export const ACC_B = -0.04354;
export const ACC_C = -3.1669;

/** Centipawn values are clamped before conversion; beyond this it's all ~100%. */
export const CP_CLAMP = 1000;

/** Win%-loss thresholds for move classification, in percentage points. */
export const CLASS_THRESHOLDS = {
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
  // >= mistake threshold is a blunder
};

/**
 * Positions this lopsided are excluded from every average. This is the fix for
 * the known failure mode: in a dead-won or dead-lost position the engine flags
 * reasonable human moves as "Mistake" because the eval has nowhere to go but
 * down. Those moves teach nothing and they wreck the averages.
 */
export const DECIDED_WIN_PCT = 97;
export const DECIDED_LOSS_PCT = 3;

/** Best move must beat the second best by this much (cp) to count as "only move". */
export const ONLY_MOVE_GAP = 150;

/** Engine's best move must gain at least this much (cp) for a tactic to be "available". */
export const TACTIC_GAIN = 150;

/** A move played this fast (seconds) counts as impulsive if the player had time. */
export const FAST_MOVE_SECONDS = 5;

/** Below this share of base time remaining, the player is in time trouble. */
export const TIME_TROUBLE_FRACTION = 0.1;
export const TIME_TROUBLE_FLOOR_SECONDS = 30;

/** Plies after the player's own blunder that count as the "tilt window". */
export const TILT_WINDOW_PLIES = 6;

/**
 * Caps on the secondary penalties. Every penalty below is expressed as a RATE
 * over the opportunities that produced it, never as a raw count — a raw count
 * grows with the number of games analysed, so a player would be punished for
 * having more of their games reviewed.
 */
export const MAX_TACTIC_MISS_PENALTY = 10;
export const MAX_TIME_PENALTY = 22;

/**
 * Shrinkage strength, in observations. A category score computed from very few
 * observations is pulled toward the prior. Without this, three endgame moves in
 * one game produce "endgame technique: 8/100", which is both wrong and
 * demoralising to show a 12-year-old.
 */
export const SHRINK_K = 25;
export const SHRINK_K_RATE = 12;

/** Neutral prior for a player with no history. */
export const NEUTRAL_PRIOR = 50;

/**
 * Relative coaching leverage per category at club level. Used only to rank what
 * to work on next — never to alter a score. Tactics and board vision move a
 * scholastic player's results faster than anything else, so a weak score there
 * outranks an equally weak score in positional understanding.
 */
export const CATEGORY_LEVERAGE = {
  tacticalVision: 1.35,
  boardVision: 1.3,
  endgameTechnique: 1.1,
  timeManagement: 1.05,
  openingKnowledge: 1.0,
  psychologicalResilience: 0.95,
  positionalUnderstanding: 0.9,
  notation: 0.8,
};

export const CATEGORY_KEYS = [
  'openingKnowledge',
  'tacticalVision',
  'positionalUnderstanding',
  'endgameTechnique',
  'timeManagement',
  'boardVision',
  'psychologicalResilience',
  'notation',
];

export const CATEGORY_LABELS = {
  openingKnowledge: 'Opening knowledge',
  tacticalVision: 'Tactical vision',
  positionalUnderstanding: 'Positional understanding',
  endgameTechnique: 'Endgame technique',
  timeManagement: 'Time management',
  boardVision: 'Board vision',
  psychologicalResilience: 'Psychological resilience',
  notation: 'Notation',
};

/* ─────────────────────────── small helpers ─────────────────────────── */

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Piecewise-linear calibration curve. `anchors` is [[metric, score], ...] in
 * ascending metric order; score normally descends (higher metric = worse).
 * Interpolates between anchors and clamps outside the range.
 *
 * These anchors are provisional. Once you have ~50 analysed club games, refit
 * them so the club's median lands near 50 — see recalibrationReport().
 */
export function curve(value, anchors) {
  if (value == null || Number.isNaN(value)) return null;
  if (value <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (value >= x0 && value <= x1) {
      const t = x1 === x0 ? 0 : (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

/** Mean win%-loss per counted move -> 0-100. */
export const LOSS_ANCHORS = [
  [0, 100], [1.5, 92], [3, 82], [5, 70], [8, 55],
  [12, 40], [18, 25], [25, 12], [40, 0],
];

/**
 * Error rate (0-1) in tactical positions -> 0-100.
 * Softer at the high-error end than a naive curve: a genuine beginner fails
 * better than half the tactics on the board, and scoring that 7/100 is both
 * uninformative and the kind of number that makes a kid stop opening the app.
 */
export const TACTIC_ERROR_ANCHORS = [
  [0, 100], [0.05, 88], [0.12, 76], [0.2, 66], [0.3, 56],
  [0.4, 46], [0.55, 34], [0.7, 22], [0.85, 10], [1, 0],
];

/** Oversights per 100 moves -> 0-100. */
export const OVERSIGHT_ANCHORS = [
  [0, 100], [0.5, 90], [1.5, 76], [3, 60], [5, 44],
  [8, 28], [12, 12], [18, 0],
];

/** Share of moves played in time trouble (0-1) -> 0-100. */
export const TIME_TROUBLE_ANCHORS = [
  [0, 100], [0.05, 92], [0.12, 80], [0.2, 66], [0.3, 50],
  [0.45, 32], [0.6, 16], [0.8, 0],
];

/** Extra win%-loss when behind vs. when level -> 0-100. */
export const RESILIENCE_ANCHORS = [
  [-2, 100], [0, 90], [1.5, 78], [3, 64], [5, 48],
  [8, 32], [12, 16], [18, 0],
];

/** Conversion rate of winning positions (0-1) -> 0-100, ascending. */
export const CONVERSION_ANCHORS = [
  [0, 0], [0.25, 22], [0.5, 45], [0.7, 62], [0.85, 78], [0.95, 92], [1, 100],
];

/* ───────────────────── core evaluation conversions ───────────────────── */

/**
 * Normalise an engine score for the position AFTER a move into the point of
 * view of the player who made the move. Call this on every cpAfter/mateAfter
 * before building a PlyRecord.
 */
export function normaliseAfter({ cp, mate }) {
  return { cp: cp == null ? null : -cp, mate: mate == null ? null : -mate };
}

/**
 * Centipawns (or mate distance) -> win percentage, 0-100, from the point of
 * view of the side the score belongs to.
 *
 *   Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
 *
 * Mate is not a centipawn value and must not be shoved through the sigmoid:
 * mate-in-3 is 100%, not "about 985 centipawns".
 */
export function winPercent(cp, mate = null) {
  if (mate != null) return mate > 0 ? 100 : 0;
  if (cp == null) return null;
  const c = clamp(cp, -CP_CLAMP, CP_CLAMP);
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_PROB_K * c)) - 1);
}

/**
 * A single move's accuracy, from the drop in win percentage it caused.
 *
 *   Accuracy% = 103.1668 * exp(-0.04354 * winPercentLost) - 3.1669
 *
 * THE BUG TO NOT REPEAT: never feed raw centipawn loss into this. The exponent
 * is calibrated for win-percentage points, which are bounded 0-100 and
 * non-linear in cp. Feeding centipawns in drives every score to ~0, which is
 * exactly what happened the first time around.
 */
export function moveAccuracy(winPercentBefore, winPercentAfter) {
  const lost = Math.max(0, winPercentBefore - winPercentAfter);
  return clamp(ACC_A * Math.exp(ACC_B * lost) + ACC_C, 0, 100);
}

/** Harmonic mean, used alongside the plain mean so one catastrophe still shows. */
export function harmonicMean(xs) {
  const safe = xs.filter((x) => x > 0.1);
  if (!safe.length) return 0;
  return safe.length / safe.reduce((a, b) => a + 1 / b, 0);
}

/**
 * Game accuracy for one side. Lichess averages a volatility-weighted mean with
 * a harmonic mean; we do the same in spirit — the harmonic mean is what stops a
 * game with one game-losing blunder and forty book moves reading as 96%.
 */
export function gameAccuracy(moveAccuracies, winPercents) {
  if (!moveAccuracies.length) return null;
  const windowSize = clamp(Math.ceil(winPercents.length / 10), 2, 8);
  const weights = moveAccuracies.map((_, i) => {
    const slice = winPercents.slice(Math.max(0, i - windowSize), i + windowSize + 1);
    const m = mean(slice) ?? 50;
    const sd = Math.sqrt(mean(slice.map((v) => (v - m) ** 2)) ?? 0);
    return clamp(sd, 0.5, 12);
  });
  const totalW = weights.reduce((a, b) => a + b, 0);
  const weighted = moveAccuracies.reduce((a, acc, i) => a + acc * weights[i], 0) / totalW;
  return clamp((weighted + harmonicMean(moveAccuracies)) / 2, 0, 100);
}

/* ───────────────────────── move classification ───────────────────────── */

/**
 * Classify one ply. Returns a label plus the raw quantities, and `counted`:
 * whether this ply should feed the averages at all.
 *
 * Labels: book | best | onlyMove | excellent | good | inaccuracy | mistake |
 *         blunder | forced (in a decided position, not counted)
 */
export function classifyPly(rec) {
  const wpBefore = winPercent(rec.cpBefore, rec.mateBefore);
  const wpAfter = winPercent(rec.cpAfter, rec.mateAfter);
  if (wpBefore == null || wpAfter == null) {
    return { label: 'unknown', counted: false, winLoss: null, accuracy: null, wpBefore, wpAfter };
  }

  const winLoss = Math.max(0, wpBefore - wpAfter);
  const accuracy = moveAccuracy(wpBefore, wpAfter);
  const playedBest = rec.bestUci != null && rec.uci === rec.bestUci;

  // Flags are computed before the early returns: a missed forced mate is the
  // most teachable error in chess and must still be REPORTED even when the
  // position is too decided to feed the averages.
  const missedMate =
    rec.mateBefore != null && rec.mateBefore > 0 && !(rec.mateAfter != null && rec.mateAfter > 0);
  const missedWin = wpBefore >= 80 && wpAfter < 60;
  const decided = wpBefore >= DECIDED_WIN_PCT || wpBefore <= DECIDED_LOSS_PCT;

  // Opening book: the player is repeating known theory, not solving anything.
  if (rec.inBook) {
    return { label: 'book', counted: false, winLoss, accuracy, wpBefore, wpAfter,
             playedBest, missedMate, missedWin, decided };
  }

  // Decided positions teach nothing and distort everything.
  if (decided) {
    return { label: 'forced', counted: false, winLoss, accuracy, wpBefore, wpAfter,
             playedBest, missedMate, missedWin, decided };
  }

  let label;
  if (playedBest) {
    label = rec.secondBestDelta != null && rec.secondBestDelta >= ONLY_MOVE_GAP ? 'onlyMove' : 'best';
  } else if (winLoss < CLASS_THRESHOLDS.excellent) label = 'excellent';
  else if (winLoss < CLASS_THRESHOLDS.good) label = 'good';
  else if (winLoss < CLASS_THRESHOLDS.inaccuracy) label = 'inaccuracy';
  else if (winLoss < CLASS_THRESHOLDS.mistake) label = 'mistake';
  else label = 'blunder';

  return {
    label, counted: true, winLoss, accuracy, wpBefore, wpAfter,
    playedBest, missedMate, missedWin, decided,
    isError: label === 'inaccuracy' || label === 'mistake' || label === 'blunder',
    isSeriousError: label === 'mistake' || label === 'blunder',
  };
}

/* ──────────────────── per-game metrics for one player ──────────────────── */

/**
 * @param {PlyRecord[]} plies  every ply of the game, both sides
 * @param {'w'|'b'} side       the player being analysed
 * @param {object} meta        { baseSeconds, incrementSeconds, result, flagged }
 */
export function analyseGameForSide(plies, side, meta = {}) {
  const mine = plies.filter((p) => p.side === side);
  const judged = mine.map((p) => ({ rec: p, cls: classifyPly(p) }));
  const counted = judged.filter((j) => j.cls.counted);

  const counts = {};
  for (const j of judged) counts[j.cls.label] = (counts[j.cls.label] || 0) + 1;

  const accuracies = counted.map((j) => j.cls.accuracy);
  const wpSeries = judged.map((j) => j.cls.wpBefore ?? 50);
  const accuracy = gameAccuracy(accuracies, wpSeries);

  const lossesIn = (pred) => counted.filter((j) => pred(j)).map((j) => j.cls.winLoss);
  const acplIn = (pred) => {
    const xs = counted.filter((j) => pred(j))
      .map((j) => Math.max(0, (j.rec.cpBefore ?? 0) - (j.rec.cpAfter ?? 0)));
    return mean(xs);
  };

  const byPhase = {};
  for (const phase of ['opening', 'middlegame', 'endgame']) {
    const sel = (j) => j.rec.phase === phase;
    byPhase[phase] = {
      moves: counted.filter(sel).length,
      meanWinLoss: mean(lossesIn(sel)),
      acpl: acplIn(sel),
    };
  }

  // ── tactical ──
  const tacticPlies = counted.filter((j) => j.rec.tacticAvailable);
  const tacticErrors = tacticPlies.filter((j) => j.cls.isSeriousError);
  const missedMates = judged.filter((j) => j.cls.missedMate).length;
  const missedWins = judged.filter((j) => j.cls.missedWin).length;
  // Only misses from positions that were still live count against the score.
  const scoringMissedMates = judged.filter((j) => j.cls.missedMate && !j.cls.decided).length;
  const scoringMissedWins = judged.filter((j) => j.cls.missedWin && !j.cls.decided).length;

  // ── board vision: one-move oversights, counted narrowly on purpose ──
  const oversights = mine.filter((p) => p.hangs || p.missedFreeCapture).length;

  // ── resilience: does quality collapse when losing? ──
  const behind = lossesIn((j) => j.cls.wpBefore < 40);
  const level = lossesIn((j) => j.cls.wpBefore >= 40 && j.cls.wpBefore < 80);
  const behindLoss = mean(behind);
  const levelLoss = mean(level);
  const resilienceDelta =
    behindLoss != null && levelLoss != null ? behindLoss - levelLoss : null;

  // tilt: errors in the plies right after the player's own blunder
  let tiltErrors = 0, tiltMoves = 0;
  const myIndexes = judged.map((j, i) => i);
  for (let i = 0; i < judged.length; i++) {
    if (judged[i].cls.label !== 'blunder') continue;
    for (let k = i + 1; k <= Math.min(judged.length - 1, i + Math.ceil(TILT_WINDOW_PLIES / 2)); k++) {
      tiltMoves++;
      if (judged[k].cls.isSeriousError) tiltErrors++;
    }
  }

  // ── time ──
  const base = meta.baseSeconds ?? null;
  const troubleLine = base ? Math.max(TIME_TROUBLE_FLOOR_SECONDS, base * TIME_TROUBLE_FRACTION) : null;
  const withClock = mine.filter((p) => p.moveSeconds != null && p.clockBefore != null);
  const inTrouble = troubleLine != null ? withClock.filter((p) => p.clockBefore < troubleLine) : [];
  const fastErrors = judged.filter((j) =>
    j.cls.isSeriousError &&
    j.rec.moveSeconds != null && j.rec.moveSeconds < FAST_MOVE_SECONDS &&
    (base == null || (j.rec.clockBefore ?? 0) > base * 0.25)
  ).length;
  const errorsInTrouble = judged.filter((j) =>
    j.cls.isSeriousError && troubleLine != null && (j.rec.clockBefore ?? Infinity) < troubleLine
  ).length;
  const secondsOnErrors = mean(judged.filter((j) => j.cls.isSeriousError && j.rec.moveSeconds != null)
    .map((j) => j.rec.moveSeconds));
  const secondsOnGood = mean(judged.filter((j) => !j.cls.isSeriousError && j.rec.moveSeconds != null)
    .map((j) => j.rec.moveSeconds));

  // ── endgame conversion ──
  const endgamePlies = judged.filter((j) => j.rec.phase === 'endgame');
  const enteredWinning = endgamePlies.length > 0 && (endgamePlies[0].cls.wpBefore ?? 50) >= 70;
  const enteredDrawn = endgamePlies.length > 0 &&
    (endgamePlies[0].cls.wpBefore ?? 50) > 35 && (endgamePlies[0].cls.wpBefore ?? 50) < 65;
  const won = meta.result === (side === 'w' ? '1-0' : '0-1');
  const drew = meta.result === '1/2-1/2';

  // ── motifs on error moves, for the "what keeps happening" report ──
  const motifCounts = {};
  for (const j of judged) {
    if (!j.cls.isSeriousError) continue;
    for (const m of j.rec.motifs || []) motifCounts[m] = (motifCounts[m] || 0) + 1;
  }

  // ── critical moments: biggest swings, for the review UI ──
  const critical = judged
    .filter((j) => j.cls.counted && j.cls.winLoss >= CLASS_THRESHOLDS.mistake)
    .sort((a, b) => b.cls.winLoss - a.cls.winLoss)
    .slice(0, 5)
    .map((j) => ({
      ply: j.rec.ply, fullmove: j.rec.fullmove, san: j.rec.san,
      played: j.rec.uci, better: j.rec.bestUci,
      winPercentLost: round1(j.cls.winLoss), label: j.cls.label,
      motifs: j.rec.motifs || [], secondsUsed: j.rec.moveSeconds ?? null,
    }));

  return {
    side,
    movesPlayed: mine.length,
    movesCounted: counted.length,
    accuracy: accuracy == null ? null : round1(accuracy),
    acpl: round1(acplIn(() => true)),
    meanWinLoss: round1(mean(lossesIn(() => true))),
    counts,
    byPhase,
    critical,
    motifCounts,
    raw: {
      openingWinLoss: byPhase.opening.meanWinLoss,
      openingMoves: byPhase.opening.moves,
      bookDepth: mine.filter((p) => p.inBook).length,
      tacticOpportunities: tacticPlies.length,
      tacticErrorRate: tacticPlies.length ? tacticErrors.length / tacticPlies.length : null,
      missedMates, missedWins,
      scoringMissedMates, scoringMissedWins,
      quietWinLoss: mean(lossesIn((j) => j.rec.quiet)),
      quietMoves: counted.filter((j) => j.rec.quiet).length,
      endgameWinLoss: byPhase.endgame.meanWinLoss,
      endgameMoves: byPhase.endgame.moves,
      conversion: enteredWinning ? (won ? 1 : 0) : enteredDrawn ? (won || drew ? 1 : 0) : null,
      conversionChances: enteredWinning || enteredDrawn ? 1 : 0,
      oversights,
      oversightDenominator: mine.length,
      oversightRate: mine.length ? (oversights / mine.length) * 100 : null,
      resilienceDelta,
      resilienceMoves: Math.min(behind.length, level.length),
      tiltRate: tiltMoves ? tiltErrors / tiltMoves : null,
      timeTroubleRate: withClock.length ? inTrouble.length / withClock.length : null,
      timedMoves: withClock.length,
      fastErrors,
      errorsInTrouble,
      secondsOnErrors, secondsOnGood,
      flagged: !!meta.flagged,
    },
  };
}

const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/* ──────────────────── the eight rubric scores, 0-100 ──────────────────── */

/**
 * Turn raw metrics (from one game, or summed across many) into the eight
 * scores. Each returns { score, raw, n, confidence, measured }.
 *
 * Small samples are shrunk toward `prior` so that a score computed from four
 * moves does not read as fact. This matters more than it sounds: the difference
 * between "endgame 8/100" and "endgame 46/100 (low confidence)" is the
 * difference between a kid quitting and a kid practising.
 */
export function rubricScores(raw, opts = {}) {
  const prior = opts.prior ?? NEUTRAL_PRIOR;
  const priors = opts.priors || {};
  const K = opts.shrinkK ?? SHRINK_K;
  const Kr = opts.shrinkKRate ?? SHRINK_K_RATE;

  const build = (key, rawScore, n, k) => {
    const p = priors[key] ?? prior;
    if (rawScore == null || !n) {
      return { score: null, raw: null, n: n || 0, confidence: 'none', measured: false };
    }
    const shrunk = (n * rawScore + k * p) / (n + k);
    return {
      score: Math.round(clamp(shrunk, 0, 100)),
      raw: Math.round(clamp(rawScore, 0, 100)),
      n,
      confidence: n < k * 0.5 ? 'low' : n < k * 2 ? 'medium' : 'high',
      measured: true,
    };
  };

  // 1. Opening knowledge — quality through the opening phase, with a modest
  //    credit for depth of book knowledge (capped, so memorising 20 moves of
  //    one line doesn't paper over not understanding the resulting position).
  let openingRaw = curve(raw.openingWinLoss, LOSS_ANCHORS);
  if (openingRaw != null && raw.bookDepth != null) {
    openingRaw = clamp(openingRaw + clamp((raw.bookDepth - 6) * 1.2, -6, 8), 0, 100);
  }

  // 2. Tactical vision — how often a tactic was on the board and went wrong,
  //    penalised further for missed forced wins and missed mates.
  let tacticalRaw = curve(raw.tacticErrorRate, TACTIC_ERROR_ANCHORS);
  if (tacticalRaw != null) {
    const misses =
      (raw.scoringMissedMates ?? raw.missedMates ?? 0) * 2 +
      (raw.scoringMissedWins ?? raw.missedWins ?? 0);
    const missPenalty = clamp(
      (misses / Math.max(1, raw.tacticOpportunities || 1)) * 120,
      0, MAX_TACTIC_MISS_PENALTY
    );
    tacticalRaw = clamp(tacticalRaw - missPenalty, 0, 100);
  }

  // 3. Positional understanding — quality restricted to quiet positions: no
  //    capture or check available, eval not already decided. What's left when
  //    you remove the tactics is positional judgement.
  const positionalRaw = curve(raw.quietWinLoss, LOSS_ANCHORS);

  // 4. Endgame technique — endgame-phase quality, blended with whether winning
  //    endgames actually got won. Conversion is the half that players feel.
  const endgameQuality = curve(raw.endgameWinLoss, LOSS_ANCHORS);
  const conversionScore = raw.conversionChances
    ? curve(raw.conversion / Math.max(1, raw.conversionChances), CONVERSION_ANCHORS)
    : null;
  const endgameRaw =
    endgameQuality == null ? conversionScore
      : conversionScore == null ? endgameQuality
        : endgameQuality * 0.65 + conversionScore * 0.35;

  // 5. Time management — measured only when the PGN carries [%clk]. Time
  //    trouble is the base; impulsive errors with plenty of clock, errors made
  //    in trouble, and flagging are all additional penalties.
  let timeRaw = curve(raw.timeTroubleRate, TIME_TROUBLE_ANCHORS);
  if (timeRaw != null) {
    // Impulsive errors count double: blundering in five seconds with twenty
    // minutes on the clock is a worse habit than blundering while short of time.
    const timePenalty = clamp(
      (((raw.fastErrors || 0) * 2 + (raw.errorsInTrouble || 0)) /
        Math.max(1, raw.timedMoves || 1)) * 400,
      0, MAX_TIME_PENALTY
    );
    timeRaw = clamp(timeRaw - timePenalty - (raw.flagged ? 10 : 0), 0, 100);
    // Spending longer on the moves you got wrong than the ones you got right is
    // the healthy pattern — it means the player noticed the position was hard.
    if (raw.secondsOnErrors != null && raw.secondsOnGood != null && raw.secondsOnGood > 0) {
      const ratio = raw.secondsOnErrors / raw.secondsOnGood;
      timeRaw = clamp(timeRaw + (ratio >= 1 ? 3 : -5), 0, 100);
    }
  }

  // 6. Board vision — one-move oversights per 100 moves. Deliberately narrow:
  //    hanging a piece or missing a free capture, not "played a bad plan".
  const boardRaw = curve(raw.oversightRate, OVERSIGHT_ANCHORS);

  // 7. Psychological resilience — how much worse the player gets once behind,
  //    plus error rate in the plies following their own blunder.
  let resilienceRaw = curve(raw.resilienceDelta, RESILIENCE_ANCHORS);
  if (resilienceRaw != null && raw.tiltRate != null) {
    resilienceRaw = clamp(resilienceRaw - raw.tiltRate * 25, 0, 100);
  }

  // 8. Notation — NOT measurable from a PGN, which is already notation someone
  //    else transcribed. Left unmeasured on purpose rather than faked; it is
  //    filled by the SAN-entry drill and scoresheet checks. An honest null is
  //    worth more than a plausible invented number.
  const notation = raw.notationScore != null && raw.notationSamples
    ? build('notation', raw.notationScore, raw.notationSamples, Kr)
    : { score: null, raw: null, n: 0, confidence: 'none', measured: false,
        note: 'Not measurable from PGN — comes from SAN entry and scoresheet checks.' };

  return {
    openingKnowledge: build('openingKnowledge', openingRaw, raw.openingMoves || 0, K),
    tacticalVision: build('tacticalVision', tacticalRaw, raw.tacticOpportunities || 0, Kr),
    positionalUnderstanding: build('positionalUnderstanding', positionalRaw, raw.quietMoves || 0, K),
    endgameTechnique: build('endgameTechnique', endgameRaw, raw.endgameMoves || 0, K),
    timeManagement: build('timeManagement', timeRaw, raw.timedMoves || 0, K),
    boardVision: build('boardVision', boardRaw, raw.oversightDenominator ?? raw.movesCounted ?? 0, K),
    psychologicalResilience: build('psychologicalResilience', resilienceRaw, raw.resilienceMoves || 0, Kr),
    notation,
  };
}

/** Sum the per-game raw metrics across many games before scoring. */
export function aggregateRaw(gameReports) {
  const out = {
    openingWinLoss: null, openingMoves: 0, bookDepth: 0,
    tacticOpportunities: 0, tacticErrorRate: null, missedMates: 0, missedWins: 0,
    scoringMissedMates: 0, scoringMissedWins: 0,
    quietWinLoss: null, quietMoves: 0,
    endgameWinLoss: null, endgameMoves: 0, conversion: 0, conversionChances: 0,
    oversights: 0, oversightDenominator: 0, oversightRate: null,
    resilienceDelta: null, resilienceMoves: 0, tiltRate: null,
    timeTroubleRate: null, timedMoves: 0, fastErrors: 0, errorsInTrouble: 0,
    secondsOnErrors: null, secondsOnGood: null, flagged: false,
    movesCounted: 0, games: gameReports.length,
  };
  // weighted means, weighted by the number of observations behind each
  const wm = (key, weightKey) => {
    let num = 0, den = 0;
    for (const g of gameReports) {
      const v = g.raw[key], w = g.raw[weightKey];
      if (v != null && w) { num += v * w; den += w; }
    }
    return den ? num / den : null;
  };
  for (const g of gameReports) {
    out.openingMoves += g.raw.openingMoves || 0;
    out.bookDepth += g.raw.bookDepth || 0;
    out.tacticOpportunities += g.raw.tacticOpportunities || 0;
    out.missedMates += g.raw.missedMates || 0;
    out.missedWins += g.raw.missedWins || 0;
    out.scoringMissedMates += g.raw.scoringMissedMates || 0;
    out.scoringMissedWins += g.raw.scoringMissedWins || 0;
    out.quietMoves += g.raw.quietMoves || 0;
    out.endgameMoves += g.raw.endgameMoves || 0;
    out.conversion += g.raw.conversion ?? 0;
    out.conversionChances += g.raw.conversionChances || 0;
    out.oversights += g.raw.oversights || 0;
    out.oversightDenominator += g.movesPlayed || 0;
    out.timedMoves += g.raw.timedMoves || 0;
    out.fastErrors += g.raw.fastErrors || 0;
    out.errorsInTrouble += g.raw.errorsInTrouble || 0;
    out.resilienceMoves += g.raw.resilienceMoves || 0;
    out.movesCounted += g.movesCounted || 0;
    out.flagged = out.flagged || !!g.raw.flagged;
  }
  out.openingWinLoss = wm('openingWinLoss', 'openingMoves');
  out.quietWinLoss = wm('quietWinLoss', 'quietMoves');
  out.endgameWinLoss = wm('endgameWinLoss', 'endgameMoves');
  out.resilienceDelta = wm('resilienceDelta', 'resilienceMoves');
  out.timeTroubleRate = wm('timeTroubleRate', 'timedMoves');
  out.tacticErrorRate = wm('tacticErrorRate', 'tacticOpportunities');
  out.tiltRate = mean(gameReports.map((g) => g.raw.tiltRate).filter((v) => v != null));
  out.secondsOnErrors = mean(gameReports.map((g) => g.raw.secondsOnErrors).filter((v) => v != null));
  out.secondsOnGood = mean(gameReports.map((g) => g.raw.secondsOnGood).filter((v) => v != null));
  out.oversightRate = out.oversightDenominator
    ? (out.oversights / out.oversightDenominator) * 100 : null;
  out.bookDepth = gameReports.length ? out.bookDepth / gameReports.length : 0;

  out.motifCounts = {};
  for (const g of gameReports) {
    for (const [m, c] of Object.entries(g.motifCounts || {})) {
      out.motifCounts[m] = (out.motifCounts[m] || 0) + c;
    }
  }
  return out;
}

/* ───────────────────────── tracking over time ───────────────────────── */

/**
 * Exponentially weighted update of a player's tracked scores. Recent games
 * matter more, but a single bad night doesn't erase a month of work.
 *
 * @param previous  { [category]: { score, games } } or null for a new player
 * @param gameScores  output of rubricScores() for the latest game
 * @param halfLifeGames  how many games until an old score carries half weight
 */
export function updatePlayerScores(previous, gameScores, { halfLifeGames = 10 } = {}) {
  const alpha = 1 - Math.pow(0.5, 1 / halfLifeGames);
  const next = {};
  for (const key of CATEGORY_KEYS) {
    const incoming = gameScores[key];
    const prev = previous?.[key];
    if (!incoming || !incoming.measured || incoming.score == null) {
      next[key] = prev ? { ...prev } : { score: null, games: 0, trend: 0, confidence: 'none' };
      continue;
    }
    if (!prev || prev.score == null) {
      next[key] = {
        score: incoming.score, games: 1, trend: 0,
        confidence: incoming.confidence, history: [incoming.score],
      };
      continue;
    }
    const blended = prev.score + alpha * (incoming.score - prev.score);
    const history = [...(prev.history || [prev.score]), Math.round(blended)].slice(-40);
    const ref = history[Math.max(0, history.length - 1 - halfLifeGames)];
    next[key] = {
      score: Math.round(clamp(blended, 0, 100)),
      games: (prev.games || 0) + 1,
      trend: Math.round(blended - ref),
      confidence: incoming.confidence,
      history,
    };
  }
  return next;
}

/* ─────────────────── what the player should work on ─────────────────── */

/** A motif must be this common, and the category this weak, before we say "you keep doing X". */
export const MOTIF_ADVICE_MIN_COUNT = 3;
export const MOTIF_ADVICE_MAX_SCORE = 65;

const MOTIF_ADVICE = {
  fork: { theme: 'Fork', text: 'You are losing material to forks. Before every move, check what a knight or queen lands on that hits two of your pieces.' },
  pin: { theme: 'Pin', text: 'Pieces are getting pinned and then lost. Watch for your king and queen sitting on the same line as an enemy bishop or rook.' },
  skewer: { theme: 'Skewer', text: 'Your major pieces are getting skewered. Avoid lining the king up in front of the queen or a rook.' },
  backRank: { theme: 'Back Rank Mate', text: 'Back-rank problems keep appearing. Make luft early when your rooks leave the back rank.' },
  hangingPiece: { theme: 'Hanging Piece', text: 'Pieces are being left undefended. The one-move check — "is this square attacked?" — costs five seconds and would win you most of these games.' },
  discoveredAttack: { theme: 'Discovered Attack', text: 'Discovered attacks keep catching you. When an enemy piece can move away and reveal a line at your king or queen, treat that line as live.' },
  trappedPiece: { theme: 'Trapped Piece', text: 'Pieces are wandering into squares with no way back. Count escape squares before you commit a knight or bishop deep.' },
  deflection: { theme: 'Deflection', text: 'Defenders are being pulled away. Ask what each of your pieces is defending before you move it.' },
  smotheredMate: { theme: 'Smothered Mate', text: 'Watch the knight-and-queen mating net when your king is boxed in by its own pieces.' },
};

const CATEGORY_ADVICE = {
  openingKnowledge: {
    theme: 'Opening',
    text: 'You are leaving the opening worse than you enter it. Pick one line for White and one for each of e4 and d4 as Black, and play only those for a month.',
  },
  tacticalVision: {
    theme: null,
    text: 'Tactics are the fastest points available to you. Daily puzzles at a difficulty where you get about three in four right.',
  },
  positionalUnderstanding: {
    theme: 'Quiet Move',
    text: 'In positions with nothing forcing, your moves drift. Work on quiet-move puzzles and on naming a plan before each move.',
  },
  endgameTechnique: {
    theme: 'Endgame',
    text: 'Winning positions are not being converted. Drill the basics against the engine: king and pawn, Lucena, Philidor, opposition.',
  },
  timeManagement: {
    theme: null,
    text: 'You are reaching time trouble and then erring. Set a per-move budget: ten seconds on quiet moves buys you two minutes for the critical one.',
  },
  boardVision: {
    theme: 'Hanging Piece',
    text: 'Single-move oversights are costing you material. Before every move: what did my opponent just attack, and what am I leaving undefended?',
  },
  psychologicalResilience: {
    theme: null,
    text: 'Your play falls off sharply once you are behind. Practise playing on from worse positions against the engine — the goal is to make the position complicated, not to resign.',
  },
  notation: {
    theme: null,
    text: 'Notation is scored from scoresheet checks and typed-move drills, not from games.',
  },
};

/**
 * Rank what to fix next, and say it in words a player can act on.
 * Priority = how weak, times how much it matters at club level, times how sure
 * we are. A weak score we barely measured should not outrank a solid one we
 * measured a hundred times.
 */
export function improvementPlan(scores, motifCounts = {}, { limit = 3 } = {}) {
  const confWeight = { high: 1, medium: 0.8, low: 0.5, none: 0 };
  const ranked = CATEGORY_KEYS
    .map((key) => {
      const s = scores[key];
      if (!s || !s.measured || s.score == null) return null;
      return {
        key,
        label: CATEGORY_LABELS[key],
        score: s.score,
        confidence: s.confidence,
        priority: (100 - s.score) * (CATEGORY_LEVERAGE[key] ?? 1) * (confWeight[s.confidence] ?? 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);

  const topMotifs = Object.entries(motifCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  const items = ranked.slice(0, limit).map((r) => {
    // If a specific motif dominates, give the concrete version of the advice.
    // Only give the concrete "this keeps happening to you" version when the
    // motif is genuinely frequent and the category is genuinely weak. Telling a
    // strong player they keep hanging pieces destroys trust in every other number.
    const motifEligible =
      (r.key === 'tacticalVision' || r.key === 'boardVision') &&
      r.score < MOTIF_ADVICE_MAX_SCORE &&
      topMotifs[0] && topMotifs[0][1] >= MOTIF_ADVICE_MIN_COUNT;
    const motif = motifEligible ? topMotifs[0] : null;
    const advice = motif && MOTIF_ADVICE[motif[0]]
      ? { ...MOTIF_ADVICE[motif[0]], occurrences: motif[1] }
      : CATEGORY_ADVICE[r.key];
    return {
      category: r.key,
      label: r.label,
      score: r.score,
      confidence: r.confidence,
      why: advice.text,
      // Feeds straight into the Training page's theme filter.
      practice: advice.theme ? { trainingTheme: advice.theme } : null,
      occurrences: advice.occurrences ?? null,
    };
  });

  return { priorities: items, ranked, topMotifs: topMotifs.map(([m, n]) => ({ motif: m, count: n })) };
}

/**
 * Once ~50 club games are analysed, print what the anchors should become so the
 * club's own median sits at 50. Calibrating to your actual players is worth far
 * more than any constant I can guess at.
 */
export function recalibrationReport(allRawMetrics) {
  const pct = (xs, p) => {
    const s = xs.filter((x) => x != null).sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) * p)] : null;
  };
  const fields = ['openingWinLoss', 'quietWinLoss', 'endgameWinLoss', 'tacticErrorRate',
    'oversightRate', 'timeTroubleRate', 'resilienceDelta'];
  const out = {};
  for (const f of fields) {
    const xs = allRawMetrics.map((m) => m[f]);
    out[f] = { p10: pct(xs, 0.1), p25: pct(xs, 0.25), p50: pct(xs, 0.5), p75: pct(xs, 0.75), p90: pct(xs, 0.9), n: xs.filter((x) => x != null).length };
  }
  return out;
}
