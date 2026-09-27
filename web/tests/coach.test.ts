import assert from 'node:assert/strict'
import test from 'node:test'
import { getAdvice, getMemory } from '../src/coach.ts'
import type { Card, GameState, Play } from '../src/game.ts'

const deck = ['C', 'D', 'H', 'S'].flatMap(suit =>
  ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map(rank => `${suit}${rank}`),
)

function position(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'coach-fixture', seed: 1, mode: 'spades-partners', phase: 'play',
    hands: [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39), deck.slice(39)],
    bids: [3, 3, 3, 3], tricks: [0, 0, 0, 0], scores: [0, 0, 0, 0], bags: [0, 0, 0, 0],
    trick: [], history: [], turn: 0, dealer: 3, handNumber: 1,
    heartsBroken: false, spadesBroken: false, events: [], passDirection: 'left', received: [],
    ...overrides,
  }
}

function withOwnHand(hand: Card[], trick: Play[] = []): GameState {
  const used = new Set([...hand, ...trick.map(play => play.card)])
  const rest = deck.filter(card => !used.has(card))
  let offset = 0
  const others = [1, 2, 3].map(seat => {
    const count = 13 - trick.filter(play => play.seat === seat).length
    const cards = rest.slice(offset, offset + count)
    offset += count
    return cards
  })
  return position({ hands: [hand, ...others], trick })
}

function exchangeHiddenHands(state: GameState): GameState {
  const hidden = state.hands.slice(1).flat().reverse()
  let offset = 0
  const others = state.hands.slice(1).map(hand => {
    const cards = hidden.slice(offset, offset + hand.length)
    offset += hand.length
    return cards
  })
  return { ...state, hands: [state.hands[0], ...others] }
}

test('advice is invariant when only opposing hidden hands change', () => {
  const own = ['HA', 'H2', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'SQ', 'SK']
  const play = withOwnHand(own, [{ seat: 1, card: 'H3' }, { seat: 2, card: 'HK' }, { seat: 3, card: 'H4' }])
  const bid = { ...withOwnHand(own), phase: 'bid' as const }
  const pass = { ...withOwnHand(own), phase: 'pass' as const, mode: 'hearts' as const }
  for (const state of [play, bid, pass]) {
    const advice = getAdvice(state)
    assert.ok(advice.notice.length > 0, 'an empty response cannot satisfy the observation boundary')
    assert.deepEqual(getAdvice(exchangeHiddenHands(state)), advice)
  }
})

test('memory counts only public plays and proves voids only from failure to follow suit', () => {
  const state = position({
    history: [{ plays: [{ seat: 0, card: 'C2' }, { seat: 1, card: 'C3' }, { seat: 2, card: 'D2' }, { seat: 3, card: 'CA' }], winner: 3 }],
    trick: [{ seat: 3, card: 'H2' }, { seat: 0, card: 'S2' }],
  })
  assert.deepEqual(getMemory(state), [
    { suit: 'C', played: 3, remaining: 10, voidSeats: [2] },
    { suit: 'D', played: 1, remaining: 12, voidSeats: [] },
    { suit: 'H', played: 1, remaining: 12, voidSeats: [0] },
    { suit: 'S', played: 1, remaining: 12, voidSeats: [] },
  ])
  assert.deepEqual(getMemory(exchangeHiddenHands(state)), getMemory(state))
})

test('a completed trick visible in both history and the table is counted once', () => {
  const trick: Play[] = [{ seat: 0, card: 'C2' }, { seat: 1, card: 'C3' }, { seat: 2, card: 'C4' }, { seat: 3, card: 'CA' }]
  const state = position({ phase: 'trick-end', trick, history: [{ plays: trick, winner: 3 }] })
  assert.equal(getMemory(state).find(row => row.suit === 'C')?.played, 4)
})

test('receiving a club never preserves a provisional club-void claim from passing', () => {
  const own = ['D2', 'D3', 'D4', 'D5', 'D6', 'H2', 'H3', 'H4', 'H5', 'S2', 'SQ', 'SK', 'SA']
  const before = { ...withOwnHand(own), phase: 'pass' as const, mode: 'hearts' as const }
  const after = { ...before, phase: 'play' as const, received: ['C2'], hands: [['C2', ...own.slice(1)], ...before.hands.slice(1)] }
  assert.equal(getMemory(before).find(row => row.suit === 'C')?.voidSeats.includes(0), false)
  assert.equal(getMemory(after).find(row => row.suit === 'C')?.voidSeats.includes(0), false)
  assert.equal(getAdvice(after).card, 'C2')
  assert.doesNotMatch(Object.values(getAdvice(after)).join(' '), /void in clubs|no clubs/i)
})

