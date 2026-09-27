import { useEffect, useState } from 'react';
import {
  formatDate,
  resolveDeadlines,
  remindersFor,
  validateEvent,
  defaultRegistrationClose,
  defaultTransportDue,
  isIsoDate,
} from '../../data/officialEvents.js';
import { saveOfficialEvent } from '../../data/officialEventsStore.js';

const blankDraft = (event) => ({
  id: event?.id || '',
  name: event?.name || '',
  date: event?.date || '',
  venue: event?.venue || '',
  registrationCloses: event?.registrationCloses || '',
  transportDue: event?.transportDue || '',
  coach1Name: event?.coach1Name || '',
  coach2Name: event?.coach2Name || '',
  notes: event?.notes || '',
});

/**
 * EventPanel — the event's facts and deadlines, and (for a coach) the form
 * that edits them.
 *
 * A deadline left blank follows the district rule and moves with the event
 * date; a typed one stays put. The form shows the rule's date as the
 * placeholder so the coach can see what "blank" will mean before saving.
 */
export default function EventPanel({ event, isCoach, onCreated }) {
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(() => blankDraft(event));
  const [saved, setSaved] = useState('');

  useEffect(() => {
    setDraft(blankDraft(creating ? null : event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, creating]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const { errors } = validateEvent(draft);
  const canSave = Object.keys(errors).length === 0;

  const submit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    const record = saveOfficialEvent(creating ? { ...draft, id: '' } : draft);
    setSaved(`Saved ${record.name}.`);
    setEditing(false);
    if (creating) {
      setCreating(false);
      onCreated?.(record.id);
    }
  };

  if (!event && !creating) {
    return (
      <section className="panel">
        <p className="hint-text">No event yet.</p>
        {isCoach && (
          <button type="button" className="prep-btn primary" onClick={() => setCreating(true)}>
            Add an event
          </button>
        )}
      </section>
    );
  }

  if (isCoach && (editing || creating)) {
    const ruleReg = isIsoDate(draft.date) ? formatDate(defaultRegistrationClose(draft.date)) : '';
    const ruleTransport = isIsoDate(draft.date) ? formatDate(defaultTransportDue(draft.date)) : '';
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>{creating ? 'New event' : 'Edit event'}</h2>
        </div>
        <form className="prep-form" onSubmit={submit}>
          <label className="field field-wide">
            <span>Name</span>
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            {errors.name && <span className="prep-error">{errors.name}</span>}
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            {errors.date && <span className="prep-error">{errors.date}</span>}
          </label>
          <label className="field">
            <span>Venue</span>
            <input value={draft.venue} onChange={(e) => set({ venue: e.target.value })} />
            {errors.venue && <span className="prep-error">{errors.venue}</span>}
          </label>
          <label className="field">
            <span>Registration closes {ruleReg && <em className="prep-default-tag">rule: {ruleReg}</em>}</span>
            <input
              type="date"
              value={draft.registrationCloses}
              onChange={(e) => set({ registrationCloses: e.target.value })}
            />
            {errors.registrationCloses && <span className="prep-error">{errors.registrationCloses}</span>}
          </label>
          <label className="field">
            <span>
              Transport forms due {ruleTransport && <em className="prep-default-tag">rule: {ruleTransport}</em>}
            </span>
            <input type="date" value={draft.transportDue} onChange={(e) => set({ transportDue: e.target.value })} />
            {errors.transportDue && <span className="prep-error">{errors.transportDue}</span>}
          </label>
          <label className="field">
            <span>Coach 1</span>
            <input
              value={draft.coach1Name}
              placeholder="Name on the district form"
              onChange={(e) => set({ coach1Name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Coach 2 (optional)</span>
            <input
              value={draft.coach2Name}
              placeholder="Second campus coach, if any"
              onChange={(e) => set({ coach2Name: e.target.value })}
            />
          </label>
          <label className="field field-wide">
            <span>Notes</span>
            <textarea className="text-area" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
          <p className="prep-note field-wide">
            Leave a deadline blank to follow the district rule; it then moves with the event date.
          </p>
          <div className="prep-actions field-wide">
            <button type="submit" className="prep-btn primary" disabled={!canSave}>
              Save
            </button>
            <button
              type="button"
              className="prep-btn"
              onClick={() => {
                setEditing(false);
                setCreating(false);
                setDraft(blankDraft(event));
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  const deadlines = resolveDeadlines(event);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{event.name}</h2>
        {isCoach && (
          <div className="panel-header-actions">
            <button type="button" className="link-button" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="link-button" onClick={() => setCreating(true)}>
              Add event
            </button>
          </div>
        )}
      </div>
      <dl className="prep-facts">
        <dt>Date</dt>
        <dd>{formatDate(event.date, { withYear: true })}</dd>
        <dt>Venue</dt>
        <dd>{event.venue || '—'}</dd>
        {deadlines.map((d) => (
          <FactRow key={d.key} deadline={d} />
        ))}
        {isCoach && (
          <>
            <dt>Coaches</dt>
            <dd>{[event.coach1Name, event.coach2Name].filter(Boolean).join(' · ') || 'Not named yet'}</dd>
          </>
        )}
        {event.notes && (
          <>
            <dt>Notes</dt>
            <dd>{event.notes}</dd>
          </>
        )}
      </dl>
      {saved && <p className="hint-text">{saved}</p>}
    </section>
  );
}

function FactRow({ deadline }) {
  const reminders = remindersFor(deadline.date);
  return (
    <>
      <dt>{deadline.label}</dt>
      <dd>
        {formatDate(deadline.date)}
        {deadline.isDefault && <span className="prep-default-tag">district rule</span>}
        <span className="prep-note">
          {' '}
          · reminders {reminders.map((r) => formatDate(r.date)).join(' and ')}
        </span>
      </dd>
    </>
  );
}
