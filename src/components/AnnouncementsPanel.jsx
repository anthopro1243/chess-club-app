import { useMemo, useState } from 'react';
import { useAnnouncements, postAnnouncement, setPinned, archiveAnnouncement } from '../data/announcementsStore.js';
import { liveAnnouncements, draftProblem, TITLE_MAX } from '../data/announcements.js';
import '../styles/announcements.css';

/*
 * AnnouncementsPanel — the coach's one-way board on the Club page (F110).
 *
 * Members see it only when there is something to read; an empty box on
 * everyone's home screen would be noise. The coach always sees it, with the
 * form, because posting is the point.
 */
export default function AnnouncementsPanel({ isCoach }) {
  const all = useAnnouncements();
  const live = useMemo(() => liveAnnouncements(all), [all]);
  const [draft, setDraft] = useState({ title: '', body: '', pinned: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  if (!isCoach && !live.length) return null;

  const problem = draftProblem(draft);

  const post = async (event) => {
    event.preventDefault();
    if (problem) return;
    setBusy(true);
    setError('');
    const result = await postAnnouncement(draft);
    setBusy(false);
    if (!result.ok) {
      setError(`Not posted: ${result.error}`);
      return;
    }
    setDraft({ title: '', body: '', pinned: false });
    setOpen(false);
  };

  return (
    <section className="panel announcements" aria-labelledby="announcements-title">
      <div className="panel-header">
        <h2 id="announcements-title">Announcements</h2>
        {isCoach && (
          <button type="button" className="link-button" onClick={() => setOpen((v) => !v)}>
            {open ? 'Cancel' : '+ Post'}
          </button>
        )}
      </div>

      {isCoach && open && (
        <form className="announcement-form" onSubmit={post}>
          <label className="field">
            <span>Title</span>
            <input
              value={draft.title}
              maxLength={TITLE_MAX}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Mock tournament round 1 this Tuesday"
            />
          </label>
          <label className="field">
            <span>Message (optional)</span>
            <textarea
              rows={3}
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder="Bring a pen. We play G/30 d5 with paper scoresheets."
            />
          </label>
          <label className="announcement-pin">
            <input
              type="checkbox"
              checked={draft.pinned}
              onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
            />
            <span>Pin to the top until I unpin it</span>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="primary" disabled={busy || !!problem}>
            {busy ? 'Posting…' : 'Post to the club'}
          </button>
        </form>
      )}

      {live.length === 0 ? (
        <p className="hint-text">Nothing posted yet. Announcements appear here for every member.</p>
      ) : (
        <ul className="announcement-list">
          {live.map((a) => (
            <li key={a.id} className={a.pinned ? 'pinned' : ''}>
              <div className="announcement-head">
                <strong>{a.title}</strong>
                {a.pinned && <span className="badge">Pinned</span>}
                <span className="muted small">{new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
              {a.body && <p className="announcement-body">{a.body}</p>}
              {isCoach && (
                <div className="announcement-actions">
                  <button type="button" className="link-button" onClick={() => setPinned(a.id, !a.pinned)}>
                    {a.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      if (window.confirm('Take this announcement down? It stays on record but no one sees it.')) {
                        archiveAnnouncement(a.id);
                      }
                    }}
                  >
                    Take down
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
