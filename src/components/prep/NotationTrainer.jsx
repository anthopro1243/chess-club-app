import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from '../../engine/chess.js';
import Board from '../Board.jsx';
import PromotionDialog from '../PromotionDialog.jsx';
import {
  SAMPLE_GAMES,
  SKILL_POSITIONS,
  buildGameDrill,
  buildSkillsDrill,
  gradeTypedSan,
  gradePlayedMove,
  shuffle,
  summariseDrill,
} from '../../data/notationTrainer.js';
import { NOTATION_GAME_PLIES, NOTATION_PASS_ACCURACY, DRILLS, isPassing } from '../../data/prepResults.js';
import { recordPrepResult, usePrepResults } from '../../data/prepResultsStore.js';

const MODES = [
  { id: 'type', label: 'Write the move', hint: 'A move is shown on the board. Write it as it goes on a scoresheet.' },
  { id: 'play', label: 'Play the move', hint: 'A move is written. Play it on the board.' },
];

const SOURCES = [
  { id: 'skills', label: `Skills: ${SKILL_POSITIONS.length} positions` },
  ...SAMPLE_GAMES.map((g) => ({ id: g.id, label: `40-move game: ${g.title}` })),
];

/** Keys that are awkward on a phone keyboard, one tap each. */
const QUICK_KEYS = ['K', 'Q', 'R', 'B', 'N', 'x', '+', '#', '=', 'O-O', 'O-O-O'];

const drillKey = (source, mode) => `notation-${source === 'skills' ? 'skills' : 'game'}-${mode}`;

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function buildSteps(source) {
  if (source === 'skills') return shuffle(buildSkillsDrill());
  const game = SAMPLE_GAMES.find((g) => g.id === source) || SAMPLE_GAMES[0];
  return buildGameDrill(game, NOTATION_GAME_PLIES);
}

/**
 * NotationTrainer — read and write algebraic notation (F033).
 *
 * Two directions: see a move and write it, or read a move and play it. The
 * readiness bar is the "write" drill on a whole 40-move game at 95% or
 * better, because recording a real game is what a tournament asks for.
 * Timed, so a player can see themselves getting quicker, which matters
 * under a G/30 clock.
 */
