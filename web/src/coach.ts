import type { GameState, Card } from './game.ts'
import { cardLabel, cardRank, cardSuit, legalCards, recommendCard, suggestBid, trickWinner } from './game.ts'

export type Advice = { focus: string; notice: string; reason: string; suggestion: string; card?: Card; pass?: Card[]; bid?: number; highlightSuit?: string }
export type SuitMemory = { suit: string; played: number; remaining: number; voidSeats: number[] }

const suits = ['C', 'D', 'H', 'S'] as const
const suitNames = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' }

/** Public observations only. "Remaining" includes cards in the player's hand. */
export function getMemory(state: GameState): SuitMemory[] {
  const seen = new Set<Card>()
  const voids = new Map<string, Set<number>>(suits.map(suit => [suit, new Set()]))
  for (const trick of [...state.history.map(item => item.plays), state.trick]) {
    if (!trick.length) continue
    const led = cardSuit(trick[0].card)
    for (const play of trick) {
      seen.add(play.card)
      if (cardSuit(play.card) !== led) voids.get(led)!.add(play.seat)
    }
  }
  return suits.map(suit => {
    const played = [...seen].filter(card => cardSuit(card) === suit).length
    return { suit, played, remaining: 13 - played, voidSeats: [...voids.get(suit)!].sort((a, b) => a - b) }
  })
}

function passPriority(card: Card): number {
  const rank = cardRank(card)
  if (card === 'SQ') return 100
  if (cardSuit(card) === 'S' && rank > 12) return 80 + rank
  return rank + (rank >= 11 ? 20 : 0) + (cardSuit(card) === 'H' ? 5 : 0)
}

