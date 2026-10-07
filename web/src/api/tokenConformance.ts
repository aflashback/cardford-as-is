// Test-only numeric display adapter. It is never imported by application startup.
import { createElement as h } from 'react';
import type { TokenActorPacket, TokenPresentation } from '../../shared/contracts.ts';
import { assertContract } from '../../shared/validation.ts';

export function tokenDisplay(presentation: TokenPresentation, packet: TokenActorPacket | null) {
  assertContract('TokenPresentation', presentation);
  if (presentation.observation.gameId !== presentation.gameId || presentation.observation.variant !== presentation.variantId ||
      presentation.observation.seat !== presentation.seat) throw new Error('Token presentation identity mismatch.');
  if (packet) {
    assertContract('TokenActorPacket', packet);
    if (packet.seat !== presentation.seat || packet.variantId !== presentation.variantId || packet.phase !== 'reveal' ||
        packet.observation.turn !== packet.seat || new Set(packet.candidates.map(candidate=>candidate.id)).size !== packet.candidates.length ||
        JSON.stringify(packet.observation) !== JSON.stringify(presentation.observation) ||
        packet.candidates.some(candidate => candidate.id !== `reveal:${candidate.public.token}` ||
          !presentation.observation.own.includes(candidate.public.token)))
      throw new Error('Numeric choices differ from the confirmed token presentation.');
  }
  return { own: presentation.observation.own, choices: packet?.candidates ?? [],
    competition: presentation.observation.competition, collections: presentation.observation.collections,
    held: presentation.observation.held, winners: presentation.observation.winners };
}

/** Explicit conformance adapter; all action IDs come from the confirmed server packet. */
export function TokenConformanceTable(props: { presentation: TokenPresentation; packet: TokenActorPacket | null;
  busy: boolean; onReveal: (candidateId: string) => void }) {
  const view = tokenDisplay(props.presentation, props.packet);
  return h('section', { 'aria-label': 'Numeric token conformance table' },
    h('h2', null, 'Token test table'), h('p', null, 'Demo fixture: reveal tokens; lowest collections wins.'),
    h('ul', null, ...view.competition.map(group => h('li', { key: group.id },
      `${group.id}: seats ${group.seats.join(', ')}; collected ${group.seats.reduce<number>((sum, seat) => sum + view.collections[seat], 0)}`))),
    h('p', null, `Tokens held by seats: ${view.held.join(', ')}`),
    h('div', { 'aria-label': 'Your numeric tokens' }, ...view.own.map(token => {
      const candidate = view.choices.find(choice => choice.public.token === token);
      return h('button', { key: token, type: 'button', disabled: props.busy || !candidate,
        onClick: () => { if (!props.busy && candidate) props.onReveal(candidate.id); } }, `Reveal ${token}`);
    })), view.winners.length ? h('p', null, `Lowest collection winner: ${view.winners.join(', ')}`) : null);
}
