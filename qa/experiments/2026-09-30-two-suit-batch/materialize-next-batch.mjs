// Development-only fixture materializer. Never send proposal metadata to players.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../../../web/server/game/index.ts';

const directory = dirname(fileURLToPath(import.meta.url));
const proposal = JSON.parse(readFileSync(join(directory, 'next-batch-proposal.json'), 'utf8'));
const base = JSON.parse(readFileSync(join(directory, proposal.baseFile), 'utf8'));
const deck = new Set(['C', 'D', 'H', 'S'].flatMap(suit =>
  ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map(rank => suit + rank)));

function materialize(entry) {
  const source = base.episodes.find(episode => episode.id === entry.baseEpisodeId);
  if (!source || source.mode !== entry.mode) throw Error(`Base/mode mismatch: ${entry.id}`);
  const hands = source.hands.map(hand => [...hand]);
  for (const transform of entry.transforms) {
    const [left, right] = transform.seats;
    if (![left, right].every(seat => Number.isInteger(seat) && seat >= 0 && seat < 4) || left === right) {
      throw Error(`Invalid seats: ${entry.id}`);
    }
    if (transform.type === 'swapHands') {
      [hands[left], hands[right]] = [hands[right], hands[left]];
    } else if (transform.type === 'swapCards') {
      const [leftCard, rightCard] = transform.cards;
      const leftIndex = hands[left].indexOf(leftCard);
      const rightIndex = hands[right].indexOf(rightCard);
      if (leftIndex < 0 || rightIndex < 0) throw Error(`Missing swap card: ${entry.id}`);
      hands[left][leftIndex] = rightCard;
      hands[right][rightIndex] = leftCard;
    } else {
      throw Error(`Unknown transform: ${entry.id}`);
    }
  }
  const cards = hands.flat();
  if (hands.length !== 4 || hands.some(hand => hand.length !== 13) || cards.length !== 52 ||
      new Set(cards).size !== 52 || cards.some(card => !deck.has(card))) {
    throw Error(`Invalid deck: ${entry.id}`);
  }
  if (![0, 1, 2, 3].includes(entry.dealer) ||
      ![entry.scores, entry.bags].every(values => Array.isArray(values) && values.length === 4 &&
        values.every(value => Number.isInteger(value))) ||
      entry.bags.some(value => value < 0 || value > 9)) {
    throw Error(`Invalid public starting context: ${entry.id}`);
  }
  if (entry.mode === 'spades-partners' &&
      (entry.scores[0] !== entry.scores[2] || entry.scores[1] !== entry.scores[3] ||
       entry.bags[0] !== entry.bags[2] || entry.bags[1] !== entry.bags[3])) {
    throw Error(`Team context mismatch: ${entry.id}`);
  }
  const first = (entry.dealer + 1) % 4;
  const dealtDeck = Array.from({length: 52}, (_, index) => hands[(first + index) % 4][Math.floor(index / 4)]);
  createGame({id: entry.id, mode: entry.mode, dealer: entry.dealer}, dealtDeck);
  return {
    id: entry.id, mode: entry.mode, dealer: entry.dealer,
    scores: entry.scores, bags: entry.bags,
    origin: 'planned authored stress fixture; not a played or reachable match-prefix claim',
    intendedCoverage: entry.intendedCoverage, hands
  };
}

const episodes = proposal.proposals.map(materialize);
if (new Set(episodes.map(episode => episode.id)).size !== episodes.length) throw Error('Duplicate proposal ID');
const output = { schemaVersion: 'agent-lab-deals-1.0.0', names: proposal.names, episodes };
const command = process.argv[2] ?? 'validate';
if (command === 'validate') console.log(`${episodes.length} planned fixtures have 52 unique cards and valid public context.`);
else if (command === 'materialize') console.log(JSON.stringify(output, null, 2));
else throw Error('Commands: validate, materialize');
