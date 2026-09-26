/*
 * playerHome.js — the view model behind a player's own home page.
 *
 * Pure on purpose, like presentation.js: every rule that decides what a
 * teenager is shown about themselves has to be testable without a browser.
 * The page (PlayerHome.jsx) only renders what this returns; it never looks at
 * a raw score.
 *
 * What it assembles, and where each piece comes from:
 *   - the ONE priority: improvementPlan() in scoring.js, read through
 *     playerSummary() in presentation.js. Never a ranked list of failures.
 *   - the trend: the tracked skill rows (player_skill_scores), trend first,
 *     and only for categories confident enough to be shown at all.
 *   - review positions due: the player's own-game puzzles, via the same
 *     spaced-repetition rules the Training page uses.
 *   - homework: only when a list is handed in (the homework feature is being
 *     built separately), so an absent list never renders as "none due".
 *   - recent games: the last few games this player actually played.
 *   - one next step: a single link, so the page ends in an action.
 */

import { CATEGORY_KEYS, CATEGORY_LABELS, improvementPlan } from './scoring.js';
import {
  canViewAnalysis, categoryLine, playerSummary, puzzleThemeFor, trendLabel,
  PUZZLE_THEME_BY_TRAINING_THEME,
} from './presentation.js';
import { reviewSummary } from './spacedRepetition.js';

export const RECENT_GAMES_LIMIT = 5;

/*
 * A tracked score has to have been updated at least this many times before
 * its trend means anything. updatePlayerScores() records trend 0 on the very
 * first game, and "steady" after one game would describe a movement nobody
 * has measured.
 */
export const MIN_GAMES_FOR_TREND = 2;

/** The note notation carries, so it reads "not measurable" rather than "not enough games". */
const NOTATION_NOTE = 'Not measurable from PGN — comes from SAN entry and scoresheet checks.';

/*
 * Only these confidences may ever become a number on a player's screen.
 * describeScore() hides 'low' and 'none'; a stored row with a missing or
 * misspelt confidence would otherwise slip past it and show as a fact. A
 * whitelist, for the same reason canViewAnalysis() is one.
 */
const SHOWABLE_CONFIDENCE = new Set(['medium', 'high']);
const KNOWN_CONFIDENCE = new Set(['none', 'low', 'medium', 'high']);

/*
 * Where a priority with no puzzle theme should send the player. The plan's
 * advice for these categories is about playing (a per-move budget, playing on
 * from worse positions) or about daily mixed puzzles, not a themed drill.
 */
const ACTION_WITHOUT_THEME = Object.freeze({
  tacticalVision: { href: '#/training', label: 'Do some puzzles' },
  timeManagement: { href: '#/play', label: 'Play a game with the clock on' },
  psychologicalResilience: { href: '#/play', label: 'Play on against the engine' },
});

const PUZZLE_THEME_KEYS = new Set(Object.values(PUZZLE_THEME_BY_TRAINING_THEME));

