import type { AuthStatusView } from '../../shared/auth.contracts.ts';
import { validateAuthStatus } from '../../shared/auth.validation.ts';
import { authEpoch, invalidateAuth, onAuthInvalidated, registerAuthRenewal, suspendAuthAccess } from '../api/authLifecycle.ts';
import { clearPendingCommands } from '../api/pendingCommands.ts';
import { clearLeases } from '../api/controlLease.ts';
import { apiCredentials, apiUrl, authEndpoint, setAuthCsrf } from './transport.ts';

export type AuthState =
  | { phase: 'loading' }
  | { phase: 'signed-out' | 'ended'; status?: AuthStatusView; message?: string }
  | { phase:'renewal-required'; status:Extract<AuthStatusView,{state:'renewal-required'}> }
  | { phase: 'error'; message: string }
  | { phase: 'authenticated'; status: Extract<AuthStatusView, {authenticated:true}> };

const EARLY_RENEWAL_MS = 60_000;

/** Cookies stay in the browser's HttpOnly cookie jar; this store contains display data and CSRF only. */
export class AuthSession {
  private state: AuthState = { phase: 'loading' };
  private listeners = new Set<() => void>();
  private ticket = 0;
  private request: AbortController | null = null;
  private disconnect: (() => void) | null = null;
  private signingOut = false;
  private started = false;
  private verification: Promise<void> | null = null;
  private verificationTimer: ReturnType<typeof setTimeout> | null = null;
  private renewal: Promise<boolean> | null = null;
  private unregisterRenewal: (() => void) | null = null;
  private leaseDeadline = 0;
  private playActive = false;
  private lastInteraction = 0;
  private lastAccepted = 0;
  private readonly requestFetch: typeof fetch;
  private readonly foreground = () => {
    if (!document.hidden) void this.refresh();
  };
  constructor(requestFetch: typeof fetch = (...args) => fetch(...args)) { this.requestFetch = requestFetch; }
  getSnapshot = (): AuthState => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: AuthState) { this.state = state; for (const listener of this.listeners) listener(); }
  private clearVerificationTimer() {
    if (this.verificationTimer !== null) clearTimeout(this.verificationTimer);
    this.verificationTimer = null;
  }
  private scheduleVerification() {
    this.clearVerificationTimer();
    if (!this.started || this.state.phase !== 'authenticated') return;
    const remaining = this.leaseDeadline - Date.now();
    if (remaining <= 0) { this.expireAccess(); return; }
    const early = remaining > EARLY_RENEWAL_MS;
    this.verificationTimer = setTimeout(() => {
      this.verificationTimer = null;
      if (early && this.qualifyingUse()) void this.renew();
      else if (early) this.scheduleExpiry();
      else this.expireAccess();
    }, early ? remaining - EARLY_RENEWAL_MS : remaining);
  }
  private scheduleExpiry() {
    this.clearVerificationTimer();
    this.verificationTimer = setTimeout(() => this.expireAccess(), Math.max(0,this.leaseDeadline-Date.now()));
  }
  private expireAccess() {
    if (this.state.phase !== 'authenticated') return;
    this.clearVerificationTimer();
    suspendAuthAccess();
    const {account:_account,...status}=this.state.status;
    this.publish({phase:'renewal-required',status:{...status,state:'renewal-required',authenticated:false}});
  }
  private qualifyingUse() {
    return this.playActive && typeof document !== 'undefined' && !document.hidden &&
      Date.now()-this.lastInteraction <= EARLY_RENEWAL_MS && Date.now()-this.lastAccepted <= EARLY_RENEWAL_MS;
  }
  setPlayActive(active:boolean) { this.playActive=active; }
  noteInteraction() {
    this.lastInteraction=Date.now();
    if(this.state.phase==='authenticated' && this.leaseDeadline-Date.now()<=EARLY_RENEWAL_MS && this.qualifyingUse()) void this.renew();
  }
  private acceptedActivity = () => {
    this.lastAccepted=Date.now();
    if(this.state.phase==='authenticated' && this.leaseDeadline-Date.now()<=EARLY_RENEWAL_MS && this.qualifyingUse()) void this.renew();
  };
  /** Only explicit Continue/Resume/actions call this; focus/status never renews. */
  async ensureAccess():Promise<boolean> {
    await this.refresh();
    if(this.state.phase==='renewal-required') return this.renew();
    return this.state.phase==='authenticated';
  }
  renew = ():Promise<boolean> => {
    if(this.renewal)return this.renewal;
    if(this.signingOut || !this.started)return Promise.resolve(false);
    const epoch=authEpoch(), ticket=this.ticket;
    const run=(async()=>{
      await this.verification;
      if(epoch!==authEpoch() || ticket!==this.ticket)return false;
      if(this.signingOut || !this.started)return false;
      const status='status' in this.state ? this.state.status : undefined;
      if(!status || !('csrfToken' in status))return false;
      await this.verify('/auth/refresh',status.csrfToken);
      return this.state.phase==='authenticated';
    })();
    this.renewal=run;
    void run.finally(()=>{if(this.renewal===run)this.renewal=null;this.scheduleVerification();}).catch(()=>undefined);
    return run;
  };
  start() {
    this.disconnect ??= onAuthInvalidated(() => {
      this.ticket++; this.request?.abort(); this.verification = null; this.renewal=null;
      this.clearVerificationTimer(); setAuthCsrf(null);
      this.publish({phase:'ended', message:'Your session ended. Sign in again to return to your table.'});
    });
    if (!this.started && typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('focus', this.foreground);
      window.addEventListener('pageshow', this.foreground);
      document.addEventListener('visibilitychange', this.foreground);
    }
    this.started = true;
    this.unregisterRenewal ??= registerAuthRenewal(this.renew, this.acceptedActivity);
    return this.refresh();
  }
  stop() {
    this.unregisterRenewal?.(); this.unregisterRenewal=null; this.playActive=false;
    this.started = false; this.ticket++; this.request?.abort(); this.verification = null; this.renewal=null;
    this.clearVerificationTimer(); this.disconnect?.(); this.disconnect = null;
    setAuthCsrf(null);
    // Returning from the public demo must bootstrap again before private hooks mount.
    this.publish({phase:'loading'});
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.removeEventListener('focus', this.foreground);
      window.removeEventListener('pageshow', this.foreground);
      document.removeEventListener('visibilitychange', this.foreground);
    }
  }
  refresh(): Promise<void> {
    if (this.signingOut) return Promise.resolve();
    if (this.renewal) return this.renewal.then(()=>undefined);
    // Focus/pageshow/visibility can arrive together. Share one bounded request.
    if (this.verification) return this.verification;
    const verification = this.verify();
    this.verification = verification;
    void verification.finally(() => {
      if (this.verification === verification) this.verification = null;
      this.scheduleVerification();
    }).catch(() => undefined);
    return verification;
  }
  private async verify(path = '/api/auth/status', csrf?:string) {
    const ticket = ++this.ticket, epoch = authEpoch(), startedAt=Date.now();
    this.request?.abort();
    const controller = new AbortController(); this.request = controller;
    if (this.state.phase !== 'authenticated' && this.state.phase !== 'renewal-required') this.publish({phase:'loading'});
    const interrupted=new Promise<never>((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(new DOMException('Sign-in took too long.','AbortError')),{once:true}));
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      let response:Response;
      try {
        response=await Promise.race([this.requestFetch(apiUrl(path), {
          ...(csrf ? {method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{}'} : {}),
          credentials:apiCredentials(),cache:'no-store',signal:controller.signal,
        }),interrupted]);
        if(!response.ok)throw new Error('Sign-in is unavailable. Try again in a moment.');
      } catch(error) {
        // Never replay an ambiguous rotation. The stable cookie can discover
        // a committed lease through one non-renewing status read instead.
        if(path!=='/auth/refresh' || controller.signal.aborted || ticket!==this.ticket)throw error;
        response=await Promise.race([this.requestFetch(apiUrl('/api/auth/status'),{credentials:apiCredentials(),cache:'no-store',signal:controller.signal}),interrupted]);
        if(!response.ok)throw error;
      }
      const value: unknown = await Promise.race([response.json(),interrupted]);
      if (ticket !== this.ticket || epoch !== authEpoch()) return;
      if (!validateAuthStatus(value)) throw new Error('The sign-in service returned an unsupported response.');
      if (value.authenticated && (!value.account || !value.csrfToken)) throw new Error('The sign-in session is incomplete.');
      const previous = this.state.phase === 'authenticated' || this.state.phase === 'renewal-required' ? this.state.status : undefined;
      if (previous && (!('session' in value) || previous.session.id !== value.session.id)) {
        clearPendingCommands(); clearLeases(); invalidateAuth();
        // A replacement login must open the table through a new authenticated mount.
      }
      setAuthCsrf('csrfToken' in value ? value.csrfToken : null);
      if ('session' in value) {
        const remaining=Date.parse(value.session.accessExpiresAt)-Date.parse(value.session.serverTime);
        if(!Number.isFinite(remaining))throw new Error('The sign-in lease is incomplete.');
        this.leaseDeadline=startedAt+Math.max(0,remaining);
      }
      if(value.state==='renewal-required')suspendAuthAccess();
      this.publish(value.state==='authenticated' ? {phase:'authenticated',status:value} :
        value.state==='renewal-required' ? {phase:'renewal-required',status:value} : {phase:'signed-out',status:value});
      if(value.state==='authenticated' && this.leaseDeadline<=Date.now())this.expireAccess();
    } catch (error) {
      if (ticket !== this.ticket || epoch !== authEpoch()) return;
      setAuthCsrf(null);
      // A failed verification cannot keep private UI authorized.
      if (this.state.phase === 'authenticated') { clearPendingCommands(); clearLeases(); invalidateAuth(); }
      this.publish({phase:'error',message:error instanceof Error && error.name !== 'AbortError' ? error.message : 'Sign-in took too long. Try again.'});
    } finally { clearTimeout(timer); if (this.request === controller) this.request = null; }
  }
  login(pageUrl: string, navigate: (url: string) => void) {
    const status = 'status' in this.state ? this.state.status : undefined;
    const url = authEndpoint(status?.loginUrl ?? '/auth/login', '/auth/login', pageUrl);
    clearPendingCommands(); clearLeases(); invalidateAuth();
    navigate(url);
  }
  async logout(pageUrl: string) {
    if (this.state.phase !== 'authenticated' && this.state.phase !== 'renewal-required') return;
    const status = this.state.status;
    const endpoint = authEndpoint(status.logoutUrl, '/auth/logout', pageUrl);
    const csrf = status.csrfToken;
    this.signingOut = true;
    clearPendingCommands(); clearLeases(); invalidateAuth();
    const ticket = ++this.ticket, epoch = authEpoch();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.requestFetch(endpoint, {method:'POST',credentials:apiCredentials(),
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf ?? ''}, body:'{}',signal:controller.signal});
      if (!response.ok && response.status !== 401) throw new Error('Sign-out could not be confirmed. Try again.');
      if (ticket !== this.ticket || epoch !== authEpoch()) return;
      this.publish({phase:'signed-out',status:{mode:status.mode,loginUrl:status.loginUrl,logoutUrl:status.logoutUrl,accountUrl:status.accountUrl,refreshUrl:'/auth/refresh',state:'signed-out',authenticated:false}});
    } catch {
      if (ticket !== this.ticket || epoch !== authEpoch()) return;
      this.publish({phase:'error',message:'Sign-out could not be confirmed. Close this tab or retry sign-in to check your session.'});
    } finally {
      clearTimeout(timer); this.signingOut = false;
      // A public-page round trip may have superseded this logout's UI ticket.
      // Its new private mount still needs a bootstrap after revocation finishes.
      if (this.started && this.getSnapshot().phase === 'loading') await this.refresh();
    }
  }
}
export const authSession = new AuthSession();
