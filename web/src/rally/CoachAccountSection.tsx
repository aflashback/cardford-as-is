import {useEffect,useState} from 'react';
import type {CoachUIStatusView} from '../../shared/local-service.contracts';
import {api} from '../api/client';
import {onAuthInvalidated} from '../api/authLifecycle';
import {coachSessionLabel} from './coachCommands';

export function CoachAccountSection({playerId,revision}:{playerId:string;revision:string|number}) {
  const [status,setStatus]=useState<CoachUIStatusView|null>(null), [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true; setStatus(null); setError('');
    const unsubscribe=onAuthInvalidated(()=>{active=false;setStatus(null);setError('Reconnect to view coaching access.');});
    void api('/api/platform/coach','CoachUIStatusView').then(value=>{
      if (active && value.playerId===playerId) setStatus(value);
      else if(active) setError('The signed-in player changed. Reconnect your account.');
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Coaching access unavailable.');});
    return ()=>{active=false;unsubscribe();};
  },[playerId,revision,attempt]);
  return <section className="account-section"><h2>Coach sessions</h2>
    {status ? <><p><strong>{coachSessionLabel(status.access)}</strong></p>
      {!status.access.unlimited && <p>Two requests each UTC day. Why, feedback and related comments are included.</p>}
      <p>Explanations and player comparisons are labelled previews while Coach is in training.</p></> : error ?
      <><p role="status">{error}</p><button className="text-button" onClick={()=>setAttempt(value=>value+1)}>Retry coaching access</button></> : <p role="status">Checking coaching access…</p>}
  </section>;
}