const toTime = (value) => {
  if (value == null || value === '') return null;
  // A bare date means "due by the end of that day", in the viewer's own time
  // zone. new Date('2026-10-01') would read it as UTC midnight, which in
  // Dallas is the evening before, and call homework overdue a day early.
  const text = String(value);
  const t = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T23:59:59`).getTime()
    : new Date(text).getTime();
  return Number.isNaN(t) ? null : t;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The player's side, result and outcome in one game, from their point of view. */
export function gameFromPlayerSide(game, playerId) {
  const asWhite = game.whitePlayerId === playerId;
  const side = asWhite ? 'w' : 'b';
  let outcome = 'unfinished';
  if (game.result === '1/2-1/2') outcome = 'draw';
  else if (game.result === '1-0') outcome = asWhite ? 'win' : 'loss';
  else if (game.result === '0-1') outcome = asWhite ? 'loss' : 'win';
  return {
    side,
    colour: asWhite ? 'White' : 'Black',
    opponent: (asWhite ? game.blackName : game.whiteName) || 'Opponent',
    outcome,
    outcomeLabel: { win: 'Won', loss: 'Lost', draw: 'Draw', unfinished: 'Unfinished' }[outcome],
  };
}

/**
 * Skill rows (analysisStore's shape) for one player, as the scores map that
 * improvementPlan() and presentation.js read. Other players' rows are
 * dropped here, not trusted to have been filtered upstream.
 */
export function scoresFromSkillRows(skillRows = [], playerId) {
  const scores = {};
  const trends = {};
  for (const row of skillRows || []) {
    if (!row || row.playerId !== playerId || !CATEGORY_KEYS.includes(row.category)) continue;
    const score = row.score == null || Number.isNaN(Number(row.score)) ? null : Number(row.score);
    const confidence = KNOWN_CONFIDENCE.has(row.confidence) ? row.confidence : 'none';
    scores[row.category] = {
      score,
      confidence,
      measured: score != null,
      n: row.observations ?? 0,
    };
    if (
      score != null &&
      SHOWABLE_CONFIDENCE.has(confidence) &&
      (row.games ?? 0) >= MIN_GAMES_FOR_TREND &&
      row.trend != null &&
      !Number.isNaN(Number(row.trend))
    ) {
      trends[row.category] = Number(row.trend);
    }
  }
  // Notation is never measured from games. Say so, rather than letting it
  // read as "not enough games yet" and imply more games would fill it in.
  if (!scores.notation) {
    scores.notation = { score: null, confidence: 'none', measured: false, n: 0, note: NOTATION_NOTE };
  }
  return { scores, trends };
}

/** Motif counts summed over this player's own analysed sides. */
export function motifTotals(analyses = []) {
  const totals = {};
  for (const a of analyses) {
    for (const [motif, count] of Object.entries(a.motifCounts || {})) {
      const n = Number(count) || 0;
      if (n > 0) totals[motif] = (totals[motif] || 0) + n;
    }
  }
  return totals;
}

/**
 * One category, trend first. The number (`level`) is present ONLY when
 * presentation.js allows it; a hidden score carries no number at all, so
 * nothing downstream can render one by mistake.
 */
function categoryView(key, entry, trend) {
  const line = categoryLine(key, entry, trend);
  if (!line.showNumber) {
    return {
      key,
      label: line.label,
      showNumber: false,
      level: null,
      trend: null,
      trendText: null,
      text: line.text,
      confidence: line.confidence,
    };
  }
  const movement = trendLabel(trend);
  return {
    key,
    label: line.label,
    showNumber: true,
    level: line.display,
    trend: movement ? Math.round(trend) : null,
    trendText: movement,
    text: line.text,
    confidence: line.confidence,
  };
}

/** The headline trend across every category confident enough to show. */
export function trendOverview(categories) {
  const movers = categories.filter((c) => c.showNumber && c.trend != null);
  if (!movers.length) {
    return { hasTrend: false, headline: null, biggestGain: null, up: 0, steady: 0, down: 0 };
  }
  const up = movers.filter((c) => c.trend > 0);
  const down = movers.filter((c) => c.trend < 0);
  const steady = movers.filter((c) => c.trend === 0);
  const parts = [];
  if (up.length) parts.push(`up in ${plural(up.length, 'area')}`);
  if (steady.length) parts.push(`steady in ${steady.length}`);
  if (down.length) parts.push(`down in ${down.length}`);
  const joined = parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
    : parts[0];
  const best = up.sort((a, b) => b.trend - a.trend)[0] ?? null;
  return {
    hasTrend: true,
    headline: `${joined.charAt(0).toUpperCase()}${joined.slice(1)} over recent games.`,
    // Only the biggest GAIN is singled out. The biggest drop is what the
    // priority is for; naming it again here would be the second verdict.
    biggestGain: best ? { key: best.key, label: best.label, text: `${best.label}, ${best.trendText}` } : null,
    up: up.length,
    steady: steady.length,
    down: down.length,
  };
}

/** Where the priority's "do it now" button goes, or null when nothing fits. */
function priorityAction(priority) {
  const puzzleTheme = puzzleThemeFor(priority.trainingTheme);
  if (puzzleTheme) {
    return {
      href: `#/training?theme=${puzzleTheme}`,
      label: `Practise ${priority.trainingTheme.toLowerCase()} puzzles`,
    };
  }
  return ACTION_WITHOUT_THEME[priority.category] ?? null;
}

