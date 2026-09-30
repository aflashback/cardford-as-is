import type { Competition } from './registry.ts';
import { validateCompetition } from './registry.ts';
import type { Mode, Seat } from './types.ts';

/**
 * GP-01: competition is data. Each catalog mode declares its partition of the four
 * seats; strategy, planning and evaluation read membership here instead of
 * inferring a partner from seat arithmetic.
 */
const individual = (): Competition => ({
  mode: 'individual',
  competitors: [
    { id: 'south', seats: [0] },
    { id: 'west', seats: [1] },
    { id: 'north', seats: [2] },
    { id: 'east', seats: [3] },
  ],
});

const COMPETITIONS: Record<Mode, Competition> = {
  hearts: individual(),
  'spades-solo': individual(),
  'spades-partners': {
    mode: 'partnership',
    competitors: [
      { id: 'north-south', seats: [0, 2] },
      { id: 'east-west', seats: [1, 3] },
    ],
  },
};
for (const competition of Object.values(COMPETITIONS)) validateCompetition(competition);

export type Competitor = Competition['competitors'][number];

export function competitionFor(mode: string): Competition {
  if (!Object.hasOwn(COMPETITIONS, mode)) throw new Error(`No competition is declared for mode: ${mode}`);
  return structuredClone(COMPETITIONS[mode as Mode]);
}

export function competitorOf(competition: Competition, seat: Seat): Competitor {
  const found = competition.competitors.find((entry) => entry.seats.includes(seat));
  if (!found) throw new Error('Seat belongs to no competitor.');
  return found;
}

/** Other seats scored together with this seat; empty in individual competition. */
export function teammatesOf(competition: Competition, seat: Seat): Seat[] {
  return competitorOf(competition, seat).seats.filter((member) => member !== seat);
}

export function opponentsOf(competition: Competition, seat: Seat): Seat[] {
  const own = competitorOf(competition, seat);
  return competition.competitors.filter((entry) => entry !== own).flatMap((entry) => [...entry.seats]);
}

export function opposingCompetitors(competition: Competition, seat: Seat): Competitor[] {
  const own = competitorOf(competition, seat);
  return competition.competitors.filter((entry) => entry !== own);
}
