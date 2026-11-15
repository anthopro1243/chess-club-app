import ExternalLink from '../../ui/ExternalLink.jsx';
import Icon from '../../ui/Icon.jsx';
import { shortTitle, videoMeta } from './ResourceLinks.jsx';

/*
 * StudyPlan — the five rows of a player's week, from buildStudyPlan()
 * (src/analysis/studyPlan.js): the one thing to work on, a video to watch,
 * a Lichess link to practise on, their own mistakes to review, and a long
 * game to play. Every row is a statement and a hand-over; the app teaches
 * nothing itself. The same list is on the player's home page and at the top
 * of the Training page.
 *
 * Exactly one primary button: reviewing when mistakes are due, otherwise Watch.
 */

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1).replace(/\.$/, '');

function PlanRow({ icon, label, title, meta, action }) {
  return (
    <li className="plan-row">
      <span className="plan-icon">
        <Icon name={icon} size={20} />
      </span>
      <div className="plan-text">
        <span className="plan-eyebrow">{label}</span>
        <p className="plan-title">{title}</p>
        {meta && <p className="plan-meta">{meta}</p>}
      </div>
      {action && <div className="plan-action">{action}</div>}
    </li>
  );
}

export default function StudyPlan({ plan, labelledBy }) {
  const { focus, watch, practise, review, play } = plan;
  const reviewDue = review.due > 0;
  return (
    <ol className="study-plan" aria-labelledby={labelledBy}>
      <li className="plan-focus">
        <span className="plan-eyebrow">Work on</span>
        <p className="plan-main">{focus.label}</p>
        {focus.line && <p className="plan-line">{focus.line}</p>}
      </li>

      {watch ? (
        <PlanRow
          icon="play"
          label="Watch"
          title={shortTitle(watch)}
          meta={videoMeta(watch)}
          action={
            <ExternalLink href={watch.url} className={`btn btn-sm${reviewDue ? '' : ' btn-primary'}`}>
              Watch<span className="sr-only"> {shortTitle(watch)}</span> on YouTube
            </ExternalLink>
          }
        />
      ) : (
        <PlanRow icon="play" label="Watch" title="No video for this one yet" />
      )}

      <PlanRow
        icon="target"
        label="Practise"
        title={practise.label}
        meta={`Lichess · ${lowerFirst(practise.suggestion)}`}
        action={
          <ExternalLink href={practise.url} className="btn btn-sm">
            Open<span className="sr-only"> {practise.label}</span> on Lichess
          </ExternalLink>
        }
      />

      {reviewDue ? (
        <PlanRow
          icon="refresh"
          label="Review your mistakes"
          title={`${review.due} ${review.due === 1 ? 'position' : 'positions'} from your games`}
          meta="Positions you got wrong, ready to try again."
          action={
            <a className="btn btn-sm btn-primary" href={review.href}>
              Review now
              <span className="sr-only"> {review.due} {review.due === 1 ? 'position' : 'positions'}</span>
            </a>
          }
        />
      ) : (
        <PlanRow
          icon="check"
          label="Review your mistakes"
          title="Nothing to review right now"
          meta={
            review.active
              ? `${review.active} will come back later.`
              : 'Positions you get wrong in your games will show up here.'
          }
        />
      )}

      <li className="plan-quiet">
        <span className="plan-eyebrow">Play</span>
        <p>{play.text}</p>
      </li>
    </ol>
  );
}
