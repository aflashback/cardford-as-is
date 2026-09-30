import { cardSuit } from '../../../../../game/cards.ts';
import type { Seat, Suit } from '../../../../../game/kernel/types.ts';
import type { SeatObservation } from '../../../../../observations/index.ts';

export type PartnerHint = {
  kind: 'public-void' | 'possible-control' | 'possible-preference';
  suit: Suit;
  certainty: 'fact' | 'hypothesis';
  evidence: string;
  counterexample: string;
};

/** Public play is evidence about behavior; only failure to follow proves a void. */
export function inferPartnerBehavior(obs: SeatObservation): PartnerHint[] {
  if (obs.mode !== 'spades-partners') return [];
  const partner = ((obs.seat + 2) % 4) as Seat;
  const hints: PartnerHint[] = [];
  const sequences = [...obs.history.map((trick) => trick.plays), ...(obs.phase === 'trick-end' ? [] : [obs.trick])];
  sequences.forEach((plays, index) => {
    if (!plays.length) return;
    const lead = cardSuit(plays[0].card);
    const partnerPlay = plays.find((play) => play.seat === partner);
    if (!partnerPlay) return;
    const playedSuit = cardSuit(partnerPlay.card);
    if (playedSuit !== lead) {
      hints.push({
        kind: 'public-void', suit: lead, certainty: 'fact',
        evidence: `Partner failed to follow ${lead} in trick ${index + 1}.`,
        counterexample: 'None under the current no-draw rule profile.',
      });
      hints.push({
        kind: 'possible-preference', suit: playedSuit, certainty: 'hypothesis',
        evidence: `Partner discarded ${playedSuit} in trick ${index + 1}.`,
        counterexample: 'The discard may have been forced or chosen to shed risk; no signal convention is established.',
      });
    }
    if (plays[0].seat === partner && obs.history[index]?.winner === partner)
      hints.push({
        kind: 'possible-control', suit: lead, certainty: 'hypothesis',
        evidence: `Partner led and won ${lead} in trick ${index + 1}.`,
        counterexample: 'An unplayed higher card may be held by another seat, and partner may have no more cards of this suit.',
      });
  });
  return hints;
}
