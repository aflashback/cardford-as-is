import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { backend } from '../platform/web.ts';
import { authMode } from './transport.ts';
import { authSession } from './session.ts';
import './auth.css';
import { authEpoch } from '../api/authLifecycle.ts';

export function AuthGate({children}: {children:ReactNode}) {
  if (authMode === 'fixture') return children;
  if (backend !== 'go') return <AuthScreen title="Sign-in is unavailable"><p role="alert">This build needs the native service to sign in.</p></AuthScreen>;
  return <VerifiedSession>{children}</VerifiedSession>;
}
function VerifiedSession({children}: {children:ReactNode}) {
  const state = useSyncExternalStore(authSession.subscribe,authSession.getSnapshot);
  useEffect(() => {
    void authSession.start();
    return () => authSession.stop();
  },[]);
  if (state.phase === 'authenticated') return <Fragment key={authEpoch()}>{children}</Fragment>;
  if (state.phase === 'loading') return <AuthScreen title="Pull up a chair."><p role="status">Checking your sign-in…</p></AuthScreen>;
  if (state.phase === 'renewal-required') return <AuthScreen title="Welcome back." secondaryAction={<button className="text-button" onClick={()=>void authSession.logout(window.location.href)}>Sign out</button>}><p>Continue securely to CardFord.</p><button className="primary-button" onClick={()=>void authSession.renew()}>Continue</button></AuthScreen>;
  if (state.phase === 'error') return <AuthScreen title="We couldn’t connect.">
    <p role="alert">{state.message}</p><button className="primary-button" onClick={()=>void authSession.refresh()}>Try again</button>
  </AuthScreen>;
  return <AuthScreen title={state.phase === 'ended' ? 'Your session ended.' : 'Good cards. Better company.'}>
    <p>{state.phase === 'ended' ? state.message : 'A little practice. A few good tricks. Your next hand is waiting.'}</p>
    <button className="primary-button" onClick={()=>authSession.login(window.location.href,url=>window.location.assign(url))}>Sign in or create an account</button>
    <p className="auth-help">Continue securely with your email or a connected account.</p>
  </AuthScreen>;
}
function AuthScreen({title,children,secondaryAction}: {title:string;children:ReactNode;secondaryAction?:ReactNode}) {
  return <main className="account-page rally-page auth-page">
    <header className="rally-page-header"><a className="rally-page-brand" href="#"><img src="/brand/cardford-symbol.svg" alt=""/>CardFord</a></header>
    <section className="auth-welcome" aria-labelledby="auth-title">
      <h1 id="auth-title">{title}</h1>{children}
      <div className="auth-secondary">{secondaryAction}<a className="text-button" href="#demo">Try an example game</a></div>
    </section>
  </main>;
}
