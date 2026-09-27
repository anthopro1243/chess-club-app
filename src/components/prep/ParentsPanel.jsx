import { useEffect, useMemo, useState } from 'react';
import { createStore, useStore } from '../../data/store.js';
import { formatDate, resolveDeadlines } from '../../data/officialEvents.js';
import { buildParentSheet, sheetAsText, SHEET_FIELDS, PACKING_LIST, CONDUCT_LIST } from '../../data/parentSheet.js';

/*
 * ParentsPanel — the parent info sheet (F112) and the packing and conduct
 * list (F119), sent the week before the event.
 *
 * The coach fills in the few details only they know; the sheet prints on one
 * page or copies as text for an email or Remind. The details are kept on this
 * device only (keyed by event): the sheet is sent, not shared in the app, so
 * nothing here needs the database. Members see the packing and conduct list.
 */
const sheetStore = createStore('cc-parent-sheet-v1', {});

export default function ParentsPanel({ event, isCoach }) {
  return (
    <>
      {isCoach && <SheetEditor event={event} />}
      <Packing />
    </>
  );
}

function SheetEditor({ event }) {
  const all = useStore(sheetStore);
  const fields = (event && all[event.id]) || {};
  const sheet = useMemo(() => buildParentSheet(event, fields), [event, fields]);
  const sendBy = resolveDeadlines(event).find((d) => d.key === 'registration')?.date ?? null;
  const [copied, setCopied] = useState('');
  const [printing, setPrinting] = useState(false);

  // Same approach as the Events print sheets: mark the document so the print
  // stylesheet shows only the sheet, print once it has rendered, then tidy up.
  useEffect(() => {
    if (!printing) return undefined;
    const root = document.documentElement;
    root.classList.add('prep-printing');
    const done = () => {
      root.classList.remove('prep-printing');
      setPrinting(false);
    };
    window.addEventListener('afterprint', done);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      root.classList.remove('prep-printing');
    };
  }, [printing]);

  if (!event) {
    return (
      <section className="panel">
        <p className="hint-text">Add the event on the Event tab first; the parent sheet is built from it.</p>
      </section>
    );
  }

  const set = (key, value) =>
    sheetStore.set((s) => ({ ...s, [event.id]: { ...(s[event.id] || {}), [key]: value } }));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sheetAsText(sheet));
      setCopied('Copied. Paste it into an email or a Remind message.');
    } catch {
      setCopied('Copy did not work in this browser. Select the text in the preview and copy it by hand.');
    }
  };

  return (
    <section className="panel prep-parents">
      <div className="panel-header">
        <h2>Parent info sheet</h2>
        <div className="panel-header-actions">
          <button type="button" className="secondary" onClick={copy}>Copy as text</button>
          <button type="button" onClick={() => setPrinting(true)}>Print</button>
        </div>
      </div>
      <p className="hint-text">
        Send it {sendBy ? `by ${formatDate(sendBy)}` : 'the week before'}, with the packing list. It names no
        students. Details are saved on this device only.
      </p>
      {copied && <p className="hint-text" role="status">{copied}</p>}

      <div className="prep-parents-grid">
        <div className="prep-parents-fields">
          {SHEET_FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}{f.essential ? '' : ' (optional)'}</span>
              {f.max > 200 ? (
                <textarea rows={3} maxLength={f.max} value={fields[f.key] || ''} placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <input maxLength={f.max} value={fields[f.key] || ''} placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)} />
              )}
            </label>
          ))}
          {sheet?.missing.length > 0 && (
            <p className="prep-parents-missing">Still to fill in: {sheet.missing.join(', ')}.</p>
          )}
        </div>
        {sheet && <SheetView sheet={sheet} className="prep-parents-preview" />}
      </div>
      {sheet && <SheetView sheet={sheet} className="prep-print-sheet" />}
    </section>
  );
}

function SheetView({ sheet, className }) {
  return (
    <article className={className} aria-label="Parent info sheet preview">
      <h3>{sheet.title}</h3>
      <p className="prep-sheet-sub">{sheet.subtitle}</p>
      {sheet.sections.map((s) => (
        <div key={s.heading} className="prep-sheet-section">
          <h4>{s.heading}</h4>
          <ul>
            {s.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
      ))}
    </article>
  );
}

function Packing() {
  return (
    <section className="panel prep-packing">
      <div className="panel-header">
        <h2>What to bring, and how to play it</h2>
      </div>
      <div className="prep-packing-grid">
        <div>
          <h3>Pack the night before</h3>
          <ul className="prep-packing-list">
            {PACKING_LIST.map((p) => (
              <li key={p.item}>
                <strong>{p.item}</strong>
                <span className="muted small">{p.why}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>In the hall</h3>
          <ul className="prep-packing-list">
            {CONDUCT_LIST.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
