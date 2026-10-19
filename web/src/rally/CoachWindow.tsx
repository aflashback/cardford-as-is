import {useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode, type RefObject} from 'react';
import {ArrowLeft, History, Pin, X} from 'lucide-react';
import type {ClientAccess} from '../api/sessionModel';
import {coachAttention, coachDimensions, coachDisplay, coachUIReducer, initialCoachUI} from './coachPresentation';
import './rally-coach.css';

export interface CoachWindowDisplay {open: boolean; pinned: boolean; /** Total reserved lane; zero unless pinned. */ width: number}
export interface CoachWindowProps {
  decisionId: string;
  phase: string;
  allowance: Pick<ClientAccess, 'canCoach' | 'remainingHands' | 'resetsAt' | 'handUnlocked'>;
  availableAreaRef: RefObject<HTMLElement | null>;
  handRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  disabled?: boolean;
  hidden?: boolean;
  review?: ReactNode;
  reviewAvailable?: boolean;
  onDisplayChange?: (display: CoachWindowDisplay) => void;
  onReviewChange?: (active: boolean) => void;
  allowanceLabel?: string;
}
const preferenceKey = 'cardford.rally.coach-presentation.v1';
function loadPreferences() {
  try {return initialCoachUI(JSON.parse(localStorage.getItem(preferenceKey) || '{}'));}
  catch {return initialCoachUI();}
}
/** No advice request, unlock, payment, feedback or exposure is triggered by this window. */
export function CoachWindow({decisionId, phase, allowance, availableAreaRef, handRef, children, disabled = false,
  hidden = false, review, reviewAvailable = true, onDisplayChange, onReviewChange, allowanceLabel}: CoachWindowProps) {
  const [ui, dispatch] = useReducer(coachUIReducer, undefined, loadPreferences);
  const [geometry, setGeometry] = useState({width: 0, height: 0, screenWidth: 1024, screenHeight: 768, handClearance: 0, safeBottom: 0});
  const body = useRef<HTMLDivElement>(null), launcher = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<() => void>(() => {});
  const callbacks = useRef({onDisplayChange, onReviewChange}); callbacks.current = {onDisplayChange, onReviewChange};
  const decision = `${decisionId}:${phase}`;
  const portrait = geometry.screenWidth < 700 && geometry.screenHeight > geometry.screenWidth;
  const effectiveHidden = hidden || portrait;
  const display = coachDisplay(ui, effectiveHidden, geometry.width);
  const dimensions = coachDimensions(geometry.screenWidth, geometry.screenHeight, geometry.height || geometry.screenHeight,
    geometry.handClearance, geometry.safeBottom);
  const freshAccess = allowance.canCoach && (allowance.handUnlocked || allowance.remainingHands === null || allowance.remainingHands > 0);
  const attention = coachAttention(ui, decision, phase, effectiveHidden, freshAccess && !disabled);
  const canPin = geometry.width >= 760;
  const width = display.pinned ? dimensions.laneWidth : 0;
  const status = allowanceLabel ?? (allowance.handUnlocked ? 'This hand is coached' : allowance.remainingHands === null
    ? 'Unlimited coaching' : `${allowance.remainingHands} coached ${allowance.remainingHands === 1 ? 'hand' : 'hands'} left`);
  useEffect(() => {try {localStorage.setItem(preferenceKey, JSON.stringify({open: ui.open, pinPreferred: ui.pinPreferred}));} catch {/* Presentation can remain in memory. */}}, [ui.open, ui.pinPreferred]);
  useLayoutEffect(() => {
    let measuredArea: HTMLElement | null = null;
    let measuredHand: HTMLElement | null = null;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => measure());
    const measure = () => {
      // This is an ancestor ref: React may attach it after this child's first
      // layout effect. Read it afresh instead of retaining the initial null.
      const area = availableAreaRef.current;
      if (area !== measuredArea) {
        if (measuredArea) { observer?.unobserve(measuredArea); measuredArea.removeEventListener('rally-fit', measure, true); }
        mutations?.disconnect(); measuredArea = area;
        if (area) {
          observer?.observe(area);
          mutations?.observe(area, {childList: true, subtree: true});
          // Fit can move a hand without changing its dimensions.
          area.addEventListener('rally-fit', measure, true);
        }
      }
      const replayHand = area?.querySelector<HTMLElement>('.rally-replay-table .hand-section');
      const hand = replayHand ?? handRef?.current ?? null;
      if (hand !== measuredHand) {
        if (measuredHand) observer?.unobserve(measuredHand);
        measuredHand = hand;
        if (hand) observer?.observe(hand);
      }
      const rectangle = area?.getBoundingClientRect(), held = hand?.getBoundingClientRect();
      const next = {width: area?.clientWidth || window.innerWidth, height: area?.clientHeight || window.innerHeight,
        screenWidth: window.innerWidth, screenHeight: window.innerHeight,
        safeBottom: area ? parseFloat(getComputedStyle(area).getPropertyValue('--rally-coach-safe-bottom')) || 0 : 0,
        handClearance: rectangle && held && held.width > 0 && held.height > 0 ? Math.max(0, rectangle.bottom - held.top + 4) : 0};
      setGeometry(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    measureRef.current = measure;
    measure();
    const initialFrame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {cancelAnimationFrame(initialFrame); measureRef.current = () => {}; observer?.disconnect(); mutations?.disconnect();
      measuredArea?.removeEventListener('rally-fit', measure, true); window.removeEventListener('resize', measure);};
  }, [availableAreaRef, handRef]);
  useLayoutEffect(() => { measureRef.current(); });
  useLayoutEffect(() => {callbacks.current.onDisplayChange?.({open: display.open, pinned: display.pinned, width});}, [display.open, display.pinned, width]);
  useEffect(() => {callbacks.current.onReviewChange?.(display.review);}, [display.review]);
  useEffect(() => () => {callbacks.current.onDisplayChange?.({open: false, pinned: false, width: 0}); callbacks.current.onReviewChange?.(false);}, []);
  const focusBody = () => requestAnimationFrame(() => body.current?.focus());
  function close() {dispatch({kind: 'close', decision}); requestAnimationFrame(() => launcher.current?.focus());}
  function toggle() {if (ui.open) close(); else {dispatch({kind: 'toggle', decision}); focusBody();}}
  function openReview() {dispatch({kind: 'review', decision}); focusBody();}
  const style = {'--rally-coach-width': `${dimensions.windowWidth}px`, '--rally-coach-edge': `${dimensions.edge}px`,
    '--rally-coach-sticker': `${dimensions.sticker}px`, '--rally-coach-bottom': `${display.pinned ? dimensions.pinnedBottom : dimensions.bottom}px`,
    '--rally-coach-height': `${display.pinned ? dimensions.pinnedHeight : dimensions.overlayHeight}px`} as CSSProperties;
  const resetTitle = allowance.resetsAt ? `Coaching allowance resets ${allowance.resetsAt}` : undefined;
  return <div className="rally-coach-layer" style={style} data-pinned={display.pinned || undefined} hidden={effectiveHidden}>
    <button ref={launcher} className="rally-coach-launcher" onClick={toggle} hidden={display.open} aria-expanded={display.open}
      aria-controls="rally-live-coach" aria-label={display.open ? 'Close Coach' : attention ? 'Open Coach for this decision' : 'Open Coach'}
      title={display.open ? 'Close Coach' : 'Open Coach'} data-attention={attention || undefined}>
      <img src={attention ? '/rally/regular-whistle-v3.png' : '/rally/regular-waiting-v2.png'}
        alt={attention ? 'Coach signals a decision' : 'Coach waiting'} width={dimensions.sticker} height={dimensions.sticker} draggable={false}/>
    </button>
    <span className="rally-coach-sr" role="status" aria-live="polite">{attention ? 'Coaching is available for this decision.' : ''}</span>
    <aside id="rally-live-coach" className="rally-coach-window" hidden={!display.open} aria-label="Coach">
      <header className="rally-coach-header"><div><strong>Coach</strong><small title={resetTitle}>{status}</small></div>
        {review && <button className="rally-coach-icon" onClick={openReview} aria-label="Review saved play" title="Review saved play"><History size={19} aria-hidden="true"/></button>}
        <button className="rally-coach-icon" onClick={() => dispatch({kind: 'pin', allowed: canPin})} disabled={!canPin}
          aria-pressed={display.pinned} aria-label={!canPin ? 'More table width is needed to pin Coach' : display.pinned ? 'Unpin Coach' : 'Pin Coach beside the table'}
          title={!canPin ? 'More table width is needed to pin Coach' : display.pinned ? 'Unpin Coach' : 'Pin Coach'}><Pin size={18} aria-hidden="true"/></button>
        <button className="rally-coach-icon" onClick={close} aria-label="Close Coach" title="Close Coach"><X size={20} aria-hidden="true"/></button>
      </header>
      <div ref={body} className="rally-coach-body" tabIndex={-1}>
        {ui.view === 'review' ? <><button className="rally-coach-back" onClick={() => {dispatch({kind: 'back', decision}); focusBody();}}><ArrowLeft size={16} aria-hidden="true"/>Back to Coach</button>
          {reviewAvailable ? review : <p>No saved play is available for this decision yet.</p>}</> : children}
      </div>
    </aside>
  </div>;
}
