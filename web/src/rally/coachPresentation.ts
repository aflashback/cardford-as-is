/** Presentation preferences only. Advice, access, quotas and game state stay server-owned. */
export interface CoachUIState {
  open: boolean;
  pinPreferred: boolean;
  view: 'cue' | 'review';
  acknowledgedDecision: string | null;
}
export type CoachUIAction =
  | {kind: 'toggle' | 'close' | 'review' | 'back'; decision: string}
  | {kind: 'pin'; allowed: boolean};
export function initialCoachUI(value?: unknown): CoachUIState {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {open: saved.open === true, pinPreferred: saved.pinPreferred === true, view: 'cue', acknowledgedDecision: null};
}
export function coachUIReducer(state: CoachUIState, action: CoachUIAction): CoachUIState {
  if (action.kind === 'pin') return action.allowed ? {...state, pinPreferred: !state.pinPreferred} : state;
  if (action.kind === 'close') return {...state, open: false, view: 'cue', acknowledgedDecision: action.decision};
  if (action.kind === 'toggle') return {...state, open: !state.open, view: 'cue', acknowledgedDecision: action.decision};
  return {...state, open: true, view: action.kind === 'review' ? 'review' : 'cue', acknowledgedDecision: action.decision};
}
export function coachDisplay(state: CoachUIState, hidden: boolean, availableWidth: number) {
  const open = state.open && !hidden;
  const pinned = open && state.pinPreferred && Number.isFinite(availableWidth) && availableWidth >= 760;
  return {open, pinned, review: open && state.view === 'review'};
}
export function coachAttention(state: CoachUIState, decision: string, phase: string, hidden: boolean, allowed: boolean) {
  return !hidden && !state.open && allowed && state.acknowledgedDecision !== decision &&
    ['bid', 'pass', 'double', 'declare-doubles'].includes(phase);
}
export function coachDimensions(screenWidth: number, screenHeight: number, stageHeight: number, handClearance: number, safeAreaBottom = 0) {
  const large = screenWidth > 900 && screenHeight > 480;
  const windowWidth = large ? Math.max(240, Math.min(320, screenWidth * .22)) : 204;
  const edge = large ? 12 : 8, sticker = large ? 72 : 52;
  const safeBottom = Number.isFinite(safeAreaBottom) ? Math.max(0, safeAreaBottom) : 0;
  const pinnedBottom = sticker + edge * 2 + safeBottom;
  // Hand clearance is measured against the whole stage and already includes its
  // safe bottom inset. Add that inset only to the independent sticker reserve.
  const bottom = Math.max(pinnedBottom, handClearance);
  const limit = large ? Math.min(560, screenHeight * .7) : 380;
  return {windowWidth, edge, sticker, bottom, pinnedBottom, laneWidth: windowWidth + edge * 2,
    overlayHeight: Math.max(100, Math.min(limit, stageHeight - bottom - edge)),
    pinnedHeight: Math.max(100, Math.min(limit, stageHeight - pinnedBottom - edge))};
}
