import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from '../engine/chess.js';
import Board from '../components/Board.jsx';
import PromotionDialog from '../components/PromotionDialog.jsx';
import InfoTooltip from '../components/InfoTooltip.jsx';
import { PUZZLES, PUZZLE_THEMES } from '../data/puzzles.js';
import { usePlayers, recordPuzzleSolved, recordRatingResult } from '../data/rosterStore.js';
import {
  recordAttempt,
  useAttempts,
  useThemeAccuracy,
  attemptSummary,
} from '../data/puzzleAttemptsStore.js';

const TRAINEE_KEY = 'cc-trainee';
const PUZZLE_OPPONENT_RD = 60; // puzzle ratings are well-established; treat them as near-certain

const DIFFICULTIES = [
  { key: '', label: 'All difficulties', test: () => true },
  { key: 'beginner', label: 'Beginner (< 1000)', test: (r) => r < 1000 },
  { key: 'easy', label: 'Easy (1000–1400)', test: (r) => r >= 1000 && r < 1400 },
  { key: 'intermediate', label: 'Intermediate (1400–1800)', test: (r) => r >= 1400 && r < 1800 },
  { key: 'hard', label: 'Hard (1800–2200)', test: (r) => r >= 1800 && r < 2200 },
  { key: 'expert', label: 'Expert (2200+)', test: (r) => r >= 2200 },
];

const prettyTheme = (theme) =>
  theme
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\b(In|Vs)\b/g, (w) => w.toLowerCase());

/** Which difficulty band a puzzle rating falls in, for the attempt record. */
const bandFor = (rating) => DIFFICULTIES.find((d) => d.key && d.test(rating))?.key || '';

const sameMove = (a, b) =>
  !!a && !!b && a.from === b.from && a.to === b.to && (a.promotion || undefined) === (b.promotion || undefined);

/**
 * TrainingPage — a puzzle trainer over real tactics from Lichess's open
 * puzzle database (src/data/puzzles.js). Each puzzle is a forced line, not
 * just a single mating move: the trainee's move is checked against the
 * recorded solution, the opponent's reply is played automatically, and the
 * puzzle is solved once the whole line has been played out.
 */
