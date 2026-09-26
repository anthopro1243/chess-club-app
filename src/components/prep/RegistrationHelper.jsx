import { useMemo, useRef, useState } from 'react';
import { formatDate, resolveDeadlines } from '../../data/officialEvents.js';
import { answersForEvent } from '../../data/availabilityPoll.js';
import { useEventAvailability } from '../../data/eventAvailabilityStore.js';
import {
  useEventRegistrations,
  upsertRegistration,
  removeRegistration,
} from '../../data/eventRegistrationStore.js';
import {
  MAX_PER_COACH,
  MAX_STUDENTS,
  STIPEND_FLOOR,
  COACH_SLOTS,
  SUGGEST_ORDERS,
  gradeSection,
  attendanceRate,
  checkRegistration,
  canAddToSlot,
  rankCandidates,
  registrationRows,
  registrationCsv,
  registrationText,
} from '../../data/registrationRules.js';
import { usePlatformRatings, useRatingOverrides } from '../../data/ratingStore.js';
import { resolveRating } from '../../analysis/ratings.js';

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

/**
 * RegistrationHelper — choose who goes, under which coach, and export the
 * list for the district form (F072, F073). Coach only.
 *
 * Suggestions are ordered by readiness, rating or attendance, but nobody is
 * registered until the coach taps "Add" for that player: the app never
 * picks a team.
 */