test('a single legal play is identified as forced rather than a strategic recommendation', () => {
  const state = { ...withOwnHand(['C2', 'D2', 'D3', 'D4', 'D5', 'D6', 'H2', 'H3', 'H4', 'H5', 'S2', 'SQ', 'SK']), mode: 'hearts' as const }
  const advice = getAdvice(state)
  assert.equal(advice.card, 'C2')
  assert.match(`${advice.focus} ${advice.notice} ${advice.reason}`, /only legal|one legal|forced/i)
  assert.match(advice.reason, /no (strategic )?(choice|decision)|not (a )?(strategic )?(choice|decision)/i)
})

test('partner-winning advice acknowledges opponents still to act', () => {
  const own = ['H2', 'HA', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'S2', 'S3', 'S4', 'S5', 'S6']
  const state = withOwnHand(own, [{ seat: 2, card: 'HK' }, { seat: 3, card: 'H3' }])
  const advice = getAdvice(state)
  assert.match(`${advice.notice} ${advice.reason}`, /partner/i)
  assert.match(`${advice.notice} ${advice.reason}`, /still|yet|remain/i)
  assert.doesNotMatch(`${advice.notice} ${advice.reason}`, /keeps? (this|the) trick with your team|team (wins|has won)/i)
})

test('opposite-seat winner is not described as a partner in solo Spades', () => {
  const state = withOwnHand(['H2', 'HA', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'S2', 'S3', 'S4', 'S5', 'S6'], [{ seat: 2, card: 'HK' }, { seat: 3, card: 'H3' }])
  const advice = getAdvice({ ...state, mode: 'spades-solo' })
  assert.doesNotMatch(`${advice.notice} ${advice.reason} ${advice.suggestion}`, /partner|your team/i)
})

test('coach gives no human play recommendation while another seat is acting', () => {
  const advice = getAdvice(position({ turn: 1 }))
  assert.equal(advice.card, undefined)
  assert.equal(advice.pass, undefined)
  assert.equal(advice.bid, undefined)
})

test('a covering card is suggested for a Nil partner even after the other contract is covered', () => {
  const state = withOwnHand(['H2', 'HA', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'S2', 'S3', 'S4', 'S5', 'S6'], [{ seat: 2, card: 'HK' }, { seat: 3, card: 'H3' }])
  state.bids = [3, 3, 0, 3]
  state.tricks = [3, 0, 0, 0]
  const advice = getAdvice(state)
  assert.equal(advice.card, 'HA', 'cover the live Nil instead of ducking because the contract is already made')
  assert.match(`${advice.focus} ${advice.reason} ${advice.suggestion}`, /Nil/)
  assert.match(advice.suggestion, /cover|overtake|off your partner/i)
  assert.match(`${advice.notice} ${advice.reason}`, /still|yet|remain/i)
  assert.deepEqual(getAdvice(exchangeHiddenHands(state)), advice)
})

test('a player bidding Nil is warned about winning instead of being coached toward the contract', () => {
  const state = withOwnHand(['H2', 'HA', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'S2', 'S3', 'S4', 'S5', 'S6'], [{ seat: 2, card: 'HK' }, { seat: 3, card: 'H3' }])
  state.bids = [0, 3, 3, 3]
  const advice = getAdvice(state)
  assert.equal(advice.card, 'H2')
  assert.match(`${advice.focus} ${advice.notice}`, /Nil/)
  assert.match(`${advice.reason} ${advice.suggestion}`, /avoid|no tricks|below|under/i)
})

test('partner Nil advice states when no legal card can cover instead of praising the winning partner', () => {
  const state = withOwnHand(['H2', 'HQ', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'S2', 'S3', 'S4', 'S5', 'S6'], [{ seat: 2, card: 'HK' }, { seat: 3, card: 'H3' }])
  state.bids = [3, 3, 0, 3]
  const advice = getAdvice(state)
  assert.match(`${advice.reason} ${advice.suggestion}`, /cannot|no legal|no covering/i)
  assert.doesNotMatch(advice.suggestion, /leave partner ahead/i)
})

test('failed solo Nil advice does not invent a partner contract', () => {
  const state = withOwnHand(['H2', 'HA', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'S2', 'S3', 'S4', 'S5', 'S6'], [{ seat: 2, card: 'HK' }, { seat: 3, card: 'H3' }])
  state.mode = 'spades-solo'
  state.bids[0] = 0
  state.tricks[0] = 1
  const advice = getAdvice(state)
  assert.doesNotMatch(`${advice.notice} ${advice.reason} ${advice.suggestion}`, /partner|your team/i)
})
