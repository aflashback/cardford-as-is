import type { CoachAccess, SessionView } from '../../shared/contracts.ts';
export type ClientAccess = Pick<CoachAccess, 'canPlay'|'canCoach'|'remainingHands'|'resetsAt'|'handUnlocked'|'canStartWork'|'localMock'>;
export type ClientSession = Omit<SessionView, 'access'> & {access:ClientAccess};
