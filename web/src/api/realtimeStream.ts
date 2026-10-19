import type { RealtimeMessage, RealtimeSnapshot } from '../../shared/local-service.contracts.ts';
import { validateContract } from '../../shared/local-service.validation.ts';
import { api, ApiFailure } from './client.ts';
import { streamUrl } from '../auth/transport.ts';
import { onAuthAccessSuspended } from './authLifecycle.ts';

type Events = {
  snapshot: (value: RealtimeSnapshot) => Promise<void>;
  message: (value: RealtimeMessage) => Promise<void>;
  disconnected: () => void;
  status?: (value:'live'|'http'|'recovering'|'suspended'|'retry') => void;
};

// One coordinator owns snapshot ordering and the receive-only socket. A socket
// opens before its snapshot; messages received during the GET are buffered.
export class RealtimeStream {
  private socket: WebSocket | null = null;
  private streamId: string | null = null;
  private cursor = 0;
  private buffering = true;
  private buffered: {value: RealtimeMessage; bytes: number}[] = [];
  private bufferedBytes = 0;
  private pendingBytes = 0;
  private pendingFrames = 0;
  private draining: Promise<void> = Promise.resolve();
  private connectionEpoch = 0;
  private recovery: Promise<RealtimeSnapshot> | null = null;
  private postRecovery: Promise<RealtimeSnapshot> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 250;
  private retryAfterUntil = 0;
  private stopped = false;
  private suspended = true;
  private paused = true;
  private request:AbortController|null = null;
  private recoveryStartedAt = 0;
  private retryExhausted = false;
  private online = false;
  private httpOnly = false;
  private playbackRunning = false;
  private waiters = new Set<{after: number; resolve: () => void; reject: (error: Error) => void}>();
  private readonly events: Events;
  private readonly disconnectAuth:()=>void;
  private readonly offline=()=>this.suspend();
  private readonly foreground = () => {
    if(document.hidden){this.suspend();return;}
    if (this.eligible() && !this.connected) {
      this.recoveryStartedAt=Date.now();this.retryExhausted=false;
      void this.recover().catch(() => this.scheduleReconnect());
    }
  };

  constructor(events: Events) { this.events = events;this.disconnectAuth=onAuthAccessSuspended(()=>this.suspend()); }

  get sequence() { return this.cursor; }
  get connected() { return this.online && this.socket?.readyState === WebSocket.OPEN; }
  get mode(): 'live' | 'http' | 'recovering'|'suspended'|'retry' {
    return this.suspended?'suspended':this.retryExhausted?'retry':this.connected ? 'live' : this.httpOnly ? 'http' : 'recovering';
  }

  // Only the owner may clear this latch, after an accepted Resume response.
  // Foreground events and HTTP snapshots cannot grant permission to stream.
  setPaused(paused:boolean) {
    if(this.paused===paused)return;
    this.paused=paused;
    if(paused)this.suspend();
    else { this.suspended=false;this.recoveryStartedAt=0;this.retryExhausted=false; }
  }

  private snapshotEligible(){return !this.stopped&&!document.hidden&&navigator.onLine;}
  private eligible(){return this.snapshotEligible()&&!this.suspended&&!this.paused;}
  suspend() {
    this.paused=true;this.suspended=true;this.connectionEpoch++;this.online=false;
    this.streamId=null;
    if(this.retryTimer)clearTimeout(this.retryTimer);this.retryTimer=null;
    if(this.fallbackTimer)clearTimeout(this.fallbackTimer);this.fallbackTimer=null;
    this.request?.abort();this.request=null;
    const socket=this.socket;this.socket=null;socket?.close();
    this.buffered=[];this.bufferedBytes=0;
    this.recovery=null;this.postRecovery=null;
    for(const waiter of this.waiters)waiter.reject(new Error('The session stream is suspended.'));
    this.events.status?.('suspended');
  }

  notePlayback(running:boolean) {
    if (this.playbackRunning === running) return;
    this.playbackRunning = running;
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
    this.scheduleFallback();
  }

  async start(): Promise<RealtimeSnapshot> {
    window.addEventListener('online', this.foreground);
    window.addEventListener('offline',this.offline);
    document.addEventListener('visibilitychange', this.foreground);
    return this.recover();
  }

  recover(workIds: string[] = []): Promise<RealtimeSnapshot> {
    if (this.stopped) return Promise.reject(new Error('The session stream is closed.'));
    if(document.hidden||!navigator.onLine)return Promise.reject(new Error('The session stream is suspended.'));
    if(!this.recoveryStartedAt)this.recoveryStartedAt=Date.now();
    if (this.recovery) {
      if (workIds.length === 0) return this.recovery;
      return this.recovery.then(() => this.recover(workIds));
    }
    const run = this.takeSnapshot(workIds.slice(0, 4));
    this.recovery = run;
    void run.finally(() => { if (this.recovery === run) this.recovery = null; }).catch(() => undefined);
    return run;
  }

