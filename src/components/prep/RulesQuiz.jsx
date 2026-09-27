import { useRef, useState } from 'react';
import { RULES_QUESTIONS, scoreRulesQuiz, rulesPassScore } from '../../data/rulesQuiz.js';
import { recordPrepResult, usePrepResult } from '../../data/prepResultsStore.js';
import { formatDate, chicagoDate } from '../../data/officialEvents.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/**
 * RulesQuiz — tournament rules and etiquette, one question at a time (F041).
 *
 * Each answer is explained straight away, with the rule it comes from, so the
 * quiz teaches as it tests. 80% or better marks the player "rules ready" for
 * the readiness checklist.
 */
export default function RulesQuiz({ player }) {
  const [stage, setStage] = useState('intro'); // intro | question | done
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [outcome, setOutcome] = useState(null);
  const startedAt = useRef(0);
  const record = usePrepResult(player?.playerId, 'rules-quiz');

  const total = RULES_QUESTIONS.length;
  const need = rulesPassScore(total);
  const question = RULES_QUESTIONS[index];
  const chosen = question ? answers[question.id] : undefined;
  const answered = Number.isInteger(chosen);

  const start = () => {
    setAnswers({});
    setIndex(0);
    setOutcome(null);
    startedAt.current = Date.now();
    setStage('question');
  };

  const finish = (finalAnswers) => {
    const result = scoreRulesQuiz(finalAnswers);
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    const saved = player ? recordPrepResult(player.playerId, 'rules-quiz', { score: result.correct, total, seconds }) : null;
    setOutcome({ ...result, seconds, saved: !!saved });
    setStage('done');
  };

  const next = () => {
    if (index + 1 < total) setIndex(index + 1);
    else finish(answers);
  };

  return (
    <section className="panel prep-quiz">
      <div className="panel-header">
        <h2>Rules &amp; etiquette quiz</h2>
        {record?.best && (
          <span className={`badge ${record.passedAt ? 'prep-badge-good' : ''}`}>
            Best {record.best.score}/{record.best.total}
            {record.passedAt ? ' · rules ready' : ''}
          </span>
        )}
      </div>

      {stage === 'intro' && (
        <>
          <p>
            {total} questions on US Chess scholastic rules: touch-move, illegal moves, scorekeeping, phones,
            coaching, draws and what to do when something goes wrong. {need} right ({Math.round((need / total) * 100)}%)
            marks you <strong>rules ready</strong>.
          </p>
          <p className="prep-note">
            Rule numbers are from the US Chess Official Rules of Chess (7th edition) and the US Chess National
            Scholastic Regulations. Local events can differ: the tournament director&rsquo;s announcements on the
            day always win.
          </p>
          {record?.passedAt && (
            <p className="prep-alert good">
              Passed on {formatDate(chicagoDate(record.passedAt))}. Retaking it can only help.
            </p>
          )}
          <div className="prep-actions">
            <button type="button" className="prep-btn primary" onClick={start}>
              {record ? 'Take it again' : 'Start the quiz'}
            </button>
          </div>
        </>
      )}

      {stage === 'question' && question && (
        <>
          <p className="prep-note">
            Question {index + 1} of {total}
          </p>
          <div className="prep-progress" aria-hidden="true">
            <span style={{ width: `${(index / total) * 100}%` }} />
          </div>
          <p className="prep-quiz-prompt">{question.prompt}</p>
          <ol className="prep-options">
            {question.options.map((option, i) => {
              const state = !answered ? '' : i === question.answer ? 'right' : i === chosen ? 'wrong' : 'dim';
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={`prep-option ${state}`}
                    disabled={answered}
                    aria-pressed={chosen === i}
                    onClick={() => setAnswers((a) => ({ ...a, [question.id]: i }))}
                  >
                    <span className="prep-option-letter">{LETTERS[i]}</span>
                    <span>{option}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {answered && (
            <div className={`prep-explain ${chosen === question.answer ? 'right' : 'wrong'}`} role="status">
              <strong>{chosen === question.answer ? 'Right.' : `Not quite — the answer is ${LETTERS[question.answer]}.`}</strong>{' '}
              {question.explanation}
              <span className="prep-rule-cite">Rule: {question.rule}</span>
            </div>
          )}
          <div className="prep-actions">
            <button type="button" className="prep-btn primary" disabled={!answered} onClick={next}>
              {index + 1 < total ? 'Next question' : 'See my score'}
            </button>
          </div>
        </>
      )}

      {stage === 'done' && outcome && (
        <>
          <p className="big-number">
            {outcome.correct}
            <span> / {outcome.total} right</span>
          </p>
          <p className={`prep-alert ${outcome.passed ? 'good' : 'warn'}`}>
            {outcome.passed
              ? 'Rules ready. Well done.'
              : `${need} right is the bar. Have another go once you have read the explanations below.`}
          </p>
          <p className="prep-note">
            {outcome.saved
              ? `Saved to ${player.name}'s record.`
              : 'Practice only: this result was not saved to anyone.'}
          </p>
          {outcome.review.some((r) => !r.correct) && (
            <>
              <h3>To look at again</h3>
              <ul className="prep-plain-list prep-review">
                {outcome.review
                  .filter((r) => !r.correct)
                  .map((r) => {
                    const q = RULES_QUESTIONS.find((x) => x.id === r.id);
                    return (
                      <li key={r.id}>
                        <strong>{q.prompt}</strong>
                        <br />
                        {q.options[q.answer]} <span className="prep-rule-cite">({q.rule})</span>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
          <div className="prep-actions">
            <button type="button" className="prep-btn primary" onClick={start}>
              Try again
            </button>
            <button type="button" className="prep-btn" onClick={() => setStage('intro')}>
              Done
            </button>
          </div>
        </>
      )}
    </section>
  );
}