export default function RegistrationHelper({ event, players, readinessById = null }) {
  const availability = useEventAvailability();
  const registrations = useEventRegistrations();
  const platformRatings = usePlatformRatings();
  const overrides = useRatingOverrides();
  const [sortBy, setSortBy] = useState(readinessById ? 'readiness' : 'rating');
  const [includeMaybe, setIncludeMaybe] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const textRef = useRef(null);

  const coachNames = [event?.coach1Name || '', event?.coach2Name || ''];
  const answers = useMemo(() => (event ? answersForEvent(availability, event.id) : new Map()), [availability, event]);
  const byId = useMemo(() => new Map(players.map((p) => [p.playerId, p])), [players]);

  const registrants = useMemo(
    () =>
      registrations
        .filter((r) => r.eventId === event?.id && byId.has(r.playerId))
        .map((r) => {
          const p = byId.get(r.playerId);
          return { ...r, name: p.name, grade: p.grade, answer: answers.get(r.playerId)?.answer ?? null };
        }),
    [registrations, event, byId, answers],
  );
  const check = useMemo(() => checkRegistration(registrants, { coachNames }), [registrants, coachNames[0], coachNames[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const ratingFor = (player) => {
    const resolved = resolveRating({
      override: overrides.find((o) => o.playerId === player.playerId) ?? null,
      official: player.ratings?.uscf != null ? { platform: 'uscf', rating: player.ratings.uscf } : null,
      platformRatings: platformRatings.filter((r) => r.playerId === player.playerId),
    });
    return {
      // Only a rating from the club's shared pool is used to ORDER players;
      // anything else is shown with its label but never ranked against it.
      rating: resolved.comparable ? resolved.rating : null,
      label: resolved.rating != null ? `${resolved.rating} ${resolved.label}` : 'unrated',
    };
  };

  const registeredIds = new Set(registrants.map((r) => r.playerId));
  const candidates = rankCandidates(
    players
      .filter((p) => !registeredIds.has(p.playerId))
      .filter((p) => {
        const answer = answers.get(p.playerId)?.answer;
        return answer === 'yes' || (includeMaybe && answer === 'maybe');
      })
      .map((p) => {
        const { rating, label } = ratingFor(p);
        return {
          playerId: p.playerId,
          name: p.name,
          grade: p.grade,
          answer: answers.get(p.playerId)?.answer,
          readinessPercent: readinessById?.get(p.playerId)?.percent ?? null,
          rating,
          ratingLabel: label,
          attendance: attendanceRate(p.attendance),
        };
      }),
    sortBy,
  );

  const add = (playerId, slot) => {
    const verdict = canAddToSlot(registrants, slot, { coachNames });
    if (!verdict.ok) {
      setNotice(verdict.reason);
      return;
    }
    setNotice('');
    upsertRegistration(event.id, playerId, { coachSlot: slot });
  };

  const move = (reg, slot) => {
    if (reg.coachSlot === slot) return;
    add(reg.playerId, slot);
  };

  const rows = registrationRows(registrants, { coachNames });
  const text = registrationText(rows, {
    eventName: event?.name,
    eventDate: event ? formatDate(event.date, { withYear: true }) : '',
    venue: event?.venue,
  });
  const exportBlocked = !check.ok || rows.length === 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied.');
    } catch {
      // Clipboard access can be refused (older browsers, some managed
      // Chromebooks). Selecting the text lets the coach copy it by hand.
      textRef.current?.select();
      setCopied('Selected — press Ctrl+C (or long-press) to copy.');
    }
  };

  const download = () => {
    // The BOM makes Excel read the file as UTF-8, so accented names survive.
    const blob = new Blob(['﻿', registrationCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registration-${event.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!event) return <p className="hint-text">Add an event first.</p>;
  const registration = resolveDeadlines(event).find((d) => d.key === 'registration');

  return (
    <div className="prep-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Registration</h2>
          {registration && <span className="badge">Closes {formatDate(registration.date)}</span>}
        </div>

        <div className="prep-rule-row">
          {COACH_SLOTS.map((slot) => (
            <span key={slot} className={`prep-rule ${check.counts[`slot${slot}`] > MAX_PER_COACH ? 'bad' : ''}`}>
              {coachNames[slot - 1] || `Coach ${slot}`}: <strong>{check.counts[`slot${slot}`]}</strong> / {MAX_PER_COACH}
            </span>
          ))}
          <span className="prep-rule">
            Total: <strong>{check.counts.total}</strong> / {MAX_STUDENTS}
          </span>
          <span className={`prep-rule ${check.counts.total < STIPEND_FLOOR ? 'warn' : 'good'}`}>
            {STIPEND_FLOOR}+ for the full stipend
          </span>
          <span className="prep-rule">
            9-10: <strong>{check.counts.sections['9-10']}</strong> · 11-12:{' '}
            <strong>{check.counts.sections['11-12']}</strong>
          </span>
        </div>

        {notice && (
          <p className="prep-alert bad" role="alert">
            {notice}
          </p>
        )}
        {check.errors.map((e, i) => (
          <p key={`e${i}`} className="prep-alert bad">
            {e.message}
          </p>
        ))}
        {check.warnings.map((w, i) => (
          <p key={`w${i}`} className="prep-alert warn">
            {w.message}
          </p>
        ))}

        {registrants.length === 0 ? (
          <p className="hint-text">Nobody registered yet. Add players from the suggestions below.</p>
        ) : (
          <ul className="prep-reg-list">
            {rows.map((row) => {
              const reg = registrants.find((r) => r.playerId === row.playerId) || null;
              if (!reg) return null;
              return (
                <li key={reg.playerId} className="prep-reg-row">
                  <div className="prep-poll-who">
                    <span className="prep-poll-name">{reg.name}</span>
                    <span className="prep-note">
                      Grade {reg.grade || '?'} · section {gradeSection(reg.grade) || '?'}
                      {reg.answer !== 'yes' ? ` · answered ${reg.answer || 'nothing'}` : ''}
                    </span>
                  </div>
                  <div className="prep-choice prep-choice-2" role="group" aria-label={`${reg.name}'s coach`}>
                    {COACH_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className={`prep-choice-btn ${reg.coachSlot === slot ? 'on on-coach' : ''}`}
                        aria-pressed={reg.coachSlot === slot}
                        onClick={() => move(reg, slot)}
                      >
                        Coach {slot}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="link-button danger"
                    onClick={() => removeRegistration(event.id, reg.playerId)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Suggestions</h2>
          <label className="field prep-inline-field">
            <span>Order by</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {Object.entries(SUGGEST_ORDERS)
                .filter(([key]) => key !== 'readiness' || readinessById)
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="prep-note">
          Members who answered yes and are not on the list yet. Nobody is registered until you add them.
        </p>
        <label className="checkbox-field field prep-check">
          <input type="checkbox" checked={includeMaybe} onChange={(e) => setIncludeMaybe(e.target.checked)} />
          <span>Include &ldquo;maybe&rdquo; answers</span>
        </label>

        {candidates.length === 0 ? (
          <p className="hint-text">
            No one to suggest. Answers come from the Availability tab.
          </p>
        ) : (
          <ul className="prep-reg-list prep-suggest-list">
            {candidates.map((c) => (
              <li key={c.playerId} className="prep-reg-row">
                <div className="prep-poll-who">
                  <span className="prep-poll-name">
                    {c.name}
                    {c.answer === 'maybe' && <span className="prep-default-tag">maybe</span>}
                  </span>
                  <span className="prep-note">
                    Grade {c.grade || '?'}
                    {readinessById ? ` · ready ${c.readinessPercent == null ? '—' : `${c.readinessPercent}%`}` : ''} ·{' '}
                    {c.ratingLabel} · attends {pct(c.attendance)}
                  </span>
                </div>
                <div className="prep-choice prep-choice-2" role="group" aria-label={`Add ${c.name}`}>
                  {COACH_SLOTS.map((slot) => {
                    const verdict = canAddToSlot(registrants, slot, { coachNames });
                    return (
                      <button
                        key={slot}
                        type="button"
                        className="prep-choice-btn"
                        title={verdict.ok ? '' : verdict.reason}
                        onClick={() => add(c.playerId, slot)}
                      >
                        + Coach {slot}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Export for the district form</h2>
        </div>
        <textarea ref={textRef} className="text-area prep-export" readOnly value={text} rows={8} />
        <div className="prep-actions">
          <button type="button" className="prep-btn primary" onClick={copy} disabled={exportBlocked}>
            Copy list
          </button>
          <button type="button" className="prep-btn" onClick={download} disabled={exportBlocked}>
            Download CSV
          </button>
          {copied && <span className="prep-note">{copied}</span>}
        </div>
        {exportBlocked && (
          <p className="hint-text">
            {rows.length === 0 ? 'Add players first.' : 'Fix the errors above first; the district would refuse this list.'}
          </p>
        )}
      </section>
    </div>
  );
}