  // Control and access notifications can arrive while a snapshot is flushing
  // buffered frames. They require a later snapshot, not the one being flushed.
  recoverAfterCurrent(): Promise<RealtimeSnapshot> {
    if (this.postRecovery) return this.postRecovery;
    const current = this.recovery;
    const next = current ? current.catch(() => undefined).then(() => this.recover()) : this.recover();
    this.postRecovery = next;
    void next.finally(() => { if (this.postRecovery === next) this.postRecovery = null; }).catch(() => undefined);
    return next;
  }

  waitForSequence(after: number, timeoutMs = 1500): Promise<void> {
    if (this.cursor > after) return Promise.resolve();
    if (!this.connected) return Promise.reject(new Error('The session stream is disconnected.'));
    return new Promise<void>((resolve, reject) => {
      const waiter = {after, resolve: () => { clearTimeout(timer); this.waiters.delete(waiter); resolve(); },
        reject: (error: Error) => { clearTimeout(timer); this.waiters.delete(waiter); reject(error); }};
      const timer = setTimeout(() => waiter.reject(new Error('The session stream has not confirmed this change.')), timeoutMs);
      this.waiters.add(waiter);
    });
  }

  close() {
    this.stopped = true;
    this.disconnectAuth();
    this.suspend();
    window.removeEventListener('online', this.foreground);
    window.removeEventListener('offline',this.offline);
    document.removeEventListener('visibilitychange', this.foreground);
    this.online = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.buffered = [];
    for (const waiter of this.waiters) waiter.reject(new Error('The session stream closed.'));
  }

  private async takeSnapshot(workIds: string[]): Promise<RealtimeSnapshot> {
    const epoch = ++this.connectionEpoch;
    const request=new AbortController();this.request?.abort();this.request=request;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
    const reuse = this.connected && this.streamId !== null;
    if (!reuse) {
      this.online = false;
      const socket = this.socket;
      this.socket = null;
      socket?.close();
    }
    this.buffered = [];
    this.bufferedBytes = 0;
    this.buffering = true;
    // A retired frame may still be finishing an async view conversion. Let it
    // finish before publishing the new snapshot, then fence its cursor write.
    await this.draining.catch(() => undefined);
    if (!this.snapshotEligible() || epoch !== this.connectionEpoch) throw new Error('The session stream changed.');
    let streamId: string | null = reuse ? this.streamId : null;
    if (this.eligible() && !reuse && !this.httpOnly) {
      try {
        const negotiated = await api('/api/realtime/negotiate', 'RealtimeNegotiateView', {},'POST',request.signal);
        if (!this.eligible() || epoch !== this.connectionEpoch) throw new Error('The session stream changed.');
        this.httpOnly = !negotiated.enabled || negotiated.mode === 'http';
        if (negotiated.enabled && negotiated.mode === 'local' && negotiated.streamId && negotiated.url) {
          streamId = negotiated.streamId;
          await this.openSocket(negotiated.url, streamId, epoch);
          if (!this.eligible() || epoch !== this.connectionEpoch) throw new Error('The session stream changed.');
        }
      } catch (error) {
        if (!this.snapshotEligible() || epoch !== this.connectionEpoch) throw error;
        if (error instanceof ApiFailure && error.status === 401) throw error;
        if (error instanceof ApiFailure && error.retryAfterMs !== undefined)
          this.retryAfterUntil = Math.max(this.retryAfterUntil, Date.now() + error.retryAfterMs);
        const socket = this.socket; this.socket = null; socket?.close();
        streamId = null;
        this.httpOnly = false;
        // A disconnected stream can still recover an authorized HTTP snapshot.
        this.events.disconnected();
      }
    }
    if (!this.snapshotEligible() || epoch !== this.connectionEpoch) throw new Error('The session stream changed.');
    this.streamId = streamId;
    const query = new URLSearchParams();
    if (streamId) query.set('streamId', streamId);
    for (const id of workIds) query.append('workId', id);
    let snapshot: RealtimeSnapshot;
    try {
      snapshot = await api(`/api/realtime/snapshot${query.size ? `?${query}` : ''}`, 'RealtimeSnapshot',undefined,'GET',request.signal);
    } catch (error) {
      const socket = this.socket; this.socket = null; socket?.close();
      if (error instanceof ApiFailure && error.retryAfterMs !== undefined)
        this.retryAfterUntil = Math.max(this.retryAfterUntil, Date.now() + error.retryAfterMs);
      if (this.eligible()&&epoch===this.connectionEpoch&&!(error instanceof ApiFailure && error.status === 401)) this.scheduleReconnect();
      throw error;
    }
    if (!this.snapshotEligible() || epoch !== this.connectionEpoch) throw new Error('The session stream changed.');
    if (snapshot.streamId !== streamId) {
      this.scheduleReconnect();
      throw new Error('The session stream changed during recovery.');
    }
    this.cursor = snapshot.sequence;
    this.notePlayback(snapshot.playback.running);
    await this.events.snapshot(snapshot);
    if (!this.snapshotEligible() || epoch !== this.connectionEpoch) throw new Error('The session stream changed.');
    for (const waiter of this.waiters) if (this.cursor > waiter.after) waiter.resolve();
    const buffered = this.buffered;
    this.buffered = [];
    this.bufferedBytes = 0;
    for (const message of buffered) this.enqueue(message.value, epoch, message.bytes);
    this.buffering = false;
    await this.draining;
    if (!this.snapshotEligible() || epoch !== this.connectionEpoch) throw new Error('The session stream changed.');
    if (this.connected) {this.reconnectDelay = 250;this.recoveryStartedAt=0;}
    else if (this.httpOnly) this.scheduleFallback();
    else if (!this.httpOnly) this.scheduleReconnect();
    return snapshot;
  }

