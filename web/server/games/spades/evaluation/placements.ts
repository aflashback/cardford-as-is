import type { Placement } from '../../../evaluation/gate/contracts.ts';
import { competitionFor, opponentsOf, teammatesOf } from '../../../game/kernel/competition.ts';
import { SEATS, type Seat } from '../../../game/kernel/types.ts';
import { requireSpadesMode } from './metrics.ts';
import {
  D0_STYLE_ID,
  DEVELOPMENT_STYLE_IDS,
  DIAGNOSTIC_STYLE_IDS,
  SPADES_STYLE_SPECS,
} from './styles.ts';

/**
 * SG-05: seat placements of the evaluated policy, per mode.
 *
 * Solo: `one-seat`, the evaluated seat moves through all four seats.
 * Partners: `one-seat` (4 rotations, every other seat plays the table style),
 * `both-teammates` (2 rotations, one per team) and `unfamiliar-teammate` (4 rotations,
 * the teammate plays a different style than the two opposing seats).
 *
 * Membership comes from the declared competition, never from seat arithmetic.
 */
export const SPADES_PLACEMENTS_VERSION = 'spades-placements-1.0.0';
export const ONE_SEAT = 'one-seat';
export const BOTH_TEAMMATES = 'both-teammates';
export const UNFAMILIAR_TEAMMATE = 'unfamiliar-teammate';

const reservation = (style: string) => SPADES_STYLE_SPECS.find((spec) => spec.id === style)?.reservedFor ?? 'any';

/**
 * Styles a teammate may play beside opposing seats on `style`. The frozen baseline is
 * left out because it is the reference arm itself, and diagnostic styles never sit at a
 * measured table. When the supplied list offers nothing else, the declared development
 * styles are used.
 */
export function teammateStylePool(style: string, styles: readonly string[]): string[] {
  const usable = (list: readonly string[]) =>
    list.filter(
      (id) => id !== style && id !== D0_STYLE_ID && !DIAGNOSTIC_STYLE_IDS.includes(id) && reservation(id) !== 'opposing',
    );
  // A table whose opposing seats are held out takes a held-out teammate when one is listed.
  if (reservation(style) === 'opposing') {
    const reserved = styles.filter((id) => reservation(id) === 'teammate');
    if (reserved.length) return reserved;
  }
  const listed = usable(styles);
  return listed.length ? listed : usable(DEVELOPMENT_STYLE_IDS);
}

const table = (assign: (seat: Seat) => string | null): (string | null)[] => SEATS.map(assign);

/**
 * Placements for every table style in `styles`, in the order given: configuration, then
 * rotation. A style reserved for the teammate seat is never an opposing style in Partners.
 */
export function spadesPlacements(mode: string, styles: readonly string[]): Placement[] {
  const competition = competitionFor(requireSpadesMode(mode));
  const partnership = competition.mode === 'partnership';
  const placements: Placement[] = [];
  styles.forEach((style, position) => {
    if (partnership && reservation(style) === 'teammate') return;
    for (const seat of SEATS)
      placements.push({
        configuration: ONE_SEAT,
        evaluated: [seat],
        others: table((other) => (other === seat ? null : style)),
        rotation: seat,
      });
    if (!partnership) return;
    competition.competitors.forEach((competitor, rotation) => {
      placements.push({
        configuration: BOTH_TEAMMATES,
        evaluated: [...competitor.seats],
        others: table((other) => (competitor.seats.includes(other) ? null : style)),
        rotation,
      });
    });
    const pool = teammateStylePool(style, styles);
    for (const seat of SEATS) {
      const mates = teammatesOf(competition, seat);
      const teammateStyle = pool[(position + seat) % pool.length];
      placements.push({
        configuration: UNFAMILIAR_TEAMMATE,
        evaluated: [seat],
        others: table((other) => (other === seat ? null : mates.includes(other) ? teammateStyle : style)),
        rotation: seat,
      });
    }
  });
  return placements;
}

/** The style of the seats opposing the evaluated competitor: the table style of a placement. */
export function placementStyle(mode: string, placement: Placement): string {
  const competition = competitionFor(requireSpadesMode(mode));
  const style = opponentsOf(competition, placement.evaluated[0])
    .map((seat) => placement.others[seat])
    .find((entry) => entry !== null);
  if (!style) throw new Error('The placement names no opposing style.');
  return style;
}

/** The teammate's style when the teammate is not evaluated, otherwise `null`. */
export function placementTeammateStyle(mode: string, placement: Placement): string | null {
  const competition = competitionFor(requireSpadesMode(mode));
  const mate = teammatesOf(competition, placement.evaluated[0])[0];
  return mate === undefined ? null : placement.others[mate];
}
