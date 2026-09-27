import { useEffect, useState } from 'react';
import type { AccountView, PaidPlan } from '../../shared/contracts';
import { api } from '../api/client';

export function AccountPage({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ action: 'select-plan'; plan: PaidPlan } | { action: 'cancel' | 'resume' } | null>(null);
  useEffect(() => { void api('/api/account', 'AccountView').then(setAccount).catch(e => setError(e instanceof Error ? e.message : 'Account unavailable.')); }, []);
  async function change() {
    if (!confirm || busy) return;
    setBusy(true); setError('');
    try { setAccount(await api('/api/account', 'AccountView', { commandId: crypto.randomUUID(), ...confirm })); setConfirm(null); await onRefresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update your plan.'); }
    finally { setBusy(false); }
  }
  return <main className="account-page"><header><a className="wordmark" href="#">Tricks Coach</a><a className="text-button" href="#">Return to table</a></header><h1>Account and subscription</h1>
    {error && <p role="alert">{error}</p>}
    {!account ? <p role="status">Opening your account…</p> : <>
      {account.authMode === 'local-test' && <p className="fixture-notice">Local test account. Plan changes use fixtures and do not charge a payment method.</p>}
      <section className="account-section"><h2>{account.player.displayName}</h2><p>Plan: <strong>{account.subscription.plan || 'Example game'}</strong></p><p>Status: {account.subscription.status}</p><p>{account.access.remainingHands === null ? 'Coaching hands included' : `${account.access.remainingHands} coached hands remaining`}</p>{account.access.resetsAt && <p>Allowance resets {new Date(account.access.resetsAt).toLocaleString()}</p>}{account.subscription.currentPeriodEnd && <p>{account.subscription.cancelAtPeriodEnd ? 'Access paid through' : 'Next renewal'} {new Date(account.subscription.currentPeriodEnd).toLocaleString()}</p>}
      {account.subscription.plan && <button className="text-button" disabled={busy} onClick={() => setConfirm({ action: account.subscription.cancelAtPeriodEnd ? 'resume' : 'cancel' })}>{account.subscription.cancelAtPeriodEnd ? 'Resume renewal' : 'Cancel renewal'}</button>}</section>
      <section className="account-section"><h2>Plans</h2><p>Prices have not been published. This local build cannot take payment.</p><div className="plan-options">{account.offers.map(offer => <article key={offer.id}><h3>{offer.name}</h3><p>{offer.description}</p><button className="primary-button" disabled={busy || account.subscription.plan === offer.id} onClick={() => setConfirm({ action: 'select-plan', plan: offer.id })}>{account.subscription.plan === offer.id ? 'Current plan' : 'Preview test plan'}</button></article>)}</div></section>
      {confirm && <section className="account-section" aria-label="Confirm subscription change"><h2>{confirm.action === 'select-plan' ? `Use ${confirm.plan} test plan?` : confirm.action === 'cancel' ? 'Cancel renewal?' : 'Resume renewal?'}</h2><p>No payment will be taken. The server applies this local fixture change.</p><button className="primary-button" disabled={busy} onClick={() => void change()}>Confirm test change</button><button className="text-button" disabled={busy} onClick={() => setConfirm(null)}>Keep current plan</button></section>}
      <a className="text-button" href="#demo">Try the example game</a>
    </>}
  </main>;
}