/*
 * Only in-app hash routes may come through as a link. The homework list comes
 * from another module, and a stray "javascript:" href rendered into an <a>
 * would run on click.
 */
const safeHref = (href) => (typeof href === 'string' && href.startsWith('#/') ? href : null);

function homeworkHref(item) {
  const own = safeHref(item.href);
  if (own) return own;
  if (item.theme) {
    const key = puzzleThemeFor(item.theme) ?? (PUZZLE_THEME_KEYS.has(item.theme) ? item.theme : null);
    if (key) return `#/training?theme=${key}`;
  }
  return '#/training';
}

/**
 * Homework still to do, soonest first.
 *
 * Expected item shape (the homework feature will adapt to it, or map onto
 * it): { id, title, dueAt (ISO or YYYY-MM-DD), done?, theme?, href?, playerId? }.
 * `theme` may be a training-theme label ("Fork") or a puzzle key ("fork").
 */
export function homeworkView(homework, playerId, now = Date.now()) {
  if (!Array.isArray(homework)) return null;
  const items = homework
    .filter((item) => item && !item.done && (item.playerId == null || item.playerId === playerId))
    .map((item) => {
      const dueTime = toTime(item.dueAt);
      return {
        id: item.id ?? `${item.title}|${item.dueAt}`,
        title: item.title || 'Homework',
        dueAt: item.dueAt ?? null,
        dueTime,
        overdue: dueTime != null && dueTime < now,
        href: homeworkHref(item),
      };
    })
    .sort((a, b) => (a.dueTime ?? Infinity) - (b.dueTime ?? Infinity));
  return {
    items,
    dueCount: items.length,
    overdueCount: items.filter((i) => i.overdue).length,
  };
}

/** The last few games this player played, newest first, with accuracy where analysed. */
export function recentGamesFor(games = [], analyses = [], playerId, limit = RECENT_GAMES_LIMIT) {
  const mine = (games || []).filter(
    (g) => g && playerId && (g.whitePlayerId === playerId || g.blackPlayerId === playerId),
  );
  mine.sort((a, b) => (toTime(b.playedAt) ?? 0) - (toTime(a.playedAt) ?? 0));
  return mine.slice(0, limit).map((game) => {
    const view = gameFromPlayerSide(game, playerId);
    // Only this player's own side, and only a row that says it is theirs:
    // the opponent's accuracy is the opponent's analysis.
    const row = analyses.find(
      (a) => a.gameId === game.id && a.side === view.side && a.playerId === playerId,
    );
    const accuracy = row?.accuracy == null || Number.isNaN(Number(row.accuracy))
      ? null
      : Math.round(Number(row.accuracy));
    return {
      id: game.id,
      date: String(game.playedAt ?? '').slice(0, 10),
      mode: game.mode || 'human',
      ...view,
      analysed: !!row,
      accuracy,
    };
  });
}

/*
 * The single next step. The coach's homework comes first (the engine
 * proposes, the coach disposes), then the plan's drill, then the player's own
 * mistakes due for review, then their games, and a new member is sent to
 * play one.
 */
function nextStepFor({ homework, priority, reviews, gamesCount }) {
  const firstHomework = homework?.items?.[0];
  if (firstHomework) {
    return { href: firstHomework.href, label: `Homework: ${firstHomework.title}`, reason: 'homework' };
  }
  if (priority?.action) {
    return { href: priority.action.href, label: priority.action.label, reason: 'priority' };
  }
  if (reviews.due > 0) {
    return {
      href: '#/training',
      label: `Review ${plural(reviews.due, 'position')} from your games`,
      reason: 'reviews',
    };
  }
  if (gamesCount > 0) return { href: '#/my-games', label: 'Look through your games', reason: 'games' };
  return { href: '#/play', label: 'Play a game', reason: 'new' };
}

