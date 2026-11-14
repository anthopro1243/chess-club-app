import { COMMITMENTS } from './roster.js';
import Icon from '../../ui/Icon.jsx';
import Avatar from '../../ui/Avatar.jsx';
import EmptyState from '../../ui/EmptyState.jsx';
import { PageActions } from '../../ui/PageHeader.jsx';

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
      <PageActions>
        {account.isCoach && (
          <button type="button" className="btn" onClick={() => setImporting(true)}>
            <Icon name="upload" size={16} />
            Import CSV
          </button>
        )}
        {access.canAdd && (
          <button
            type="button"
            className="btn btn-primary"
            aria-expanded={adding}
            onClick={() => setAdding((v) => !v)}
          >
            <Icon name={adding ? 'x' : 'plus'} size={16} />
            {adding ? 'Cancel' : 'Add player'}
          </button>
        )}
      </PageActions>

      <div className="panel-header">
        <h2>Players</h2>
        <span className="badge">
          {players.length} {players.length === 1 ? 'player' : 'players'}
        </span>
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
        <EmptyState
          icon="roster"
          title="No players yet"
          actions={
            <>
              {access.canAdd && (
                <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                  Add a player
                </button>
              )}
              {account.isCoach && (
                <button type="button" className="btn" onClick={() => setImporting(true)}>
                  Import CSV
                </button>
              )}
            </>
          }
        >
          The roster is everyone in the club. Add players one at a time
          {account.isCoach ? ', or import the signup form CSV' : ''}.
        </EmptyState>
      )}
      <div className="table-scroll" hidden={players.length === 0}>
        <table className="roster-table roster-list">
<caption className="sr-only">Club roster</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="hide-narrow">Board</th>
              <th scope="col">USCF</th>
              <th scope="col" className="hide-narrow">Rapid</th>
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
                <td className="roster-name">
                  <button
                    type="button"
                    className="row-button person"
                    aria-pressed={player.playerId === selectedId}
                    onClick={(event) => {
                      event.stopPropagation(); // the row selects too
                      setSelectedId(player.playerId);
                      setEditing(false);
                    }}
                  >
                    <Avatar name={player.name} size="sm" />
                    <span className="person-name">{player.name}</span>
                  </button>
                </td>
                <td className="hide-narrow">{player.boardRole}</td>
                <td>{player.ratings.uscf ?? '—'}</td>
                <td className="hide-narrow">{player.ratings.chesscomRapid ?? '—'}</td>
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
