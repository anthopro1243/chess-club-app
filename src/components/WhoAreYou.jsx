import { useState } from 'react';
import { validateWhoAreYou, linkOutcomeMessage } from '../data/accountLinking.js';
import { submitWhoAreYou } from '../data/accountLinkStore.js';

/**
 * WhoAreYou — the one-time step after approval that ties the account to the
 * real student: first name, last name, DISD student ID.
 *
 * Shown in place of the page (App.jsx decides when, via shouldAskWhoAreYou)
 * because everything personal in the app hangs off this link: without it a
 * member has no home page, no games and no mistakes to review. Three fields,
 * once. The database does the matching (migration 0025); a wrong ID is the
 * coach's to fix on the Roster page, so nothing here tries to verify it.
 */
export default function WhoAreYou({ onDone }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', studentId: '' });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => {
    const value = event.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setFailure('');
  };

  const submit = async (event) => {
    event.preventDefault();
    const check = validateWhoAreYou(form);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      const { outcome } = await submitWhoAreYou(check.value);
      onDone?.(linkOutcomeMessage(outcome));
    } catch (err) {
      setFailure(err.message || 'Couldn’t save that. Try again.');
      setBusy(false);
    }
  };

  return (
    <section className="panel who-are-you" aria-labelledby="who-are-you-title">
      <img className="who-seal" src="./sem-logo.png" alt="" aria-hidden="true" width="56" height="56" />
      <h2 id="who-are-you-title">Who are you?</h2>
      <p className="muted">
        One quick step so your games and progress line up with you on the club roster. You only do
        this once.
      </p>
      <form onSubmit={submit} noValidate>
        <label className="field">
          <span>First name</span>
          <input
            value={form.firstName}
            onChange={set('firstName')}
            autoComplete="given-name"
            autoFocus
            aria-invalid={!!errors.firstName}
          />
          {errors.firstName && <span className="field-error">{errors.firstName}</span>}
        </label>
        <label className="field">
          <span>Last name</span>
          <input
            value={form.lastName}
            onChange={set('lastName')}
            autoComplete="family-name"
            aria-invalid={!!errors.lastName}
          />
          {errors.lastName && <span className="field-error">{errors.lastName}</span>}
        </label>
        <label className="field">
          <span>DISD student ID</span>
          <input
            value={form.studentId}
            onChange={set('studentId')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            placeholder="7 digits"
            aria-invalid={!!errors.studentId}
          />
          {errors.studentId && <span className="field-error">{errors.studentId}</span>}
        </label>
        <p className="muted small">Only you and the coach can see your student ID.</p>
        {failure && <p className="field-error" role="alert">{failure}</p>}
        <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </section>
  );
}
