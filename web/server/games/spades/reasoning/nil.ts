import { actionId } from '../../../game/rules.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import type { DecisionFacts } from '../../../strategy/types.ts';

export type DoubleNilAction = {
  actionId: string;
  result: 'both-survive-this-trick' | 'own-nil-fails' | 'partner-nil-fails' | 'unresolved';
};

/** Exact current-trick consequences only; remaining Nil success is still unknown. */
export function assessDoubleNil(obs: SeatObservation, facts: DecisionFacts): DoubleNilAction[] {
  if (obs.mode !== 'spades-partners' || obs.phase !== 'play' ||
      facts.ownNil !== 'live' || facts.partnerNil !== 'live' || facts.partner === null) return [];
  return obs.legalActions.map((action) => {
    const id = actionId(action);
    const winner = facts.cardOutcomes.find((outcome) => outcome.actionId === id)?.guaranteedWinner;
    return {
      actionId: id,
      result: winner === null || winner === undefined ? 'unresolved' as const
        : winner === obs.seat ? 'own-nil-fails' as const
        : winner === facts.partner ? 'partner-nil-fails' as const
        : 'both-survive-this-trick' as const,
    };
  });
}
