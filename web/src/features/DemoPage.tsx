import { useState } from 'react';

const examples = [
  { title: 'A short example game', body: 'You hold the 4 and king of clubs. Clubs were led. The visible high card is the ace of clubs.', choices: ['Play the 4 of clubs', 'Play the king of clubs'] },
  { title: 'Notice', body: 'Both cards follow suit. Neither can beat the visible ace. Keeping the king preserves a higher card for a later trick.', choices: ['Show the original', 'Compare another choice'] },
  { title: 'Original', body: 'In this authored example, you play the 4 of clubs. The ace wins this trick. Your king stays in your hand.', choices: ['Compare another choice', 'Finish example'] },
  { title: 'Possible continuation', body: 'If you played the king instead, the visible ace would still win this trick. This example explains that tradeoff; it does not predict a whole game.', choices: ['Show the original', 'Finish example'] },
  { title: 'Example complete', body: 'You have reached the end of this fixed example. Replay it or return to your account.', choices: ['Replay example'] },
] as const;
const edges: readonly (readonly number[])[] = [[1, 1], [2, 3], [3, 4], [2, 4], [0]];
export function DemoPage() {
  const [node, setNode] = useState(0);
  const example = examples[node];
  return <main className="account-page demo-page"><header><a className="wordmark" href="#">Tricks Coach</a><a className="text-button" href="#account">Account</a></header><p className="fixture-notice">Example game · fixed authored demo</p><section className="account-section"><h1>{example.title}</h1><div className="demo-cards" aria-label="Example cards"><span>4♣</span><span>K♣</span><span>A♣</span></div><p>{example.body}</p><div className="demo-actions">{example.choices.map((choice, index) => <button className="primary-button" key={choice} onClick={() => setNode(edges[node][index])}>{choice}</button>)}</div></section><a className="text-button" href="#account">View membership</a></main>;
}
