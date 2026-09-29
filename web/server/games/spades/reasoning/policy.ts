import { cardRank, cardSuit } from '../../../game/cards.ts';
import { SEATS, type GameAction, type Seat, type Suit } from '../../../game/kernel/types.ts';
import { actionId } from '../../../game/rules.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import { suggestBid } from '../../../strategy/baseline.ts';
import type { CardOutcome, DecisionAnalysis, DecisionFacts, DecisionReason } from '../../../strategy/types.ts';
import { SPADES_SCENARIOS } from './catalog.ts';

/** Deterministic, conditional tactical priorities. Scores are ordering weights, never probabilities. */
export function analyzeSpades(
  obs: SeatObservation,
  facts: DecisionFacts,
  policyVersion: string,
): DecisionAnalysis {
  const reasons: DecisionReason[] = [];
  const scenarioIds = new Set<string>();
  const common: string[] = [];
  const add = (id: string, kind: DecisionReason['kind'], text: string, actions?: string[]): string => {
    const scenario = id.split('.')[0];
    scenarioIds.add(scenario);
    const existing = reasons.find((r) => r.id === id);
    if (!existing) reasons.push({ id, kind, text, ...(actions ? { actionIds: actions } : {}) });
    else if (actions) existing.actionIds = [...new Set([...(existing.actionIds ?? []), ...actions])];
    return id;
  };
  const shared = (id: string, kind: DecisionReason['kind'], text: string) => {
    common.push(add(id, kind, text));
  };
  const partner = facts.partner;
  const opponents = SEATS.filter((s) => s !== obs.seat && s !== partner);
  const opponentNils = opponents.filter((s) => obs.bids[s] === 0 && obs.tricks[s] === 0);
  const positiveNeed = (facts.contractNeeded ?? 0) > 0;
  const ownCanCredit = (facts.ownBid ?? 0) > 0;
  const contractValue = 20 * (facts.contractBid ?? 0);
  const outcomes = new Map(facts.cardOutcomes.map((o) => [o.actionId, o]));
  const canHold = (seat: Seat, suit: Suit) =>
    facts.possibleOwners.some((p) => cardSuit(p.card) === suit && p.seats.includes(seat));
  const laterOpponents = facts.actorsAfter.filter((s) => opponents.includes(s));
  const liveOwn = facts.ownNil === 'live';
  const livePartner = facts.partnerNil === 'live';
  const bothNil = liveOwn && livePartner;
  const losingActions = obs.legalActions.filter(
    (a) => a.kind === 'play' && outcomes.get(actionId(a))!.currentWinner !== obs.seat,
  );
  const covers = facts.cardOutcomes.filter((o) => o.coversPartnerNil);
  const winnerIsOpponentNil = facts.currentWinner !== null && opponentNils.includes(facts.currentWinner);

  if (obs.phase === 'bid') {
    const bid = suggestBid(obs.hand);
    const selected = obs.legalActions.find((a) => a.kind === 'bid' && a.bid === bid)!;
    shared(
      'S13.structure',
      'heuristic',
      'This bid uses the retained hand-structure heuristic: high cards, trump length and protected side-suit honors. Its weights are not calibrated probabilities.',
    );
    if (obs.bids.some((b) => b !== null))
      shared(
        'S13.public-bids',
        'fact',
        'Earlier bids are public commitments; they do not prove which unplayed cards anyone holds.',
      );
    if (livePartner)
      shared(
        'P04.bidding-nil',
        'heuristic',
        'A Nil partner cannot supply positive-contract credit. Both players may bid Nil, but two independent Nil commitments can compete for protection.',
      );
    return {
      schemaVersion: '1.0.0',
      policyVersion,
      provenance: 'code',
      action: structuredClone(selected),
      scenarioIds: [...scenarioIds],
      reasons,
      facts,
      candidates: obs.legalActions.map((a) => ({
        action: structuredClone(a),
        reasonIds: [...common],
        disposition: actionId(a) === actionId(selected) ? 'selected' : 'alternative',
        evidence: 'heuristic',
      })),
      limitations: [
        'Bidding retains the uncalibrated baseline heuristic; contextual bidding and Nil success need separate evaluation.',
      ],
      trace: {
        schemaVersion: '1.0.0',
        policyVersion,
        catalogVersion: 'spades-catalog-1.0.0',
        selectedActionId: actionId(selected),
        selectedBy: 'baseline',
        scenarioChecks: SPADES_SCENARIOS.map((entry) => ({
          id: entry.id,
          result: !entry.modes.includes(obs.mode as 'spades-solo' | 'spades-partners') || !entry.phases.includes('bid')
            ? 'not-applicable' as const
            : scenarioIds.has(entry.id)
              ? 'matched' as const
              : 'not-matched' as const,
        })),
        candidates: obs.legalActions.map((a, tieOrder) => ({
          actionId: actionId(a), score: null, effects: [], tieOrder,
        })),
        limitations: ['Bid selection retains an uncalibrated hand-structure heuristic.'],
      },
    };
  }

  shared(
    'S01.legal-set',
    'fact',
    `${obs.legalActions.length} legal card ${obs.legalActions.length === 1 ? 'action is' : 'actions are'} available under this rule profile.`,
  );
  if (facts.outstandingCards.length > obs.hand.length)
    shared(
      'S03.ownership',
      'fact',
      'Unplayed higher cards remain possible holdings; choosing a low card or declining to trump does not reveal their owner.',
    );
  if (obs.trick.length)
    shared(
      'S04.turn-order',
      'fact',
      facts.actorsAfter.length
        ? `${facts.actorsAfter.length} ${facts.actorsAfter.length === 1 ? 'player still has' : 'players still have'} to play; a current winner is provisional unless every possible response is excluded.`
        : 'You play fourth, so the winner after your card is exact.',
    );
  if (facts.ledSuit && facts.suitLengths[facts.ledSuit] === 0) {
    shared('S02.void', 'fact', 'You have no card of the led suit, so any card in your hand is legal.');
    shared('S11.trump-choice', 'fact', 'There is no obligation to trump or overtrump in this profile.');
  }
  if (liveOwn) {
    if (losingActions.length)
      shared(
        'S05.live-nil',
        'fact',
        'Your Nil is still live. A card below the current winner keeps you from taking this trick.',
      );
    else
      shared(
        'S06.no-underplay',
        'fact',
        facts.cardOutcomes.every((outcome) => outcome.guaranteedWinner === obs.seat)
          ? 'Every legal card guarantees you this trick, so your Nil fails even if other players still have to play.'
          : 'Every legal card currently wins. A later player may overtake if their legal response can beat it; rescue is not guaranteed.',
      );
  }
  if (facts.ownNil === 'failed')
    shared(
      'S07.failed-nil',
      'fact',
      'Your Nil has failed. Further tricks add bags, earn no overtrick points and cannot help a positive contract.',
    );
  if (facts.contractNeeded !== null) {
    if (positiveNeed)
      shared(
        'S08.contract',
        'fact',
        `${partner === null ? 'Your contract needs' : 'Your team contract still needs'} ${facts.contractNeeded} credited ${facts.contractNeeded === 1 ? 'trick' : 'tricks'}; only positive bidders supply that credit.`,
      );
    else
      shared(
        'S09.contract-met',
        'fact',
        facts.contractBid === 0
          ? 'There is no positive contract. Nil awards are individual; failed-Nil tricks add bags without overtrick points.'
          : `The positive contract is met. The next ordinary bag changes this hand's score by ${facts.nextOrdinaryBagDelta === -99 ? '-99 at the ten-bag boundary' : '+1 before any later bag penalty'}.`,
      );
  }
  if (!obs.trick.length)
    shared(
      'S10.lead-choice',
      'heuristic',
      'Compare cashing control with developing a short suit. A side-suit master may still be trumped.',
    );
  if (opponentNils.length)
    shared(
      'S12.opponent-nil',
      'fact',
      'An opponent still has a live Nil. Making that player take a trick changes the Nil award from +100 to -100.',
    );
  if (obs.history.length >= 10 || obs.scores.some((s) => s >= 400))
    shared(
      'S14.late-score',
      'heuristic',
      'Late-hand choices depend on contracts, Nil and bag penalties. Match victory is checked only after the complete hand is scored; this tactical policy does not solve the remaining hand.',
    );

  if (partner !== null) {
    shared(
      'P10.team-contract',
      'fact',
      'Positive partnership bids share one contract; each positive bidder can cover the other. Nil tricks never count toward it.',
    );
    scenarioIds.add('P12');
    if (facts.currentWinner === partner && obs.bids[partner] !== 0) {
      shared('P01.partner-current', 'fact', 'Your positive-bidding partner is currently winning this trick.');
      const underplay = facts.cardOutcomes.some((o) => o.currentWinner === partner);
      const safe = facts.cardOutcomes.some((o) => o.guaranteedWinner === partner);
      shared(
        'P09.partner-security',
        safe || !underplay ? 'fact' : 'heuristic',
        safe
          ? 'A legal underplay leaves your partner the guaranteed winner of this trick.'
          : !underplay
            ? 'Every legal card overtakes your partner; no legal underplay can leave your partner winning.'
            : 'A later player may overtake your partner; compare conserving a card with economical protection.',
      );
    }
    if (livePartner && facts.currentWinner === partner) {
      if (covers.length)
        shared(
          'P02.live-nil-cover',
          'fact',
          'Your partner Nil is still live. Overtaking now takes this trick off your partner even if an opponent later wins; the positive contract being met does not remove this need.',
        );
      else
        shared(
          'P03.no-cover',
          'fact',
          `No legal card can overtake your Nil partner.${facts.cardOutcomes.every((outcome) => outcome.guaranteedWinner === partner) ? ' Your partner is guaranteed this trick and the Nil fails.' : ' A later opponent can rescue the Nil only if they have a legal card that beats it.'}`,
        );
    }
    if (bothNil)
      shared(
        'P04.double-nil',
        'heuristic',
        'Both Nil commitments are live. Covering your partner may put your own Nil at risk; there is no universal sacrifice rule.',
      );
    if (facts.partnerNil === 'failed')
      shared(
        'P05.failed-partner',
        'fact',
        'Your partner Nil has failed. Their further tricks add bags without positive-contract credit; the Nil bonus cannot be recovered.',
      );
    const relevantSuits = facts.ledSuit ? [facts.ledSuit] : obs.hand.map(cardSuit);
    if (relevantSuits.some((s) => s !== 'S' && facts.voids[s].includes(partner)))
      shared(
        'P06.partner-void',
        'heuristic',
        canHold(partner, 'S')
          ? 'Your partner is publicly void in a relevant side suit and may be able to ruff. Trump ownership and possible opponent overruffs remain uncertain.'
          : 'Your partner is publicly void in a relevant side suit, but no remaining spade is possible for them.',
      );
    if (facts.voids.S.includes(partner))
      shared(
        'P07.no-partner-trump',
        'fact',
        'Your partner is publicly void in spades and cannot ruff a future side-suit trick.',
      );
    if ([...obs.history.flatMap((t) => t.plays), ...obs.trick].some((p) => p.seat === partner))
      shared(
        'P08.public-hints',
        'heuristic',
        'Partner leads and discards can suggest suit preferences, but no signaling convention or hidden high-card ownership is assumed.',
      );
    if (!obs.trick.length || (facts.ledSuit && facts.suitLengths[facts.ledSuit] === 0))
      shared(
        'P11.entries',
        'heuristic',
        'Consider who gains the next lead and whether spending trump removes a later partnership entry or ruff.',
      );
  }

  const ranked = obs.legalActions
    .map((action, index) => {
      if (action.kind !== 'play') throw new Error('Spades play requires a card action.');
      const id = actionId(action),
        outcome = outcomes.get(id)!;
      const suit = cardSuit(action.card),
        rank = cardRank(action.card);
      const winsNow = outcome.currentWinner === obs.seat;
      const confirmedWin = outcome.guaranteedWinner === obs.seat;
      const lead = obs.trick.length === 0;
      const reasonIds: string[] = [];
      const reason = (suffix: string, kind: DecisionReason['kind'], text: string) => {
        reasonIds.push(add(suffix, kind, text, [id]));
      };
      let score = 0;
      const effects: { id: string; delta: number }[] = [];
      const effect = (effectId: string, delta: number) => {
        score += delta;
        effects.push({ id: effectId, delta });
      };
      effect('tie.economical-rank', -rank / 100); // ordering only, not an outcome estimate

      if (liveOwn) {
        if (!lead && !winsNow) {
          effect('S05.shed-risk', 600 + rank + (suit === 'S' ? 20 : 0));
          reason(
            'S05.shed-risk',
            'heuristic',
            'This card loses to an already played card. Prefer shedding a dangerous high loser while keeping the Nil live.',
          );
        } else {
          effect('S06.rescue', -(rank * 3 + (suit === 'S' ? 35 : 0)));
          if (confirmedWin) effect('S06.guaranteed-failure', -500);
          reason(
            confirmedWin ? 'S06.guaranteed-failure' : 'S06.rescue',
            confirmedWin ? 'fact' : 'heuristic',
            confirmedWin
              ? 'This card guarantees you the trick, which fails your live Nil.'
              : 'When no safe underplay exists, prefer a card that leaves later players room to overtake; that rescue is uncertain.',
          );
        }
        // Two Nils require an explicit tradeoff; do not blindly override own-Nil survival.
        if (bothNil && outcome.coversPartnerNil) {
          effect('P04.cover-tradeoff', confirmedWin ? 20 : 90);
          reason(
            'P04.cover-tradeoff',
            'heuristic',
            'This covers your partner now, but transfers the current lead to you while your own Nil is live.',
          );
        }
      } else if (!lead) {
        if (positiveNeed && ownCanCredit) {
          if (winsNow) {
            effect('S08.economical-winner', confirmedWin ? 150 : 90);
            if (facts.contractNeeded === 1) effect('S08.last-needed', contractValue / 4);
            effect('S08.resource-cost', -(rank + (suit === 'S' ? 16 : 0)));
            reason(
              'S08.economical-winner',
              'heuristic',
              'This takes the current lead toward the contract. Prefer an economical winner while retaining stronger control for later tricks.',
            );
          } else {
            effect('S08.preserve-control', -rank / 3);
            reason(
              'S08.preserve-control',
              'heuristic',
              'This does not take the current lead. Compare the control left in your hand before saving a card for a later contract trick.',
            );
          }
        } else {
          effect('S09.limit-bags', winsNow ? -100 - (facts.bagRoom === 1 ? 100 : 0) : 60 + rank);
          reason(
            'S09.limit-bags',
            'heuristic',
            'When no credited contract trick is needed from this seat, prefer avoiding an extra trick and shedding a higher loser.',
          );
        }
        if (!winsNow && suit === 'S') effect('S11.keep-trump', -12);
        if (winnerIsOpponentNil) {
          if (outcome.currentWinner === facts.currentWinner) {
            effect('S12.leave-nil-winning', facts.actorsAfter.length ? 140 : 240);
            reason(
              'S12.leave-nil-winning',
              facts.actorsAfter.length ? 'heuristic' : 'fact',
              facts.actorsAfter.length
                ? 'This leaves the opposing Nil currently winning; later players may still change the result.'
                : 'This leaves the opposing Nil winning the completed trick, so that Nil fails.',
            );
          } else if (winsNow) effect('S12.avoid-cover-opponent-nil', -80);
        }
      } else {
        const knownRuffers = opponents.filter(
          (s) => suit !== 'S' && facts.voids[suit].includes(s) && canHold(s, 'S'),
        );
        if (positiveNeed && ownCanCredit) {
          effect('S10.lead-control', outcome.isMaster ? 70 : 20 / facts.suitLengths[suit] - rank);
          if (confirmedWin) effect('S10.guaranteed-lead', 70);
          effect('S10.known-ruff-risk', -knownRuffers.length * 35);
          if (suit === 'S') effect('S10.keep-trump', -22);
          reason(
            outcome.isMaster ? 'S10.cash-control' : 'S10.develop-suit',
            'heuristic',
            outcome.isMaster
              ? 'This is the highest unplayed card of its suit. Cashing it may help the contract, while possible ruffs still matter.'
              : 'A low lead from a shorter suit can develop a future void while preserving higher cards.',
          );
        } else {
          effect('S09.low-lead', -(rank * 2 + (outcome.isMaster ? 25 : 0) + (suit === 'S' ? 20 : 0)));
          reason(
            'S09.low-lead',
            'heuristic',
            'A lower lead may help avoid an unwanted trick; it cannot guarantee another player will win.',
          );
        }
        if (opponentNils.length && !livePartner) {
          effect('S12.nil-pressure-lead', 16 - rank);
          reason(
            'S12.nil-pressure-lead',
            'heuristic',
            'A low lead may pressure an opposing Nil, but its cover and your own contract still matter.',
          );
        }
      }

      // Partnership objective is applied to every candidate before the final selection.
      if (partner !== null) {
        if (!liveOwn && outcome.coversPartnerNil) {
          effect('P02.cover-action', 1000);
          effect('P02.cover-resource-cost', -(rank + (suit === 'S' ? 10 : 0)));
          reason(
            'P02.cover-action',
            'fact',
            'This legal card overtakes your live Nil partner and keeps this trick off your partner.',
          );
        }
        if (!liveOwn && livePartner && facts.actorsAfter.includes(partner) && winsNow) {
          effect('P02.cover-before-partner', 180 + rank * 2 + (outcome.isMaster ? 35 : 0));
          reason(
            'P02.cover-before-partner',
            'heuristic',
            'Playing above the current lead gives your Nil partner room to duck when they play; their concealed hand is still unknown.',
          );
        }
        if (!liveOwn && livePartner && lead) {
          effect('P02.covering-lead', 260 + rank * 5 + (outcome.isMaster ? 45 : 0) - (suit === 'S' ? 45 : 0));
          reason(
            'P02.covering-lead',
            'heuristic',
            'Prefer a high covering lead for your live Nil partner, even after the positive contract is met. This does not prove their Nil is safe.',
          );
        }
        if (!liveOwn && facts.currentWinner === partner && facts.partnerNil === 'none') {
          if (!winsNow) {
            const opponentThreat =
              (facts.actorsAfter.length > 0 && !facts.knowledgeComplete) ||
              outcome.canBeOvertakenBy.some((s) => opponents.includes(s));
            effect('P01.conserve-under-partner', opponentThreat ? 85 : 210);
            reason(
              'P01.conserve-under-partner',
              'heuristic',
              opponentThreat
                ? 'Underplaying preserves your resources, but an opponent still to act may overtake your partner.'
                : 'Underplaying preserves resources behind your partner; no remaining opponent response can overtake the current winner under the known constraints.',
            );
          } else {
            const protectedFromOpponents =
              outcome.guaranteedWinner === obs.seat ||
              (facts.knowledgeComplete && !outcome.canBeOvertakenBy.some((s) => opponents.includes(s)));
            const previousThreat = losingActions.some((a) =>
              outcomes.get(actionId(a))!.canBeOvertakenBy.some((s) => opponents.includes(s)),
            );
            effect('P09.protect-partner', positiveNeed && protectedFromOpponents && previousThreat ? 160 : -120);
            reason(
              'P09.protect-partner',
              'heuristic',
              'Overtaking a positive-bidding partner needs a reason, such as removing a later opponent threat or gaining a useful lead.',
            );
          }
        }
        if (
          lead &&
          positiveNeed &&
          !liveOwn &&
          facts.partnerNil === 'none' &&
          suit !== 'S' &&
          facts.voids[suit].includes(partner) &&
          canHold(partner, 'S')
        ) {
          effect('P06.offer-ruff', 40);
          const behindPartner = laterOpponents.filter(
            (s) => facts.actorsAfter.indexOf(s) > facts.actorsAfter.indexOf(partner),
          );
          if (behindPartner.some((s) => facts.voids[suit].includes(s) && canHold(s, 'S')))
            effect('P06.overruff-risk', -35);
          reason(
            'P06.offer-ruff',
            'heuristic',
            'This leads a suit your partner is known to lack. A partner ruff is possible, with overruff risk depending on later opponents.',
          );
        }
        if (
          lead &&
          suit === 'S' &&
          facts.partnerNil === 'none' &&
          canHold(partner, 'S') &&
          (['C', 'D', 'H'] as const).some((s) => facts.voids[s].includes(partner))
        ) {
          effect('P11.preserve-ruff', -45);
          reason(
            'P11.preserve-ruff',
            'heuristic',
            'Leading spades may remove trump your partner could use to ruff a publicly void side suit.',
          );
        }
      }
      return { action, index, score, effects, reasonIds: [...reasonIds, ...common] };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked[0];
  const forced = obs.legalActions.length === 1;
  if (forced) {
    shared(
      'S01.forced',
      'fact',
      'Only one legal action exists, so this move is forced rather than a strategic preference.',
    );
    selected.reasonIds.unshift('S01.forced');
  }
  return {
    schemaVersion: '1.0.0',
    policyVersion,
    provenance: forced ? 'forced' : 'code',
    action: structuredClone(selected.action),
    scenarioIds: [...scenarioIds],
    reasons,
    facts,
    candidates: ranked.map((entry) => ({
      action: structuredClone(entry.action),
      reasonIds: entry.reasonIds,
      disposition: entry === selected ? 'selected' : 'alternative',
      evidence: forced ? 'exact' : 'heuristic',
    })),
    limitations: [
      'Conditional tactical policy, not a solved position or calibrated probability model.',
      'Unobserved hands remain unknown; card-choice signals are not treated as ownership proof.',
      ...(facts.knowledgeComplete
        ? []
        : [
            'Public history or capacities are incomplete or inconsistent; concealed ownership and future-winner deductions are widened.',
          ]),
      ...(scenarioIds.has('S14')
        ? ['Late-match tradeoffs are not evaluated by full remaining-hand search.']
        : []),
    ],
    trace: {
      schemaVersion: '1.0.0',
      policyVersion,
      catalogVersion: 'spades-catalog-1.0.0',
      selectedActionId: actionId(selected.action),
      selectedBy: forced ? 'forced' : 'heuristic-rank',
      scenarioChecks: SPADES_SCENARIOS.map((entry) => ({
        id: entry.id,
        result: !entry.modes.includes(obs.mode as 'spades-solo' | 'spades-partners') || !entry.phases.includes('play')
          ? 'not-applicable' as const
          : scenarioIds.has(entry.id)
            ? 'matched' as const
            : 'not-matched' as const,
      })),
      candidates: ranked.map((entry) => ({
        actionId: actionId(entry.action),
        score: entry.score,
        effects: entry.effects,
        tieOrder: entry.index,
      })),
      limitations: [
        'Numeric effects are policy ordering weights, not probabilities or match-point estimates.',
      ],
    },
  };
}
