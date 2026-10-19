import { useState, useSyncExternalStore } from 'react';
import { authSession } from './session.ts';
import { trustedAccountUrl } from './transport.ts';

export function RealAccountPage() {
  const state = useSyncExternalStore(authSession.subscribe,authSession.getSnapshot);
  const [busy,setBusy] = useState(false);
  if (state.phase !== 'authenticated' || !state.status.account) return null;
  const account = state.status.account;
  let accountUrl: string | null = null;
  try { accountUrl = trustedAccountUrl(state.status.accountUrl); } catch { /* A misconfigured link must not navigate. */ }
  return <main className="account-page rally-page">
    <header className="rally-page-header"><a className="rally-page-brand" href="#"><img src="/brand/cardford-symbol.svg" alt=""/>CardFord</a><a className="text-button" href="#">Return to table</a></header>
    <div className="rally-page-title"><h1>Account.</h1></div>
    <section className="account-section rally-account-summary">
      <div className="rally-profile-heading"><span className="rally-profile-avatar" aria-hidden="true">{account.displayName.charAt(0).toUpperCase()}</span><h2>{account.displayName}</h2></div>
      <p>Plan: <strong>{account.plan === 'paid' ? 'Paid' : 'Free'}</strong></p>
      {accountUrl ? <a className="text-button" href={accountUrl} target="_blank" rel="noopener noreferrer">Manage sign-in and security</a> : <p>Account security settings are temporarily unavailable.</p>}
    </section>
    <section className="account-section"><h2>Your plan</h2><p>Plan purchasing and subscription changes are not available yet.</p></section>
    <section className="account-section"><h2>Sign-in</h2><p>Signing out closes this session on this device.</p>
      <button className="text-button" disabled={busy} onClick={()=>{setBusy(true);void authSession.logout(window.location.href).finally(()=>setBusy(false));}}>Sign out</button>
    </section>
    <a className="text-button" href="#demo">Try the example game</a>
  </main>;
}
