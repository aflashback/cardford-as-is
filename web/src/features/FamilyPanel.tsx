import { useEffect, useRef, useState } from 'react';
import type { FamilyCommand, FamilyView } from '../../shared/contracts';
import { api, ApiFailure } from '../api/client';

type FamilyIntent = FamilyCommand extends infer C
  ? C extends FamilyCommand
    ? Omit<C, 'commandId'>
    : never
  : never;
export function FamilyPanel({ onChange }: { onChange: () => Promise<unknown> }) {
  const [family, setFamily] = useState<FamilyView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invitee, setInvitee] = useState('');
  const [seatClass, setSeatClass] = useState<'unlimited' | 'limited'>('limited');
  const [token, setToken] = useState('');
  const [acknowledge, setAcknowledge] = useState(false);
  const [confirm, setConfirm] = useState<FamilyIntent | null>(null);
  const pending = useRef<FamilyCommand | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    void api('/api/family', 'FamilyView')
      .then(setFamily)
      .catch((e) => setError(e instanceof Error ? e.message : 'Family settings unavailable.'));
  }, []);
  async function send(intent?: FamilyIntent) {
    if (inFlight.current || (!intent && !pending.current)) return;
    const command = pending.current ?? { commandId: crypto.randomUUID(), ...intent! };
    pending.current = command;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      setFamily(await api('/api/family', 'FamilyView', command));
      pending.current = null;
      setConfirm(null);
      setInvitee('');
      setToken('');
      await onChange();
    } catch (e) {
      if (e instanceof ApiFailure && e.status < 500) pending.current = null;
      setError(e instanceof Error ? e.message : 'Family change failed.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="family-panel">
      {error && <p role="alert">{error}</p>}
      {pending.current && !busy && (
        <button className="text-button" onClick={() => void send()}>
          Retry same family change
        </button>
      )}
      {!family ? (
        <p>Opening family settings…</p>
      ) : (
        <>
          <p className="fixture-notice">
            Local family fixture. Invitations use existing test account IDs; no invitation email is sent.
          </p>
          {family.payer && <p>Paid by {family.payer.displayName}</p>}
          {family.role === 'none' && (
            <>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void send({ action: 'create' })}
              >
                Create test family
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send({ action: 'accept', token, acknowledgeIndividualCoverage: acknowledge });
                }}
              >
                <label>
                  Invitation token
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={acknowledge}
                    onChange={(e) => setAcknowledge(e.target.checked)}
                  />
                  I understand an existing individual subscription is not automatically canceled.
                </label>
                <button className="text-button" disabled={busy || !token}>
                  Accept invitation
                </button>
              </form>
            </>
          )}
          {family.members.map((member) => (
            <div className="family-member" key={member.assignmentId}>
              <span>
                {member.displayName} · {member.seatClass} ·{' '}
                {member.status === 'held' ? 'Seat held until period end' : 'Active'}
              </span>
              {family.role === 'payer' &&
                member.playerId !== family.payer?.playerId &&
                member.status === 'active' && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setConfirm({ action: 'remove', assignmentId: member.assignmentId })}
                  >
                    Remove member
                  </button>
                )}
            </div>
          ))}
          {family.role === 'payer' && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send({ action: 'invite', inviteeId: invitee, seatClass });
                }}
              >
                <label>
                  Existing test account ID
                  <input value={invitee} onChange={(e) => setInvitee(e.target.value)} required />
                </label>
                <label>
                  Coaching seat
                  <select
                    value={seatClass}
                    onChange={(e) => setSeatClass(e.target.value === 'limited' ? 'limited' : 'unlimited')}
                  >
                    <option value="limited">Limited</option>
                    <option value="unlimited">Unlimited</option>
                  </select>
                </label>
                <button className="primary-button" disabled={busy || !invitee}>
                  Create invitation
                </button>
              </form>
              <div>
                {family.invitations.map((invitation) => (
                  <div className="family-invitation" key={invitation.invitationId}>
                    <p>
                      For test account {invitation.inviteeId} · {invitation.seatClass}
                    </p>
                    <p>Expires {new Date(invitation.expiresAt).toLocaleString()}</p>
                    {invitation.token && (
                      <label>
                        Invitation token
                        <input readOnly value={invitation.token} onFocus={(e) => e.currentTarget.select()} />
                      </label>
                    )}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({ action: 'revoke-invite', invitationId: invitation.invitationId })
                      }
                    >
                      Revoke invitation
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {family.role === 'member' && (
            <button className="text-button" disabled={busy} onClick={() => setConfirm({ action: 'leave' })}>
              Leave family
            </button>
          )}
          {confirm && (
            <div className="family-confirm">
              <p>
                {confirm.action === 'remove'
                  ? 'Remove this member’s active family access? Their account and private records remain theirs.'
                  : confirm.action === 'leave'
                    ? 'Leave this family? Your account and private records remain yours.'
                    : 'Revoke this invitation?'}
              </p>
              <button className="primary-button" disabled={busy} onClick={() => void send(confirm)}>
                Confirm
              </button>
              <button className="text-button" disabled={busy} onClick={() => setConfirm(null)}>
                Keep unchanged
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