  private async openSocket(rawUrl: string, streamId: string, epoch:number): Promise<void> {
    if(!this.eligible() || epoch!==this.connectionEpoch)throw new Error('The session stream changed.');
    const socket = new WebSocket(streamUrl(rawUrl, streamId, window.location.href));
    this.socket = socket;
    let opened = false;
    socket.onmessage = (event) => {
      if (this.stopped || this.socket !== socket || typeof event.data !== 'string' || event.data.length > 2_000_000) {
        if (!this.stopped && this.socket === socket) this.scheduleReconnect();
        return;
      }
      let value: unknown;
      try { value = JSON.parse(event.data); } catch { this.scheduleReconnect(); return; }
      if (!validateContract('RealtimeMessage', value)) { this.scheduleReconnect(); return; }
      if (this.buffering) {
        if (this.buffered.length >= 32 || this.bufferedBytes + event.data.length > 8_000_000) {
          this.scheduleReconnect(); return;
        }
        this.buffered.push({value, bytes:event.data.length});
        this.bufferedBytes += event.data.length;
      }
      else this.enqueue(value, this.connectionEpoch, event.data.length);
    };
    socket.onclose = () => {
      if (this.stopped || this.socket !== socket) return;
      this.online = false;
      this.events.disconnected();
      if (opened) this.scheduleReconnect();
    };
    socket.onerror = () => { if (this.socket === socket) socket.close(); };
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The session stream did not open.')), 5000);
      socket.onopen = () => {
        clearTimeout(timer);
        if(!this.eligible() || epoch!==this.connectionEpoch || this.socket!==socket){socket.close();reject(new Error('The session stream changed.'));return;}
        opened = true; this.online = true; resolve();
      };
      const failed = socket.onclose;
      socket.onclose = (event) => {
        clearTimeout(timer);
        failed?.call(socket, event);
        reject(new Error('The session stream closed before opening.'));
      };
    });
  }

  private enqueue(value: RealtimeMessage, epoch: number, bytes: number) {
    if (this.pendingFrames >= 32 || this.pendingBytes + bytes > 8_000_000) {
      this.scheduleReconnect(); return;
    }
    this.pendingFrames++; this.pendingBytes += bytes;
    this.draining = this.draining.then(() => this.apply(value, epoch))
      .catch(() => this.scheduleReconnect())
      .finally(() => { this.pendingFrames--; this.pendingBytes -= bytes; });
  }

  private async apply(value: RealtimeMessage, epoch: number) {
    if (!this.eligible() || epoch !== this.connectionEpoch) return;
    if (value.streamId !== this.streamId || value.sequence !== this.cursor + 1) {
      if (value.streamId === this.streamId && value.sequence <= this.cursor) return;
      this.scheduleReconnect();
      return;
    }
    await this.events.message(value);
    if (!this.eligible() || epoch !== this.connectionEpoch) return;
    if (value.type === 'session.view') this.notePlayback(value.playback.running);
    this.cursor = value.sequence;
    for (const waiter of this.waiters) if (this.cursor > waiter.after) waiter.resolve();
  }

  private scheduleReconnect() {
    if (!this.eligible() || this.retryTimer) return;
    if(!this.recoveryStartedAt)this.recoveryStartedAt=Date.now();
    if(Date.now()-this.recoveryStartedAt>=30_000){this.retryExhausted=true;this.events.status?.('retry');return;}
    this.connectionEpoch++;
    this.online = false;
    this.events.disconnected();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    if (document.hidden || !navigator.onLine) return;
    const waitMs = Math.max(this.reconnectDelay + Math.floor(Math.random() * Math.min(250, this.reconnectDelay)),
      this.retryAfterUntil - Date.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if(!this.eligible())return;
      if(Date.now()-this.recoveryStartedAt>=30_000){this.retryExhausted=true;this.events.status?.('retry');return;}
      void this.recover().catch(() => this.scheduleReconnect());
    }, waitMs);
    this.reconnectDelay = Math.min(5000, this.reconnectDelay * 2);
  }

  private scheduleFallback() {
    if (!this.eligible() || this.paused || !this.httpOnly || this.fallbackTimer) return;
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      if(!this.eligible()||this.paused)return;
      void this.recover().catch(() => this.scheduleFallback());
    }, this.playbackRunning ? 1500 : 10_000);
  }
}