/** A transparent local tactic, not an evaluation of the player's decision quality. */
export function getAdvice(state: GameState): Advice {
  const hand = state.hands[0]
  if (state.phase === 'pass') {
    const pass = [...hand].sort((a, b) => passPriority(b) - passPriority(a)).slice(0, 3)
    const hasHighSpade = pass.some(card => ['SQ', 'SK', 'SA'].includes(card))
    return {
      focus: 'Plan the whole pass',
      notice: 'Choose three cards before committing.',
      reason: hasHighSpade
        ? 'Passing high spades may reduce queen risk. Suit length and received cards can change the plan.'
        : 'Passing high cards is one plan. Keeping a strong suit or aiming for the moon can favor another.',
      suggestion: 'Consider these three together. Recheck your suits after receiving.',
      pass,
    }
  }
  if (state.phase === 'bid' && state.turn === 0) {
    const bid = suggestBid(hand)
    return {
      focus: state.mode === 'spades-partners' ? 'Your team contract' : 'Your own contract',
      notice: 'Count likely tricks before bidding.',
      reason: 'High cards and spade length suggest a starting bid. The lead and hidden cards can change it.',
      suggestion: `Consider ${bid}. It is a starting estimate, not a guarantee.`,
      bid,
    }
  }
  if (state.phase !== 'play' || state.turn !== 0) {
    return {
      focus: state.phase === 'hand-end' || state.phase === 'match-end' ? 'Hand complete' : 'Watch the table',
      notice: state.phase === 'hand-end' || state.phase === 'match-end' ? 'The result is ready.' : 'No decision for you right now.',
      reason: 'The memory aid shows facts from this hand’s public plays.',
      suggestion: '',
    }
  }
  const legal = legalCards(state, 0)
  if (legal.length === 0) {
    return { focus: 'Watch the table', notice: 'No legal play is available right now.', reason: '', suggestion: '' }
  }
  const card = recommendCard(state, 0)
  const led = state.trick.length ? cardSuit(state.trick[0].card) : undefined
  const highlightSuit = led
  if (legal.length === 1) {
    return {
      focus: 'One legal play',
      notice: `${cardLabel(legal[0])} is your only legal card.`,
      reason: 'The rules leave no strategic choice on this turn.',
      suggestion: `Play ${cardLabel(legal[0])}.`,
      card: legal[0], highlightSuit,
    }
  }
  const remainingPlayers = 3 - state.trick.length
  if (state.mode !== 'hearts' && state.bids[0] === 0) {
    const liveNil = state.tricks[0] === 0
    const below = state.trick.length > 0 && trickWinner([...state.trick, { seat: 0, card }], state.mode) !== 0
    return {
      focus: liveNil ? 'Protect your Nil' : 'Avoid more bags',
      notice: liveNil ? 'You bid Nil: take no tricks.' : 'Your Nil has already broken.',
      reason: !liveNil
        ? state.mode === 'spades-partners'
          ? 'Extra tricks add bags; they do not help your partner’s contract.'
          : 'Extra tricks add bags even after your Nil has broken.'
        : !state.trick.length
          ? 'A low lead may help you avoid a trick, but the other hands are unknown.'
          : below
            ? remainingPlayers > 0
              ? 'Stay below the current winner to avoid taking. Others still have a play.'
              : 'Staying below the winner lets you avoid this trick.'
            : remainingPlayers > 0
              ? 'Every legal card puts you ahead for now. Another player may still overtake.'
              : 'Every legal card wins this trick, so your Nil cannot survive it.',
      suggestion: !state.trick.length
        ? `Consider ${cardLabel(card)} as a low lead.`
        : below
          ? `Consider ${cardLabel(card)} to stay below the current winner.`
          : `Consider ${cardLabel(card)}; no legal card stays below the current winner.`,
      card, highlightSuit,
    }
  }
  const partnerWinning = state.mode === 'spades-partners' && state.trick.length > 0 && trickWinner(state.trick, state.mode) === 2
  if (partnerWinning) {
    if (state.bids[2] === 0) {
      const cover = legal.filter(candidate => trickWinner([...state.trick, { seat: 0, card: candidate }], state.mode) === 0)
        .sort((a, b) => cardRank(a) - cardRank(b))[0]
      return {
        focus: state.tricks[2] === 0 ? 'Cover your partner’s Nil' : 'Partner’s Nil has broken',
        notice: 'Your Nil partner is winning so far.',
        reason: cover
          ? remainingPlayers > 0
            ? 'You can overtake your partner. An opponent still has a play.'
            : 'You can take this trick off your partner; all opponents have played.'
          : remainingPlayers > 0
            ? 'No legal card can cover your partner. An opponent still has a play.'
            : 'No legal card can cover your partner, and all opponents have played.',
        suggestion: cover
          ? `Consider ${cardLabel(cover)} to take the trick off your partner.`
          : 'No covering play is available; choose among your legal cards.',
        card: cover, highlightSuit,
      }
    }
    const keepsPartner = trickWinner([...state.trick, { seat: 0, card }], state.mode) === 2
    return {
      focus: 'Partner is currently ahead',
      notice: 'Your partner has the winning card so far.',
      reason: remainingPlayers > 0
        ? `${remainingPlayers} opponent ${remainingPlayers === 1 ? 'is' : 'are'} still to play; the trick can change.`
        : 'All opponents have played. Taking the next lead yourself can still be useful.',
      suggestion: keepsPartner
        ? `Consider ${cardLabel(card)} to leave partner ahead for now.`
        : `Consider ${cardLabel(card)} if taking the lead fits your next play.`,
      card, highlightSuit,
    }
  }
  const follows = led && hand.some(held => cardSuit(held) === led)
  const notice = led
    ? follows ? `${suitNames[led]} were led. You must follow suit.` : `You have no ${suitNames[led]} to follow.`
    : `${legal.length} cards are legal to lead.`
  const reason = state.mode === 'hearts'
    ? 'Hearts and the queen carry points. A lower card does not always avoid taking the trick.'
    : state.mode === 'spades-partners'
      ? 'Watch your team’s remaining bid. Saving a high card or taking the lead can each help.'
      : 'Watch your own remaining bid. Saving a high card or taking the lead can each help.'
  return {
    focus: led ? `${suitNames[led]} were led` : 'Choose your lead',
    notice, reason,
    suggestion: `Consider ${cardLabel(card)}. Other plans can be reasonable.`,
    card, highlightSuit,
  }
}
