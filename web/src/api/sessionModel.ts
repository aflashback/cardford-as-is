import type { CoachAccess, SessionView } from '../../shared/contracts.ts';
import type { TrixPresentation, LocalServiceNode } from '../../shared/local-service.contracts.ts';
import type { TrixCandidate } from '../games/trix/adapter.ts';
export type ClientAccess = Pick<CoachAccess, 'canPlay'|'canCoach'|'remainingHands'|'resetsAt'|'handUnlocked'|'canStartWork'|'localMock'>;
export type ClientSession = Omit<SessionView, 'access'> & {access:ClientAccess};
export type ClientTrixSession = Omit<ClientSession,'game'> & {game:TrixPresentation; candidates:TrixCandidate[]; node:LocalServiceNode};