/**
 * Build the whole home page for one player.
 *
 * @param {object} input
 * @param {object} input.player     the roster row ({ playerId, name, deletedAt? })
 * @param {object} input.viewer     { role, playerId } — checked with canViewAnalysis()
 * @param {Array}  input.skillRows  analysisStore skill rows (anyone's; filtered here)
 * @param {Array}  input.analyses   analysisStore analysis rows (anyone's; filtered here)
 * @param {Array}  input.games      gamesStore rows (anyone's; filtered here)
 * @param {Array}  input.ownPuzzles ownPuzzleStore rows, in any state (anyone's; filtered here)
 * @param {Array}  [input.homework] optional; absent means "do not show the block"
 * @param {number} [input.now]      epoch ms, injected so tests need not wait
 */
export function buildPlayerHome({
  player,
  viewer,
  skillRows = [],
  analyses = [],
  games = [],
  ownPuzzles = [],
  homework,
  now = Date.now(),
  recentLimit = RECENT_GAMES_LIMIT,
} = {}) {
  const playerId = player?.playerId ?? null;
  if (!playerId) return { available: false, reason: 'no-player' };
  // A retired member keeps their rows (0008), but has no home page to show.
  if (player.deletedAt) return { available: false, reason: 'retired' };
  // Same rule as every analysis view: a player sees their own, staff see all,
  // anyone else sees nothing. Checked here so a wrong prop cannot leak it.
  if (!canViewAnalysis(viewer, playerId)) return { available: false, reason: 'not-allowed' };

  const mineAnalysed = (analyses || []).filter((a) => a && a.playerId === playerId);
  const analysedGameIds = new Set(mineAnalysed.map((a) => a.gameId));

  const { scores, trends } = scoresFromSkillRows(skillRows, playerId);
  const categories = CATEGORY_KEYS.map((key) => categoryView(key, scores[key], trends[key] ?? null));

  /*
   * The priority needs evidence from this player's own analysed games. With
   * none in hand there is nothing to base one on, and a coach's manual rubric
   * is deliberately not consulted: it is the coach's judgement, shown on the
   * Roster page, not an engine finding to lecture the player with.
   *
   * Only categories confident enough to be SHOWN may become the priority.
   * improvementPlan() down-weights a low-confidence score but can still rank
   * it first, and "work on endgame technique" beside "endgame technique: not
   * enough games yet" tells a player two contradictory things.
   */
  let priority = null;
  if (mineAnalysed.length) {
    const confident = Object.fromEntries(
      Object.entries(scores).filter(([, entry]) => SHOWABLE_CONFIDENCE.has(entry.confidence)),
    );
    const plan = improvementPlan(confident, motifTotals(mineAnalysed));
    const summary = playerSummary(scores, plan, trends);
    const top = plan.priorities[0];
    if (summary.priority && top) {
      priority = {
        category: summary.priority.category,
        label: summary.priority.label ?? CATEGORY_LABELS[summary.priority.category],
        // improvementPlan() words its advice as `why`; playerSummary() reads
        // `advice`, which the plan never sets, so take the words from the plan.
        advice: summary.priority.advice ?? top.why ?? null,
        trainingTheme: summary.priority.trainingTheme,
      };
      priority.action = priorityAction(priority);
    }
  }

  const mineGames = (games || []).filter(
    (g) => g && (g.whitePlayerId === playerId || g.blackPlayerId === playerId),
  );
  const minePuzzles = (ownPuzzles || []).filter((p) => p && p.playerId === playerId);
  const review = reviewSummary(minePuzzles, now);
  const reviews = {
    due: review.due,
    active: review.active,
    nextDueAt: review.nextDueAt,
    href: '#/training',
  };

  const homeworkBlock = homeworkView(homework, playerId, now);
  const recentGames = recentGamesFor(mineGames, mineAnalysed, playerId, recentLimit);

  return {
    available: true,
    playerId,
    name: player.name || '',
    isNewMember: mineGames.length === 0 && mineAnalysed.length === 0,
    gamesCount: mineGames.length,
    analysedCount: analysedGameIds.size,
    priority,
    trend: trendOverview(categories),
    categories,
    measuredCount: categories.filter((c) => c.showNumber).length,
    reviews,
    homework: homeworkBlock,
    recentGames,
    nextStep: nextStepFor({ homework: homeworkBlock, priority, reviews, gamesCount: mineGames.length }),
  };
}
