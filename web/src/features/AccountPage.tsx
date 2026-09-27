import { useEffect, useRef, useState } from 'react';
import type { AccountView, BillingPreview, BillingPreviewRequest } from '../../shared/contracts';
import { api, ApiFailure } from '../api/client';
import { FamilyPanel } from './FamilyPanel';
import { DataControls } from './DataControls';

export function AccountPage({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [deleted, setDeleted] = useState(false);
  const [account, setAccount] = useState<AccountView | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [showFamily, setShowFamily] = useState(false);
  const pending = useRef<{ commandId: string; previewId: string } | null>(null);
  const inFlight = useRef(false);
  const confirmation = useRef<HTMLHeadingElement>(null);
  const reload = () => api('/api/account', 'AccountView').then(setAccount);
  useEffect(() => { void reload().catch(e => setError(e instanceof Error ? e.message : 'Account unavailable.')); }, []);
  useEffect(() => { if (preview) confirmation.current?.focus(); }, [preview]);
  async function requestPreview(request: BillingPreviewRequest) {
    if (inFlight.current || pending.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { setPreview(await api('/api/subscription/preview', 'BillingPreview', request)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Preview unavailable.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function change() {
    if (!preview || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    const command = pending.current ?? { commandId: crypto.randomUUID(), previewId: preview.previewId };
    pending.current = command;
    try { const result = await api('/api/subscription/change', 'BillingOperation', command); pending.current = null; setNotice(result.message); setPreview(null); await reload(); await onRefresh(); }
    catch (e) { if (e instanceof ApiFailure && e.status < 500) pending.current = null; setError(e instanceof Error ? e.message : 'Could not update your plan. Retry this confirmation.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (deleted) return <main className="account-page"><h1>Local account deleted</h1><p>Your local session has ended. No real subscription was canceled.</p>{error && <p role="alert">{error}</p>}<button className="primary-button" onClick={() => { void api('/api/local/session', 'AcceptedView', {}).then(() => { window.location.hash = ''; window.location.reload(); }).catch(e => setError(e instanceof Error ? e.message : 'Could not start a local session.')); }}>Start a new local account</button><a href="#demo">Example game</a></main>;
  return <main className="account-page"><header><a className="wordmark" href="#">Tricks Coach</a><a className="text-button" href="#">Return to table</a></header><h1>Account and subscription</h1>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!account ? <><p role="status">Opening your account…</p>{error && <button className="text-button" onClick={() => void reload()}>Reconnect</button>}</> : <>
      {account.authMode === 'local-test' && <p className="fixture-notice">Local test account. Plan changes use fixtures and do not charge a payment method.</p>}
      <section className="account-section"><h2>{account.player.displayName}</h2>{account.authMode === 'local-test' && <label className="local-account-id">Local account ID<input readOnly value={account.player.id} onFocus={event => event.currentTarget.select()} aria-label="Local account ID" /></label>}<p>Plan: <strong>{account.subscription.plan || 'Example game'}</strong></p><p>Status: {account.subscription.status}</p><p>{account.access.remainingHands === null ? 'Coaching hands included' : `${account.access.remainingHands} coached hands remaining`}</p>{account.access.resetsAt && <p>Allowance resets {new Date(account.access.resetsAt).toLocaleString()}</p>}{account.subscription.currentPeriodEnd && <p>{account.subscription.cancelAtPeriodEnd ? 'Access paid through' : 'Next renewal'} {new Date(account.subscription.currentPeriodEnd).toLocaleString()}</p>}
      {account.subscription.plan && <button className="text-button" disabled={busy} onClick={() => void requestPreview({ action: account.subscription.cancelAtPeriodEnd ? 'resume' : 'cancel' })}>{account.subscription.cancelAtPeriodEnd ? 'Resume renewal' : 'Cancel renewal'}</button>}</section>
      <section className="account-section"><h2>Plans</h2><p>Prices have not been published. This local build cannot take payment.</p><div className="plan-options">{account.offers.map(offer => <article key={offer.id}><h3>{offer.name}</h3><p>{offer.description}</p><button className="primary-button" disabled={busy || account.subscription.plan === offer.id} onClick={() => void requestPreview({ action: 'select-plan', plan: offer.id })}>{account.subscription.plan === offer.id ? 'Current plan' : 'Preview test plan'}</button></article>)}</div></section>
      {preview && <section className="account-section" aria-label="Confirm subscription change"><h2 ref={confirmation} tabIndex={-1}>{preview.action === 'select-plan' ? `Use ${preview.plan} test plan?` : preview.action === 'cancel' ? 'Cancel renewal?' : 'Resume renewal?'}</h2><p>{preview.notice}</p><p>Effective {new Date(preview.effectiveAt).toLocaleString()}</p><p>Amount due now: no live charge (local fixture).</p><button className="primary-button" disabled={busy} onClick={() => void change()}>{pending.current ? 'Retry same change' : 'Confirm test change'}</button><button className="text-button" disabled={busy || !!pending.current} onClick={() => setPreview(null)}>Keep current plan</button></section>}
      <section className="account-section"><h2>Family</h2><p>Members keep their own cards, coaching and allowance private.</p><button className="text-button" onClick={() => setShowFamily(value => !value)}>{showFamily ? 'Close family settings' : 'Manage family'}</button>{showFamily && <FamilyPanel onChange={reload} />}</section>
      <DataControls onDeleted={() => { setAccount(null); setPreview(null); pending.current = null; setError(''); setDeleted(true); try { sessionStorage.removeItem('tricks-tab'); } catch { /* Storage may be unavailable. */ } }} />
      <a className="text-button" href="#demo">Try the example game</a>
    </>}
  </main>;
}
