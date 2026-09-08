import { useState } from 'react';
import {
  useAccount,
  useMembers,
  useInvites,
  approveMember,
  suspendMember,
  setMemberRole,
  createInvite,
  sendResetForMember,
} from '../data/accountStore.js';
import { isSupabaseConfigured } from '../data/supabaseClient.js';
import InfoTooltip from './InfoTooltip.jsx';

const ROLES = ['player', 'coach', 'admin', 'parent'];

const shortDate = (iso) => (iso ? String(iso).slice(0, 10) : '');

/**
 * MemberApproval — who is allowed in, and what they can do once they are.
 *
 * Signing up no longer grants access on its own. A new account sits pending
 * until a coach approves it or it redeems an invite code, and until then it
 * reads nothing: the database refuses it, not the interface.
 */
export default function MemberApproval() {
  const account = useAccount();
  const { members, loading } = useMembers();
  const { invites, reload: reloadInvites } = useInvites();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [newCode, setNewCode] = useState('');

  // Nothing to manage when there are no accounts: either no backend at all,
  // or signed out and running on this browser's own storage.
  if (!isSupabaseConfigured || !account.signedIn || !account.isCoach) return null;

  const run = async (key, action) => {
    setError('');
    setBusy(key);
    try {
      await action();
    } catch (err) {
      setError(err.message || 'That did not work.');
    } finally {
      setBusy('');
    }
  };

  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status !== 'pending');
  const liveInvites = invites.filter(
    (i) => i.uses < i.max_uses && (!i.expires_at || new Date(i.expires_at) > new Date()),
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>
          Members
          <InfoTooltip>
            A new account can sign in but sees nothing until it is approved or redeems an invite
            code. Roles are enforced by the database, so hiding a page is not what keeps notes
            private.
          </InfoTooltip>
        </h2>
        {pending.length > 0 && <span className="badge warn">{pending.length} waiting</span>}
      </div>

      {error && <p className="hint-text auth-error">{error}</p>}

      {pending.length > 0 && (
        <>
          <h3>Waiting for approval</h3>
          <ul className="attendance-list">
            {pending.map((m) => (
              <li key={m.user_id}>
                <span className="attendance-name">
                  {m.display_name || m.user_id.slice(0, 8)}
                  <span className="hint-text"> · joined {shortDate(m.created_at)}</span>
                </span>
                <span className="attendance-buttons">
                  <button
                    type="button"
                    className="attend-on"
                    disabled={!!busy}
                    onClick={() => run(m.user_id, () => approveMember(m.user_id))}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => run(m.user_id, () => suspendMember(m.user_id))}
                  >
                    Reject
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Everyone else</h3>
      {loading ? (
        <p className="hint-text">Loading…</p>
      ) : active.length === 0 ? (
        <p className="hint-text">No approved accounts yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="roster-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.display_name || m.user_id.slice(0, 8)}</td>
                  <td className="mono">{shortDate(m.created_at)}</td>
                  <td>
                    <span className={`track ${m.status === 'approved' ? 'competitive' : ''}`}>
                      {m.status}
                    </span>
                  </td>
                  <td>
                    <select
                      value={m.role}
                      disabled={!account.isAdmin || m.user_id === account.userId}
                      onChange={(e) => run(m.user_id, () => setMemberRole(m.user_id, e.target.value))}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {m.status === 'approved' ? (
                      <button
                        type="button"
                        className="link-button danger"
                        disabled={!!busy || m.user_id === account.userId}
                        onClick={() => run(m.user_id, () => suspendMember(m.user_id))}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="link-button"
                        disabled={!!busy}
                        onClick={() => run(m.user_id, () => approveMember(m.user_id))}
                      >
                        Reinstate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>
        Invite codes
        <InfoTooltip>
          A code approves an account the moment it is entered, so you do not have to be around
          when someone signs up. Codes expire after 30 days.
        </InfoTooltip>
      </h3>

      <div className="button-grid">
        <button
          type="button"
          className="primary"
          disabled={busy === 'invite'}
          onClick={() =>
            run('invite', async () => {
              setNewCode(await createInvite({ note: 'Club member' }));
              reloadInvites();
            })
          }
        >
          New single-use code
        </button>
        <button
          type="button"
          disabled={busy === 'invite5'}
          onClick={() =>
            run('invite5', async () => {
              setNewCode(await createInvite({ note: 'Club intake', maxUses: 20 }));
              reloadInvites();
            })
          }
        >
          New code for 20
        </button>
      </div>

      {newCode && (
        <p className="hint-box">
          Share this code: <strong className="mono">{newCode}</strong>
        </p>
      )}

      {liveInvites.length > 0 && (
        <p className="hint-text">
          {liveInvites.length} code{liveInvites.length === 1 ? '' : 's'} still usable:{' '}
          {liveInvites.map((i) => `${i.code} (${i.max_uses - i.uses} left)`).join(', ')}
        </p>
      )}

      <h3>
        Password help
        <InfoTooltip>
          For a member who cannot reach their own inbox, send the reset to the guardian email you
          recorded at intake.
        </InfoTooltip>
      </h3>
      <ResetForMember onRun={run} busy={busy} />
    </section>
  );
}

function ResetForMember({ onRun, busy }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <form
      className="roster-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!email.trim()) return;
        onRun('reset', async () => {
          await sendResetForMember(email);
          setSent(true);
          setEmail('');
        });
      }}
    >
      <label className="field field-wide">
        <span>Send a reset link to</span>
        <input
          type="email"
          placeholder="guardian@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSent(false);
          }}
        />
      </label>
      <button type="submit" className="form-submit" disabled={busy === 'reset'}>
        {busy === 'reset' ? 'Sending…' : 'Send reset link'}
      </button>
      {sent && <p className="hint-text sync-result">Sent.</p>}
    </form>
  );
}
