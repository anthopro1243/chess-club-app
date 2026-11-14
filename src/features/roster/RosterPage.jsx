import { useEffect, useState, useMemo } from 'react';
import { useSkillsForPlayer } from '../analysis/analysisStore.js';
import { suggestedRubric } from '../../analysis/presentation.js';
import { usePlayers, useCloudStatus, useMyProfile, addPlayer, updatePlayer, updateRubric, removePlayer } from './rosterStore.js';
import { rosterAccess } from './rosterAccess.js';
import { useAccount } from '../account/accountStore.js';
import { useCoachNotes, setCoachNote, seedCoachNotesFromPlayers } from '../coach/coachNotesStore.js';
import { usePlayerPrivate } from './playerPrivateStore.js';
import RosterImportModal from './RosterImportModal.jsx';
import ReportCard from '../analysis/ReportCard.jsx';
import ArchiveGraduateModal from './ArchiveGraduateModal.jsx';
import AccountLinksPanel from './AccountLinksPanel.jsx';
import RosterList from './RosterList.jsx';
import PlayerEditForm from './PlayerEditForm.jsx';
import PlayerDetails from './PlayerDetails.jsx';
import { isCloud } from '../../services/backend.js';

const emptyForm = { name: '', grade: '', boardRole: '', commitment: 'Casual', uscf: '', goal: '' };

/**
 * RosterPage — one row per player, with a detail panel keyed to the same
 * rubric the coach workbook uses.
 */
export default function RosterPage() {
  const players = usePlayers();
  const cloud = useCloudStatus();
  const account = useAccount();
  const coachNotes = useCoachNotes();
  const privateFields = usePlayerPrivate();
  const [importing, setImporting] = useState(false);
  const [selectedId, setSelectedId] = useState(players[0]?.playerId ?? null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const selected = players.find((p) => p.playerId === selectedId) || null;
  const me = useMyProfile();
  const access = rosterAccess({
    isCoach: account.isCoach,
    isSelf: !!selected && !!me && selected.playerId === me.playerId,
  });
  // Which member's report card is open (coach only); closes when another member is picked.
  const [cardFor, setCardFor] = useState(null);
  const [archiving, setArchiving] = useState(false);

  // The engine's tracked scores for this player, mapped onto the roster's
  // 0-10 rubric. Withheld entirely where the evidence is thin - see
  // suggestedRubric, which drops anything below medium confidence.
  const skills = useSkillsForPlayer(selectedId);
  const suggestions = useMemo(
    () =>
      suggestedRubric(
        Object.fromEntries(
          Object.entries(skills).map(([key, row]) => [
            key,
            {
              score: row.score,
              confidence: row.confidence,
              measured: row.score != null,
              n: row.observations ?? 0,
            },
          ]),
        ),
      ),
    [skills],
  );

  useEffect(() => {
    if (!selected && players.length) setSelectedId(players[0].playerId);
  }, [players, selected]);

  // Notes written before they moved off the player row.
  useEffect(() => {
    if (players.length) seedCoachNotesFromPlayers(players);
  }, [players]);

  const startEdit = () => {
    if (!selected) return;
    setDraft({
      name: selected.name,
      grade: selected.grade,
      boardRole: selected.boardRole,
      commitment: selected.commitment,
      style: selected.style,
      goal: selected.goal,
      trainingFocus: selected.trainingFocus,
      coachNotes: coachNotes[selected.playerId] || '',
      rubric: { ...selected.rubric },
    });
    setEditing(true);
  };

  const saveEdit = () => {
    if (!selected || !draft) return;
    const { rubric, coachNotes: note, ...rest } = draft;
    updatePlayer(selected.playerId, rest);
    updateRubric(selected.playerId, rubric);
    if (account.isCoach) setCoachNote(selected.playerId, note);
    setEditing(false);
    setDraft(null);
  };

  const submitAdd = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    const id = addPlayer(form);
    setForm(emptyForm);
    setAdding(false);
    setSelectedId(id);
  };

  const remove = () => {
    if (!selected) return;
    if (!window.confirm(`Remove ${selected.name} from the roster?`)) return;
    removePlayer(selected.playerId);
    setSelectedId(null);
    setEditing(false);
  };

  return (
    <div className="roster-layout">
      {account.isCoach && isCloud && (
        <AccountLinksPanel
          onSelectPlayer={(id) => {
            setSelectedId(id);
            setEditing(false);
          }}
        />
      )}
      <RosterList
        players={players}
        selectedId={selectedId}
        account={account}
        access={access}
        cloud={cloud}
        adding={adding}
        setAdding={setAdding}
        form={form}
        setForm={setForm}
        submitAdd={submitAdd}
        setSelectedId={setSelectedId}
        setEditing={setEditing}
        setImporting={setImporting}
      />

      {selected && (
        <section className="panel player-detail">
          <div className="panel-header">
            <h2>{editing ? 'Editing' : selected.name}</h2>
            <div className="panel-header-actions">
              <span className="badge mono">{selected.playerId}</span>
              {!editing && (
                <>
                  {account.isCoach && (
                    <button type="button" className="link-button" onClick={() => setCardFor(selected.playerId)}>
                      Report card
                    </button>
                  )}
                  {access.canEdit && (
                    <button type="button" className="link-button" onClick={startEdit}>
                      Edit
                    </button>
                  )}
                  {account.isCoach && (
                    <button type="button" className="link-button" onClick={() => setArchiving(true)}>
                      Archive graduate
                    </button>
                  )}
                  {access.canRemove && (
                    <button type="button" className="link-button danger" onClick={remove}>
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {editing && draft && access.canEdit ? (
            <PlayerEditForm
              draft={draft}
              setDraft={setDraft}
              account={account}
              suggestions={suggestions}
              saveEdit={saveEdit}
              setEditing={setEditing}
            />
          ) : (
            <PlayerDetails
              selected={selected}
              account={account}
              access={access}
              coachNotes={coachNotes}
              privateFields={privateFields}
              suggestions={suggestions}
            />
          )}
        </section>
      )}

      {account.isCoach && cardFor && cardFor === selectedId && (
        <ReportCard playerId={cardFor} onClose={() => setCardFor(null)} />
      )}
      {archiving && selected && account.isCoach && (
        <ArchiveGraduateModal
          player={selected}
          onClose={() => setArchiving(false)}
          onArchived={() => {
            setArchiving(false);
            setCardFor(null);
            setSelectedId(null);
          }}
        />
      )}
      {importing && (
        <RosterImportModal
          players={players}
          onClose={() => setImporting(false)}
          onImported={(outcome) => {
            if (outcome.playerIds.length) setSelectedId(outcome.playerIds[0]);
          }}
        />
      )}
    </div>
  );
}