export default function TrainingPage() {
  // A player arriving from their improvement plan lands pre-filtered to the
  // theme it named, rather than on all 402 puzzles with advice to remember.
  const [themeFilter, setThemeFilter] = useState(() => {
    try {
      const query = window.location.hash.split('?')[1];
      const wanted = query ? new URLSearchParams(query).get('theme') : null;
      return wanted && PUZZLE_THEMES.includes(wanted) ? wanted : '';
    } catch {
      return '';
    }
  });
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const difficultyTest = DIFFICULTIES.find((d) => d.key === difficultyFilter)?.test ?? (() => true);
  const filtered = useMemo(
    () =>
      PUZZLES.filter((p) => (themeFilter ? p.themes.includes(themeFilter) : true) && difficultyTest(p.rating)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeFilter, difficultyFilter],
  );

  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [themeFilter, difficultyFilter]);
  // Some theme + difficulty combinations have no puzzles at all — fall back
  // to a harmless placeholder so every hook below still has a real puzzle
  // to work with; the empty case is handled in the render instead.
  const puzzle = filtered.length ? filtered[Math.min(index, filtered.length - 1)] : PUZZLES[0];

  const gameRef = useRef(new Chess(puzzle.fen));
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [solutionIndex, setSolutionIndex] = useState(0);
  const [result, setResult] = useState(null); // 'solved' | 'wrong' | null
  const [showHint, setShowHint] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [sessionSolved, setSessionSolved] = useState(() => new Set());

  // When the current attempt began. A wrong move ends one attempt and starts
  // another, so this is reset there too, not only when the puzzle changes.
  const attemptStartRef = useRef(Date.now());

  const resetBoard = useCallback(
    (p) => {
      gameRef.current = new Chess(p.fen);
      setSolutionIndex(0);
      setResult(null);
      setShowHint(false);
      setPendingPromotion(null);
      attemptStartRef.current = Date.now();
      bump();
    },
    [bump],
  );

  // Whenever the active puzzle actually changes — theme filter, next/prev,
  // random — reset the board. Keyed on id rather than index so a filter
  // change (which can leave `index` at 0 while pointing at a new puzzle)
  // still resets correctly.
  useEffect(() => {
    resetBoard(puzzle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id]);

  const players = usePlayers();
  const [traineeId, setTraineeId] = useState(() => {
    try {
      return localStorage.getItem(TRAINEE_KEY) || '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(TRAINEE_KEY, traineeId);
    } catch {
      /* storage can be unavailable; the selection still holds for this visit */
    }
  }, [traineeId]);

  const trainee = players.find((p) => p.playerId === traineeId) || null;
  const solvedIds = useMemo(
    () => (trainee ? new Set(trainee.puzzleStats?.solvedIds || []) : sessionSolved),
    [trainee, sessionSolved],
  );
  const solvedInFilter = filtered.filter((p) => solvedIds.has(p.id)).length;

  const attempts = useAttempts();
  const summary = attemptSummary(attempts, traineeId);
  const weakestThemes = useThemeAccuracy(traineeId).slice(0, 3);

  /*
   * Write down what just happened. Called for every outcome, including the
   * wrong ones — a failed attempt is the more useful record of the two, and
   * the old code threw it away.
   *
   * Nothing is logged in practice mode, because an attempt with no player
   * attached cannot tell anyone anything later.
   */
  const logAttempt = ({ correct, usedSolution = false }) => {
    if (!trainee) return;
    recordAttempt({
      playerId: trainee.playerId,
      puzzleId: puzzle.id,
      themes: puzzle.themes || [],
      difficulty: bandFor(puzzle.rating),
      puzzleRating: puzzle.rating,
      correct,
      usedHint: showHint,
      usedSolution,
      secondsTaken: Math.max(0, Math.round((Date.now() - attemptStartRef.current) / 1000)),
    });
    attemptStartRef.current = Date.now();
  };

  const loadPuzzle = useCallback(
    (nextIndex) => {
      if (!filtered.length) return;
      setIndex((nextIndex + filtered.length) % filtered.length);
    },
    [filtered.length],
  );

  const randomPuzzle = () => loadPuzzle(Math.floor(Math.random() * filtered.length));

  const game = gameRef.current;
  const orientation = useMemo(() => new Chess(puzzle.fen).turn, [puzzle.fen]);

  const attemptMove = ({ from, to, promotion }) => {
    const played = game.move({ from, to, promotion });
    if (!played) return;

    const expected = puzzle.solution[solutionIndex];
    if (!sameMove(played, expected)) {
      logAttempt({ correct: false });
      setResult('wrong');
      bump();
      setTimeout(() => {
        game.undo();
        setResult(null);
        bump();
      }, 700);
      return;
    }

    const nextIndex = solutionIndex + 1;
    if (nextIndex >= puzzle.solution.length) {
      setSolutionIndex(nextIndex);
      setResult('solved');
      logAttempt({ correct: true });
      if (trainee) {
        recordPuzzleSolved(trainee.playerId, puzzle.id);
        recordRatingResult(trainee.playerId, {
          opponentRating: puzzle.rating,
          opponentRd: PUZZLE_OPPONENT_RD,
          score: 1,
          source: 'puzzle',
          detail: `Solved ${puzzle.name} (${puzzle.rating})`,
        });
      } else {
        setSessionSolved((prev) => new Set(prev).add(puzzle.id));
      }
      bump();
      return;
    }

    setSolutionIndex(nextIndex);
    bump();

    // Auto-play the opponent's forced reply.
    setTimeout(() => {
      game.move(puzzle.solution[nextIndex]);
      setSolutionIndex(nextIndex + 1);
      bump();
    }, 500);
  };

  const handleMove = ({ from, to }) => {
    if (result === 'solved') return;
    const options = game.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (options.length === 0) return;
    if (options[0].promotion) {
      setPendingPromotion({ from, to, color: options[0].color });
      return;
    }
    attemptMove({ from, to });
  };

  const completePromotion = (type) => {
    const move = { ...pendingPromotion, promotion: type };
    setPendingPromotion(null);
    attemptMove(move);
  };

  const reveal = () => {
    for (let i = solutionIndex; i < puzzle.solution.length; i += 1) {
      game.move(puzzle.solution[i]);
    }
    setSolutionIndex(puzzle.solution.length);
    setResult('solved');
    logAttempt({ correct: false, usedSolution: true });
    if (trainee) {
      recordRatingResult(trainee.playerId, {
        opponentRating: puzzle.rating,
        opponentRd: PUZZLE_OPPONENT_RD,
        score: 0,
        source: 'puzzle',
        detail: `Revealed ${puzzle.name} (${puzzle.rating})`,
      });
    }
    bump();
  };

  const waitingOnOpponent = result === null && solutionIndex > 0 && game.turn !== orientation && solutionIndex < puzzle.solution.length;

  return (
    <div className="training-layout">
      <section className="board-column">
        {filtered.length === 0 ? (
          <div className="panel-block">
            <h2>No puzzles match</h2>
            <p className="hint-text">
              No puzzles fit both that theme and that difficulty. Try a different combination.
            </p>
          </div>
        ) : (
          <>
            <div className={`puzzle-banner ${result || ''}`}>
              <div>
                <span className="puzzle-counter mono">
                  {index + 1} / {filtered.length}
                </span>
                <strong>{puzzle.name}</strong>
                <span className="puzzle-rating mono">{puzzle.rating}</span>
              </div>
              <span className="puzzle-prompt">
                {result === 'solved'
                  ? 'Solved'
                  : result === 'wrong'
                    ? 'Not the move. Try again.'
                    : waitingOnOpponent
                      ? 'Opponent is replying…'
                      : `${orientation === 'w' ? 'White' : 'Black'} to play`}
              </span>
            </div>

            <Board
              game={game}
              orientation={orientation}
              onMove={handleMove}
              interactive={result !== 'solved' && !waitingOnOpponent}
            />

            <div className="puzzle-controls">
              <button type="button" onClick={() => loadPuzzle(index - 1)}>
                &lsaquo; Previous
              </button>
              <button type="button" onClick={() => resetBoard(puzzle)}>
                Reset
              </button>
              <button type="button" onClick={randomPuzzle}>
                Random
              </button>
              <button type="button" onClick={() => setShowHint(true)} disabled={showHint}>
                Hint
              </button>
              <button type="button" onClick={reveal} disabled={result === 'solved'}>
                Show answer
              </button>
              <button type="button" className="primary" onClick={() => loadPuzzle(index + 1)}>
                Next &rsaquo;
              </button>
            </div>

            {showHint && <p className="hint-box">{puzzle.hint}</p>}
          </>
        )}
      </section>

      <aside className="side-panel">
        <div className="panel-block">
          <h2>
            Trainee
            <InfoTooltip>Pick a trainee and solved puzzles count toward their rating and record.</InfoTooltip>
          </h2>
          <select
            className="trainee-select"
            value={traineeId}
            onChange={(event) => setTraineeId(event.target.value)}
          >
            <option value="">Practice only</option>
            {players.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="panel-block">
          <h2>Puzzle type</h2>
          <label className="field">
            <span>Theme</span>
            <select value={themeFilter} onChange={(event) => setThemeFilter(event.target.value)}>
              <option value="">All themes</option>
              {PUZZLE_THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {prettyTheme(theme)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Difficulty</span>
            <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}>
              {DIFFICULTIES.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <p className="hint-text">{filtered.length} puzzles match.</p>
        </div>

        <div className="panel-block">
          <h2>{trainee ? `${trainee.name}'s progress` : 'Progress this session'}</h2>
          <p className="big-number">
            {solvedInFilter}
            <span> / {filtered.length} solved{themeFilter ? ` (${prettyTheme(themeFilter)})` : ''}</span>
          </p>

          {trainee && summary.attempts > 0 && (
            <p className="hint-text">
              {summary.attempts} attempt{summary.attempts === 1 ? '' : 's'} ·{' '}
              {Math.round(summary.accuracy * 100)}% right
              {summary.medianSeconds != null ? ` · ${summary.medianSeconds}s typical` : ''}
            </p>
          )}
        </div>

        {trainee && weakestThemes.length > 0 && (
          <div className="panel-block">
            <h2>
              Weakest themes
              <InfoTooltip>
                Measured from actual attempts, worst first. Themes with fewer than three
                attempts are left out, since one guess proves nothing.
              </InfoTooltip>
            </h2>
            <ol className="priority-list">
              {weakestThemes.map((row, index) => (
                <li key={row.theme}>
                  <span className="priority-rank">{index + 1}</span>
                  <span className="priority-label">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setThemeFilter(row.theme)}
                    >
                      {prettyTheme(row.theme)}
                    </button>
                  </span>
                  <span className="mono">
                    {Math.round(row.accuracy * 100)}% of {row.attempts}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

      </aside>

      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onChoose={completePromotion}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </div>
  );
}
