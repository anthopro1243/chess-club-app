import { useMemo, useState } from 'react';
import { formatDate, resolveDeadlines } from '../../data/officialEvents.js';
import {
  POLL_ANSWERS,
  ANSWER_LABEL,
  TRANSPORT_NOTE_MAX,
  answersForEvent,
  summarisePoll,
} from '../../data/availabilityPoll.js';
import { useEventAvailability, setAvailability, clearAvailability } from '../../data/eventAvailabilityStore.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unanswered', label: 'Not answered' },
  { id: 'yes', label: 'Yes' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'no', label: 'No' },
];

/** Three big buttons. Sized for thumbs: this is tapped thirty times in a row. */
function AnswerButtons({ value, onChoose, label }) {
  return (
    <div className="prep-choice" role="group" aria-label={label}>
      {POLL_ANSWERS.map((answer) => (
        <button
          key={answer}
          type="button"
          className={`prep-choice-btn ${value === answer ? `on on-${answer}` : ''}`}
          aria-pressed={value === answer}
          onClick={() => onChoose(answer)}
        >
          {ANSWER_LABEL[answer]}
        </button>
      ))}
    </div>
  );
}

function NoteEditor({ initial, onSave, onClose }) {
  const [note, setNote] = useState(initial || '');
  return (
    <div className="prep-note-editor">
      <input
        value={note}
        maxLength={TRANSPORT_NOTE_MAX}
        placeholder="e.g. needs the bus, or a parent drives"
        aria-label="Transport note"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(note);
            onClose?.();
          }
        }}
      />
      <button
        type="button"
        className="prep-btn"
        onClick={() => {
          onSave(note);
          onClose?.();
        }}
      >
        Save note
      </button>
    </div>
  );
}

/**
 * AvailabilityPoll — who can come to the event (F071).
 *
 * The coach sees the counts, who hasn't answered, and a list where one tap
 * records a member's answer: going round the room at a Tuesday meeting with
 * a phone collects all thirty. A member sees only their own answer.
 */
export default function AvailabilityPoll({ event, players, me, isCoach }) {
  const rows = useEventAvailability();
  const answers = useMemo(() => (event ? answersForEvent(rows, event.id) : new Map()), [rows, event]);

  if (!event) return <p className="hint-text">No event to answer for yet.</p>;
  if (isCoach) return <CoachPoll event={event} players={players} rows={rows} answers={answers} />;
  return <MemberPoll event={event} me={me} answers={answers} />;
}

function CoachPoll({ event, players, rows, answers }) {
  const [filter, setFilter] = useState('all');
  const [noteFor, setNoteFor] = useState(null);
  const poll = useMemo(() => summarisePoll(players, rows, event.id), [players, rows, event.id]);

  const sorted = useMemo(
    () => [...players].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [players],
  );
  const visible = sorted.filter((p) => {
    const answer = answers.get(p.playerId)?.answer || null;
    if (filter === 'all') return true;
    if (filter === 'unanswered') return !answer;
    return answer === filter;
  });

  const countFor = (id) => (id === 'all' ? poll.total : id === 'unanswered' ? poll.unanswered.length : poll.counts[id]);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Availability</h2>
        <span className="badge">
          {poll.answeredCount} of {poll.total} answered
        </span>
      </div>

      <div className="prep-filter-row" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`prep-count-chip chip-${f.id} ${filter === f.id ? 'active' : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            <span>{f.label}</span>
            <strong>{countFor(f.id)}</strong>
          </button>
        ))}
      </div>

      {poll.total === 0 ? (
        <p className="hint-text">Nobody is on the roster yet. Add members on the Roster page first.</p>
      ) : visible.length === 0 ? (
        <p className="hint-text">Nobody in this group.</p>
      ) : (
        <ul className="prep-poll-list">
          {visible.map((p) => {
            const entry = answers.get(p.playerId) || null;
            return (
              <li key={p.playerId} className="prep-poll-row">
                <div className="prep-poll-who">
                  <span className="prep-poll-name">{p.name}</span>
                  <span className="prep-note">
                    {p.grade ? `Grade ${p.grade}` : 'No grade'}
                    {entry?.transportNote ? ` · ${entry.transportNote}` : ''}
                  </span>
                </div>
                <AnswerButtons
                  value={entry?.answer || null}
                  label={`${p.name}'s answer`}
                  onChoose={(answer) => setAvailability(event.id, p.playerId, { answer })}
                />
                <div className="prep-poll-tools">
                  <button
                    type="button"
                    className="link-button"
                    disabled={!entry}
                    title={entry ? '' : 'Record an answer first'}
                    onClick={() => setNoteFor(noteFor === p.playerId ? null : p.playerId)}
                  >
                    {entry?.transportNote ? 'Edit note' : 'Note'}
                  </button>
                  {entry && (
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => clearAvailability(event.id, p.playerId)}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {noteFor === p.playerId && entry && (
                  <NoteEditor
                    initial={entry.transportNote}
                    onSave={(note) => setAvailability(event.id, p.playerId, { transportNote: note })}
                    onClose={() => setNoteFor(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {poll.notes.length > 0 && (
        <>
          <h3>Transport notes</h3>
          <ul className="prep-plain-list">
            {poll.notes.map((n) => (
              <li key={n.player.playerId}>
                <strong>{n.player.name}</strong> ({ANSWER_LABEL[n.answer]}): {n.note}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function MemberPoll({ event, me, answers }) {
  const entry = me ? answers.get(me.playerId) || null : null;
  const [savedNote, setSavedNote] = useState('');
  const registration = resolveDeadlines(event).find((d) => d.key === 'registration');

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Can you play on {formatDate(event.date)}?</h2>
      </div>
      <p className="prep-note">
        {event.name}
        {event.venue ? ` at ${event.venue}` : ''}. You can change your answer any time
        {registration ? ` before registration closes (${formatDate(registration.date)})` : ''}.
      </p>

      {!me ? (
        <p className="hint-text">
          Claim your player profile from the account menu first, so your answer is saved under your name.
        </p>
      ) : (
        <>
          <AnswerButtons
            value={entry?.answer || null}
            label="Your answer"
            onChoose={(answer) => setAvailability(event.id, me.playerId, { answer })}
          />
          {entry && (
            <>
              <div className="field prep-member-note">
                <span>How will you get there? (optional)</span>
                <NoteEditor
                  key={entry.transportNote}
                  initial={entry.transportNote}
                  onSave={(note) => {
                    setAvailability(event.id, me.playerId, { transportNote: note });
                    setSavedNote('Note saved.');
                  }}
                />
              </div>
              <p className="hint-text">
                Your answer: <strong>{ANSWER_LABEL[entry.answer]}</strong>
                {entry.transportNote ? ` · ${entry.transportNote}` : ''}. {savedNote}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
