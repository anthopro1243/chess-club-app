import { COMMITMENTS } from './roster.js';

/** The roster table, its header actions and the "Add player" form. */
export default function RosterList({
  players,
  selectedId,
  account,
  access,
  cloud,
  adding,
  setAdding,
  form,
  setForm,
  submitAdd,
  setSelectedId,
  setEditing,
  setImporting,
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Roster</h2>
        <div className="panel-header-actions">
          <span className="badge">{players.length} players</span>
          {account.isCoach && (
            <button type="button" className="link-button" onClick={() => setImporting(true)}>
              Import CSV
            </button>
          )}
          {access.canAdd && (
            <button type="button" className="link-button" onClick={() => setAdding((v) => !v)}>
              {adding ? 'Cancel' : '+ Add player'}
            </button>
          )}
        </div>
      </div>

      {adding && access.canAdd && (
        <form className="roster-form" onSubmit={submitAdd}>
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
              required
            />
          </label>
          <label className="field">
            <span>Grade</span>
            <input value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))} />
          </label>
          <label className="field">
            <span>Board role</span>
            <input
              value={form.boardRole}
              onChange={(e) => setForm((f) => ({ ...f, boardRole: e.target.value }))}
              placeholder="Board 4"
            />
          </label>
          <label className="field">
            <span>Track</span>
            <select
              value={form.commitment}
              onChange={(e) => setForm((f) => ({ ...f, commitment: e.target.value }))}
            >
              {COMMITMENTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>USCF rating</span>
            <input
              type="number"
              value={form.uscf}
              onChange={(e) => setForm((f) => ({ ...f, uscf: e.target.value }))}
            />
          </label>
          <label className="field field-wide">
            <span>Goal</span>
            <input value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />
          </label>
          <button type="submit" className="primary form-submit">
            Add to roster
          </button>
        </form>
      )}

      {players.length === 0 && !adding && (
        <p className="muted empty-state">
          No players yet. Add one with &ldquo;+ Add player&rdquo;
          {account.isCoach ? ', or import the signup form CSV' : ''}.
        </p>
      )}
      <div className="table-scroll" hidden={players.length === 0}>
        <table className="roster-table roster-list">
<caption className="sr-only">Club roster</caption>
          <thead>
            <tr>
              <th scope="col" className="hide-narrow">ID</th>
              <th scope="col">Name</th>
              <th scope="col" className="hide-narrow">Board</th>
              <th scope="col">USCF</th>
              <th scope="col">Rapid</th>
              <th scope="col">Track</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr
                key={player.playerId}
                className={`clickable ${player.playerId === selectedId ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedId(player.playerId);
                  setEditing(false);
                }}
              >
                <td className="mono hide-narrow">{player.playerId}</td>
                <td className="roster-name">
                  <button
                    type="button"
                    className="row-button"
                    aria-pressed={player.playerId === selectedId}
                    onClick={(event) => {
                      event.stopPropagation(); // the row selects too
                      setSelectedId(player.playerId);
                      setEditing(false);
                    }}
                  >
                    {player.name}
                  </button>
                </td>
                <td className="hide-narrow">{player.boardRole}</td>
                <td>{player.ratings.uscf ?? '—'}</td>
                <td>{player.ratings.chesscomRapid ?? '—'}</td>
                <td>
                  <span className={`track ${(player.commitment || 'Casual').toLowerCase()}`}>
                    {player.commitment}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint-text">
        {cloud.signedIn ? 'Shared with everyone signed in.' : 'Saved to this browser.'}
      </p>
    </section>
  );
}
