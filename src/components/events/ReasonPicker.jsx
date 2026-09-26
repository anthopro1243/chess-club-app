import { useState } from 'react';

/*
 * ReasonPicker — the "why" every override is logged with (F077).
 *
 * A short list covers nearly every Tuesday; "Other…" opens a text box for
 * the rest. Starting on a sensible default keeps a swap at two taps: the
 * reason is already chosen before the first seat is touched.
 */

export const SWAP_REASONS = [
  'Coach decision',
  'Colour fix',
  'Avoid a family or teammate pairing',
  'Late arrival',
  'Correcting a pairing mistake',
];

export const BYE_REASONS = ['Asked in advance', 'Away that day', 'Coach decision'];

export const WITHDRAW_REASONS = ['Left early', 'Not coming back', 'Coach decision'];

export const LATE_REASONS = ['Arrived late', 'New member', 'Coach decision'];

export default function ReasonPicker({ value, onChange, options, label = 'Reason' }) {
  const [custom, setCustom] = useState(() => !!value && !options.includes(value));
  return (
    <label className="field ev-reason">
      <span>{label}</span>
      <select
        value={custom ? '__other' : value}
        onChange={(event) => {
          if (event.target.value === '__other') {
            setCustom(true);
            onChange('');
          } else {
            setCustom(false);
            onChange(event.target.value);
          }
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="__other">Other…</option>
      </select>
      {custom && (
        <input
          type="text"
          value={value}
          maxLength={200}
          placeholder="Say why, in a few words"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
