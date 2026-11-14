import { useId, useState } from 'react';

/**
 * A labelled password input with a Show / Hide toggle. `autoComplete` is
 * explicit ("current-password" or "new-password") so password managers do
 * the right thing; it used to be guessed from the placeholder text.
 */
export default function PasswordField({ label, value, onChange, autoComplete, hint = '', autoFocus = false }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          autoFocus={autoFocus}
          placeholder={hint}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}
