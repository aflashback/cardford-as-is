import { useEffect, useRef, useState } from 'react';
import type { AccountView, BillingPreview, BillingPreviewRequest } from '../../shared/contracts';
import { api, ApiFailure, definiteFailure } from '../api/client';
import { backend } from '../platform/web';
import type { PlatformAccountView, AccessOffer, RegisteredTarget } from '../../shared/local-service.contracts';
import { clearGoPending, executeGo, readGoPending, recoverGoPending, restoreGoPending, type GoPending } from '../api/goPendingCommands';
import { FamilyPanel } from './FamilyPanel';
import { DataControls } from './DataControls';

function targetLabel(target:RegisteredTarget):string {
  return target.gameId === 'hearts' ? 'Hearts' : target.variantId === 'partners' ? 'Spades Partners' : 'Spades Solo';
}
function accessReason(reason:string):string {
  return ({'exhausted':'Allowance used', 'expired':'Access expired', 'revoked':'Access removed',
    'no-grant':'Unavailable', 'wrong-target':'Unavailable for this game', 'disabled':'Unavailable',
    'not-admitted':'Start an eligible hand first'} as Record<string,string>)[reason] ?? 'Unavailable';
}

export function AccountPage({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [deleted, setDeleted] = useState(false);
  const [account, setAccount] = useState<AccountView | null>(null);
  const [platform, setPlatform] = useState<PlatformAccountView | null>(null);
  const [goPending, setGoPending] = useState<GoPending | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [showFamily, setShowFamily] = useState(false);
  const pending = useRef<{ commandId: string; previewId: string } | null>(null);
  const inFlight = useRef(false);
  const confirmation = useRef<HTMLHeadingElement>(null);
  const reload = async () => {
    if (backend === 'go') {
      await api('/api/local/session', 'IdentityView', {});
      const value = await api('/api/account', 'PlatformAccountView');
      setPlatform(value); setAccount(value.fixtureAccount);
      setGoPending(readGoPending('account', value.player.id));
    } else setAccount(await api('/api/account', 'AccountView'));
  };
  async function verifyOwner() {
    if (backend !== 'go') return account?.player.id ?? '';
    const identity = await api('/api/identity', 'IdentityView');
    if (identity.playerId !== platform?.player.id) {
      setPlatform(null); setAccount(null); setPreview(null); pending.current = null;
      throw new Error('The signed-in player changed. Reconnect before continuing.');
    }
    return identity.playerId;
  }
  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : 'Account unavailable.'));
  }, []);
  useEffect(() => {
    if (preview) confirmation.current?.focus();
  }, [preview]);
  async function requestPreview(request: BillingPreviewRequest) {
    if (inFlight.current || pending.current || goPending) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await verifyOwner();
      setPreview(await api('/api/subscription/preview', 'BillingPreview', request));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview unavailable.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function change() {
    if (!preview || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const command = pending.current ?? { commandId: crypto.randomUUID(), previewId: preview.previewId };
    pending.current = command;
    try {
      const ownerId = await verifyOwner();
      const result = backend === 'go'
        ? await executeGo('account', '/api/subscription/change', 'BillingOperation', command, ownerId, 'account')
        : await api('/api/subscription/change', 'BillingOperation', command);
      pending.current = null;
      setNotice(result.message);
      setPreview(null);
      await reload();
      await onRefresh();
    } catch (e) {
      if (definiteFailure(e)) pending.current = null;
      if (backend === 'go' && platform) setGoPending(readGoPending('account', platform.player.id));
      setError(e instanceof Error ? e.message : 'Could not update your plan. Retry this confirmation.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function activateTrial(offer:AccessOffer) {
    if (!platform || inFlight.current || goPending) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const playerId = await verifyOwner();
      await executeGo('account', '/api/access/trials', 'LocalServiceTrialReceipt', {
        commandId:crypto.randomUUID(), offerId:offer.id, offerVersion:offer.version,
        expectedAccessGeneration:platform.accessGeneration,
      }, playerId, 'account');
      setNotice('Your access trial is ready.'); await reload();
    } catch (e) {
      setGoPending(readGoPending('account', platform.player.id));
      setError(e instanceof Error ? e.message : 'Could not confirm this trial.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function retryGoChange() {
    if (!goPending || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await verifyOwner();
      const receipt = await recoverGoPending(goPending);
      if (!receipt) await api(goPending.path, 'PlatformRecoveredReceipt', await restoreGoPending(goPending));
      clearGoPending('account'); setGoPending(null); pending.current = null; setPreview(null);
      setNotice('Your previous change is confirmed.'); await reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not confirm this change.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (deleted)
    return (
      <main className="account-page">
        <h1>Local account deleted</h1>
        <p>Your local session has ended. No real subscription was canceled.</p>
        {error && <p role="alert">{error}</p>}
        <button
          className="primary-button"
          onClick={() => {
            void (backend === 'go' ? api('/api/local/session', 'IdentityView', {}) : api('/api/local/session', 'AcceptedView', {}))
              .then(() => {
                window.location.hash = '';
                window.location.reload();
              })
              .catch((e) => setError(e instanceof Error ? e.message : 'Could not start a local session.'));
          }}
        >
          Start a new local account
        </button>
        <a href="#demo">Example game</a>
      </main>
    );
  if (platform?.mode === 'configured') return (
    <main className="account-page">
      <header><a className="wordmark" href="#">CardFord</a><a className="text-button" href="#">Return to table</a></header>
      <h1>Account and subscription</h1>
      <p className="fixture-notice">Local test account. No payment method is charged.</p>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {goPending && <button className="text-button" disabled={busy} onClick={()=>void retryGoChange()}>Retry same change</button>}
      <section className="account-section">
        <h2>{platform.player.displayName}</h2>
        <label className="local-account-id">Local account ID<input readOnly value={platform.player.id} aria-label="Local account ID" onFocus={e=>e.currentTarget.select()} /></label>
      </section>
      <section className="account-section"><h2>Practice access</h2>
        {platform.availability.map(item=><article key={`${item.target.gameId}:${item.target.variantId}`}>
          <h3>{targetLabel(item.target)}</h3>
          <p>Play: {item.play.allowed ? 'Available' : accessReason(item.play.reason)}</p>
          <p>Coaching: {item.coach.allowed ? item.coach.remaining === null ? 'Included' : `${item.coach.remaining} hands remaining` : accessReason(item.coach.reason)}</p>
        </article>)}
      </section>
      <section className="account-section"><h2>Available offers</h2>
        {!platform.offers?.offers.some(offer=>offer.enabled) && <p>No offers are available.</p>}
        <div className="plan-options">{platform.offers?.offers.filter(offer=>offer.enabled).map(offer=>{
          const eligible = platform.availability.some(item=>item.trialEligibleOfferIds.includes(offer.id));
          const allowance = offer.coach.allowance;
          return <article key={`${offer.id}:${offer.version}`}>
            <h3>{offer.id}</h3><p>{offer.targets.map(targetLabel).join(', ')}</p>
            <p>{offer.play ? 'Practice included.' : 'Coaching access.'} {allowance.kind === 'unlimited' ? 'Coaching included.' : `${allowance.limit} ${allowance.unit}${allowance.period === 'day' ? ' each UTC day' : ' during this offer'}.`}</p>
            {offer.kind === 'access-trial' && <button className="primary-button" disabled={busy || !!goPending || !eligible} onClick={()=>void activateTrial(offer)}>{eligible ? 'Start access trial' : 'Trial unavailable'}</button>}
            {offer.kind === 'paid' && <p>Purchasing is unavailable in this local build.</p>}
          </article>;
        })}</div>
      </section>
      <section className="account-section"><h2>Subscription and family</h2><p>Subscription changes and family settings are unavailable for these configured offers.</p></section>
      <DataControls onDeleted={()=>{setAccount(null);setPlatform(null);setPreview(null);pending.current=null;setDeleted(true);}} />
      <a className="text-button" href="#demo">Try the example game</a>
    </main>
  );
  return (
    <main className="account-page">
      <header>
        <a className="wordmark" href="#">
          CardFord
        </a>
        <a className="text-button" href="#">
          Return to table
        </a>
      </header>
      <h1>Account and subscription</h1>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {goPending && <button className="text-button" disabled={busy} onClick={()=>void retryGoChange()}>Retry same change</button>}
      {!account ? (
        <>
          <p role="status">Opening your account…</p>
          {error && (
            <button className="text-button" onClick={() => void reload()}>
              Reconnect
            </button>
          )}
        </>
      ) : (
        <>
          {account.authMode === 'local-test' && (
            <p className="fixture-notice">
              Local test account. Plan changes use fixtures and do not charge a payment method.
            </p>
          )}
          <section className="account-section">
            <h2>{account.player.displayName}</h2>
            {account.authMode === 'local-test' && (
              <label className="local-account-id">
                Local account ID
                <input
                  readOnly
                  value={account.player.id}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Local account ID"
                />
              </label>
            )}
            <p>
              Plan: <strong>{account.subscription.plan || 'Example game'}</strong>
            </p>
            <p>Status: {account.subscription.status}</p>
            <p>
              {account.access.remainingHands === null
                ? 'Coaching hands included'
                : `${account.access.remainingHands} coached hands remaining`}
            </p>
            {account.access.resetsAt && (
              <p>Allowance resets {new Date(account.access.resetsAt).toLocaleString()}</p>
            )}
            {account.subscription.currentPeriodEnd && (
              <p>
                {account.subscription.cancelAtPeriodEnd ? 'Access paid through' : 'Next renewal'}{' '}
                {new Date(account.subscription.currentPeriodEnd).toLocaleString()}
              </p>
            )}
            {account.subscription.plan && (
              <button
                className="text-button"
                disabled={busy || !!goPending}
                onClick={() =>
                  void requestPreview({
                    action: account.subscription.cancelAtPeriodEnd ? 'resume' : 'cancel',
                  })
                }
              >
                {account.subscription.cancelAtPeriodEnd ? 'Resume renewal' : 'Cancel renewal'}
              </button>
            )}
          </section>
          <section className="account-section">
            <h2>Plans</h2>
            <p>Prices have not been published. This local build cannot take payment.</p>
            <div className="plan-options">
              {account.offers.map((offer) => (
                <article key={offer.id}>
                  <h3>{offer.name}</h3>
                  <p>{offer.description}</p>
                  <button
                    className="primary-button"
                    disabled={busy || !!goPending || account.subscription.plan === offer.id}
                    onClick={() => void requestPreview({ action: 'select-plan', plan: offer.id })}
                  >
                    {account.subscription.plan === offer.id ? 'Current plan' : 'Preview test plan'}
                  </button>
                </article>
              ))}
            </div>
          </section>
          {preview && (
            <section className="account-section" aria-label="Confirm subscription change">
              <h2 ref={confirmation} tabIndex={-1}>
                {preview.action === 'select-plan'
                  ? `Use ${preview.plan} test plan?`
                  : preview.action === 'cancel'
                    ? 'Cancel renewal?'
                    : 'Resume renewal?'}
              </h2>
              <p>{preview.notice}</p>
              <p>Effective {new Date(preview.effectiveAt).toLocaleString()}</p>
              <p>Amount due now: no live charge (local fixture).</p>
              <button className="primary-button" disabled={busy} onClick={() => void change()}>
                {pending.current ? 'Retry same change' : 'Confirm test change'}
              </button>
              <button
                className="text-button"
                disabled={busy || !!pending.current}
                onClick={() => setPreview(null)}
              >
                Keep current plan
              </button>
            </section>
          )}
          <section className="account-section">
            <h2>Family</h2>
            <p>Members keep their own cards, coaching and allowance private.</p>
            <button className="text-button" onClick={() => setShowFamily((value) => !value)}>
              {showFamily ? 'Close family settings' : 'Manage family'}
            </button>
            {showFamily && <FamilyPanel onChange={reload} />}
          </section>
          <DataControls
            onDeleted={() => {
              setAccount(null);
              setPreview(null);
              pending.current = null;
              setError('');
              setDeleted(true);
              try {
                sessionStorage.removeItem('tricks-tab');
              } catch {
                /* Storage may be unavailable. */
              }
            }}
          />
          <a className="text-button" href="#demo">
            Try the example game
          </a>
        </>
      )}
    </main>
  );
}