export default function NotationTrainer({ player }) {
  const [mode, setMode] = useState('type');
  const [source, setSource] = useState('skills');
  const [run, setRun] = useState(null); // { steps, index, results, answers, startedAt, feedback }
  const [finished, setFinished] = useState(null);
  const results = usePrepResults();

  const bestFor = (key) =>
    player ? results.find((r) => r.playerId === player.playerId && r.drill === key) || null : null;
  const gameRecord = bestFor('notation-game-type');

  const start = () => {
    setFinished(null);
    setRun({ steps: buildSteps(source), index: 0, results: [], answers: [], startedAt: Date.now(), feedback: null });
  };

  const finish = (state) => {
    const seconds = (Date.now() - state.startedAt) / 1000;
    const summary = summariseDrill(state.results, seconds);
    const key = drillKey(source, mode);
    const saved = player ? recordPrepResult(player.playerId, key, summary) : null;
    setFinished({ ...summary, key, saved: !!saved, passed: isPassing(key, summary) });
    setRun(null);
  };

  if (run) {
    return (
      <DrillRunner
        run={run}
        mode={mode}
        isGame={source !== 'skills'}
        onAnswer={(correct, answer, feedback) =>
          setRun((r) => ({ ...r, results: [...r.results, correct], answers: [...r.answers, answer], feedback }))
        }
        onNext={() => {
          if (run.index + 1 >= run.steps.length) finish(run);
          else setRun((r) => ({ ...r, index: r.index + 1, feedback: null }));
        }}
        onQuit={() => setRun(null)}
      />
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Notation trainer</h2>
        {gameRecord?.best && (
          <span className={`badge ${gameRecord.passedAt ? 'prep-badge-good' : ''}`}>
            40-move game: best {Math.round(gameRecord.best.accuracy * 100)}%
            {gameRecord.passedAt ? ' · ready' : ''}
          </span>
        )}
      </div>
      <p className="prep-note">
        Scoresheets are evidence: a draw or time claim is decided from them. The readiness bar is writing a
        40-move game at {Math.round(NOTATION_PASS_ACCURACY * 100)}% or better.
      </p>

      <div className="prep-form">
        <div className="field">
          <span>Mode</span>
          <div className="prep-choice prep-choice-2" role="group" aria-label="Mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`prep-choice-btn ${mode === m.id ? 'on on-coach' : ''}`}
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Drill</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint-text">{MODES.find((m) => m.id === mode).hint}</p>

      <div className="prep-actions">
        <button type="button" className="prep-btn primary" onClick={start}>
          Start
        </button>
      </div>

      {finished && (
        <div className={`prep-alert ${finished.passed ? 'good' : finished.accuracy >= NOTATION_PASS_ACCURACY ? 'good' : 'warn'}`}>
          <strong>
            {finished.score} / {finished.total} ({Math.round(finished.accuracy * 100)}%) in {clock(finished.seconds)}.
          </strong>{' '}
          {finished.passed
            ? 'That meets the readiness bar.'
            : finished.key === 'notation-game-type'
              ? `The bar is ${Math.round(NOTATION_PASS_ACCURACY * 100)}% over a whole 40-move game.`
              : 'Practice counts. The readiness bar is the 40-move game in "Write the move" mode.'}{' '}
          {finished.saved ? `Saved to ${player.name}'s record.` : 'Practice only: not saved.'}
        </div>
      )}

      {player && (
        <>
          <h3>Best so far</h3>
          <ul className="prep-plain-list">
            {Object.entries(DRILLS)
              .filter(([key]) => key.startsWith('notation-'))
              .map(([key, label]) => {
                const r = bestFor(key);
                return (
                  <li key={key}>
                    {label}:{' '}
                    {r?.best
                      ? `${r.best.score}/${r.best.total} (${Math.round(r.best.accuracy * 100)}%)${
                          r.best.seconds != null ? ` in ${clock(r.best.seconds)}` : ''
                        } · ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}`
                      : 'not tried yet'}
                  </li>
                );
              })}
          </ul>
        </>
      )}
    </section>
  );
}

function DrillRunner({ run, mode, isGame, onAnswer, onNext, onQuit }) {
  const step = run.steps[run.index];
  const answered = run.results.length > run.index;
  const [typed, setTyped] = useState('');
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef(null);
  const nextRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - run.startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [run.startedAt]);

  useEffect(() => {
    setTyped('');
    setPendingPromotion(null);
    if (mode === 'type') inputRef.current?.focus();
  }, [run.index, mode]);

  useEffect(() => {
    if (answered) nextRef.current?.focus();
  }, [answered]);

  const game = useMemo(() => new Chess(step.fen), [step.fen]);
  const orientation = isGame ? 'w' : step.color;
  const correctSoFar = run.results.filter(Boolean).length;

  const submitTyped = (e) => {
    e?.preventDefault();
    if (answered) {
      onNext();
      return;
    }
    const verdict = gradeTypedSan(step.fen, step.san, typed);
    onAnswer(verdict.correct, typed.trim(), verdict);
  };

  const handleBoardMove = ({ from, to }) => {
    if (answered) return;
    const options = game.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!options.length) return;
    if (options[0].promotion) {
      setPendingPromotion({ from, to, color: options[0].color });
      return;
    }
    playMove({ from, to });
  };

  const playMove = (move) => {
    const verdict = gradePlayedMove(step.fen, step.san, move);
    onAnswer(verdict.correct, verdict.playedSan || '', {
      correct: verdict.correct,
      message: verdict.correct ? 'Correct.' : `You played ${verdict.playedSan}. ${step.san} goes ${step.from} to ${step.to}.`,
      canonical: verdict.canonical,
    });
  };

  const addKey = (key) => {
    setTyped((t) => (key.startsWith('O-O') ? key : t + key));
    inputRef.current?.focus();
  };

  // In "write" mode the move to write is highlighted; in "play" mode the
  // squares are only revealed once the player has had their go.
  const highlight = mode === 'type' || answered ? { from: step.from, to: step.to } : null;
  const sideToMove = step.color === 'w' ? 'White' : 'Black';

  return (
    <section className="panel prep-drill">
      <div className="panel-header">
        <h2>
          {isGame ? `Move ${step.label}` : step.category} <span className="prep-note">({run.index + 1} of {run.steps.length})</span>
        </h2>
        <span className="badge mono">
          {correctSoFar}/{run.results.length} · {clock(elapsed)}
        </span>
      </div>
      <div className="prep-progress" aria-hidden="true">
        <span style={{ width: `${(run.index / run.steps.length) * 100}%` }} />
      </div>

      <div className="prep-drill-layout">
        <div className="prep-drill-board">
          <Board
            game={game}
            orientation={orientation}
            lastMove={highlight}
            interactive={mode === 'play' && !answered}
            onMove={handleBoardMove}
          />
        </div>

        <div className="prep-drill-side">
          {mode === 'type' ? (
            <>
              <p className="prep-quiz-prompt">
                {sideToMove} to move. The highlighted piece moves to the other highlighted square. Write it.
              </p>
              <form className="prep-san-form" onSubmit={submitTyped}>
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={answered}
                  aria-label="Your move in notation"
                  placeholder="e.g. Nf3"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="prep-san-input mono"
                />
                {!answered && (
                  <button type="submit" className="prep-btn primary">
                    Check
                  </button>
                )}
              </form>
              {!answered && (
                <div className="prep-quick-keys" aria-label="Quick keys">
                  {QUICK_KEYS.map((k) => (
                    <button key={k} type="button" className="prep-key mono" onClick={() => addKey(k)}>
                      {k}
                    </button>
                  ))}
                  <button type="button" className="prep-key" onClick={() => setTyped((t) => t.slice(0, -1))}>
                    ⌫
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="prep-quiz-prompt">
              Play <span className="prep-san-big mono">{isGame ? `${step.label} ` : ''}{step.san}</span>
            </p>
          )}

          {answered && run.feedback && (
            <div className={`prep-explain ${run.feedback.correct ? 'right' : 'wrong'}`} role="status">
              <strong>{run.feedback.correct ? 'Correct.' : 'Not quite.'}</strong>{' '}
              {!run.feedback.correct && run.feedback.message}
            </div>
          )}

          <div className="prep-actions">
            {answered && (
              <button ref={nextRef} type="button" className="prep-btn primary" onClick={onNext}>
                {run.index + 1 >= run.steps.length ? 'Finish' : 'Next'}
              </button>
            )}
            <button type="button" className="prep-btn" onClick={onQuit}>
              Stop
            </button>
          </div>

          {isGame && run.index > 0 && <MiniScoresheet steps={run.steps} results={run.results} upTo={run.results.length} />}
        </div>
      </div>

      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onChoose={(piece) => {
            const move = { from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece };
            setPendingPromotion(null);
            playMove(move);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </section>
  );
}

/** The game so far, written as a scoresheet, with the moves the player missed marked. */
function MiniScoresheet({ steps, results, upTo }) {
  const rows = [];
  for (let i = 0; i < upTo; i += 2) {
    rows.push({ n: steps[i].moveNumber, white: i, black: i + 1 < upTo ? i + 1 : null });
  }
  const recent = rows.slice(-6);
  return (
    <ol className="prep-scoresheet mono" aria-label="Your scoresheet so far">
      {recent.map((row) => (
        <li key={row.n}>
          <span className="prep-sheet-n">{row.n}.</span>
          <span className={results[row.white] ? '' : 'miss'}>{steps[row.white].san}</span>
          <span className={row.black != null && !results[row.black] ? 'miss' : ''}>
            {row.black != null ? steps[row.black].san : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}
