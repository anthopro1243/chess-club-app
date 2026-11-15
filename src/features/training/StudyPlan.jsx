import { VideoLink, LichessLink } from './ResourceLinks.jsx';

/*
 * StudyPlan — the five rows of a player's week, from buildStudyPlan()
 * (src/analysis/studyPlan.js): the one thing to work on, a video to watch,
 * a Lichess link to practise on, their own mistakes to review, and a long
 * game to play. Every row is a statement and a hand-over; the app teaches
 * nothing itself. The same list is on the player's home page and at the top
 * of the Training page.
 */
export default function StudyPlan({ plan, labelledBy }) {
  const { focus, watch, practise, review, play } = plan;
  return (
    <ol className="study-plan" aria-labelledby={labelledBy}>
      <li>
        <span className="plan-step">Work on</span>
        <div className="plan-body">
          <p className="plan-main">{focus.label}</p>
          {focus.line && <p className="muted">{focus.line}</p>}
        </div>
      </li>
      <li>
        <span className="plan-step">Watch</span>
        <div className="plan-body">{watch ? <VideoLink video={watch} /> : <p className="muted">No video for this one yet.</p>}</div>
      </li>
      <li>
        <span className="plan-step">Practise</span>
        <div className="plan-body">
          <LichessLink label={practise.label} url={practise.url} />
          <p className="muted small">{practise.suggestion}</p>
        </div>
      </li>
      <li>
        <span className="plan-step">Review your mistakes</span>
        <div className="plan-body">
          {review.due > 0 ? (
            <a href={review.href}>
              {review.due} {review.due === 1 ? 'position' : 'positions'} from your games to review
            </a>
          ) : (
            <p className="muted">
              {review.active
                ? `Nothing due today. ${review.active} will come back later.`
                : 'Positions you get wrong in your games will show up here.'}
            </p>
          )}
        </div>
      </li>
      <li>
        <span className="plan-step">Play</span>
        <div className="plan-body">
          <p>{play.text}</p>
        </div>
      </li>
    </ol>
  );
}
