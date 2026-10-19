/**
 * Authored LOCAL DEMO examples, not recorded games or live coach evaluations.
 * Seat 0 = You, 1 = Leo, 2 = Maya, 3 = Theo.
 * Only the player's own hand and publicly played cards are included.
 * A selected card is illustrative, not a recommendation or a strength claim.
 */
export type ReplayFrame = {
  round: number;
  trick: number;
  title: string;
  caption: string;
  hand: string[];
  plays: { seat: 0 | 1 | 2 | 3; card: string }[];
  winner: 0 | 1 | 2 | 3 | null;
  focusCards?: string[];
  selected?: string[];
  remaining?: number[];
  moment?: string;
  phase?: 'pass' | 'double';
  doubled?: string[];
};

type Example = {
  round: number;
  hand: string[];
  opening: ReplayFrame['plays'];
  choice: string;
  winner: Exclude<ReplayFrame['winner'], null>;
  legalChoices: string[];
  titles: [string, string, string, string];
  captions: [string, string, string, string];
};

/** Before choice → selection preview → confirmed public play → collection. */
function sequence(example: Example): ReplayFrame[] {
  const { round, hand, opening, choice, winner, legalChoices, titles, captions } = example;
  const after = hand.filter(card => card !== choice);
  const rank = (card:string) => (({J:11,Q:12,K:13,A:14} as Record<string,number>)[card.slice(1)] || Number(card.slice(1)));
  const leading = opening.reduce((best,play) => play.card[0] === opening[0].card[0] && rank(play.card)>rank(best.card) ? play : best).seat;
  return [
    {
      round, trick: 1, title: titles[0], caption: captions[0],
      hand: [...hand], plays: opening.map(play => ({ ...play })), winner: leading,
      focusCards: [...legalChoices], remaining: [13, 12, 12, 12],
    },
    {
      round, trick: 1, title: titles[1], caption: captions[1],
      hand: [...hand], plays: opening.map(play => ({ ...play })), winner: leading,
      focusCards: [choice], selected: [choice], remaining: [13, 12, 12, 12],
    },
    {
      round, trick: 1, title: titles[2], caption: captions[2],
      hand: [...after], plays: [...opening.map(play => ({ ...play })), { seat: 0, card: choice }],
      winner, remaining: [12, 12, 12, 12],
    },
    {
      round, trick: 1, title: titles[3], caption: captions[3],
      hand: [...after], plays: [], winner: null, remaining: [12, 12, 12, 12],
    },
  ];
}

const spadesVoidHand = ['D2', 'D5', 'D8', 'DJ', 'DA', 'H2', 'H5', 'H8', 'HQ', 'S2', 'S7', 'SJ', 'SK'];

export const replayLessons: Record<'spades' | 'hearts' | 'trix', ReplayFrame[]> = {
  spades: [
    ...sequence({
      round: 1,
      hand: ['C2', 'C5', 'C8', 'D3', 'D7', 'DK', 'H3', 'H7', 'HQ', 'HK', 'S4', 'S9', 'SA'],
      opening: [{ seat: 1, card: 'D4' }, { seat: 2, card: 'D9' }, { seat: 3, card: 'DQ' }],
      choice: 'D3', winner: 3, legalChoices: ['D3', 'D7', 'DK'],
      titles: ['Diamonds set the suit', 'Three of Diamonds selected', 'The play is confirmed', 'Theo collects the trick'],
      captions: [
        'Diamonds were led. Your three diamonds are the legal choices.',
        'The 3 of Diamonds is selected. It is still in your hand.',
        'Your 3 follows diamonds. Theo’s Queen is the highest card in the completed trick.',
        'Theo collects the four public cards. You have twelve cards left.',
      ],
    }),
    ...sequence({
      round: 2,
      hand: spadesVoidHand,
      opening: [{ seat: 1, card: 'C9' }, { seat: 2, card: 'CK' }, { seat: 3, card: 'C4' }],
      choice: 'S2', winner: 0, legalChoices: spadesVoidHand,
      titles: ['No clubs to follow', 'Two of Spades selected', 'A trump wins here', 'You collect the trick'],
      captions: [
        'You have no clubs. Any card in your hand is legal.',
        'The 2 of Spades is selected. This example does not rank your alternatives.',
        'Your spade outranks the three clubs. No other trump appears in this completed trick.',
        'You collect the trick. Your confirmed play leaves twelve cards in hand.',
      ],
    }),
  ],
  hearts: [
    ...sequence({
      round: 1,
      hand: ['C3', 'C6', 'C9', 'D3', 'D7', 'DQ', 'H3', 'H7', 'HJ', 'HK', 'S3', 'S8', 'SQ'],
      opening: [{ seat: 1, card: 'C2' }, { seat: 2, card: 'C8' }, { seat: 3, card: 'CK' }],
      choice: 'C6', winner: 3, legalChoices: ['C3', 'C6', 'C9'],
      titles: ['Clubs must be followed', 'Six of Clubs selected', 'The club is confirmed', 'No penalties this trick'],
      captions: [
        'The opening 2 of Clubs sets the suit. You must play one of your clubs.',
        'The 6 of Clubs is selected. The other two clubs are also legal.',
        'Your 6 follows clubs. Theo’s King is highest in the completed trick.',
        'Theo collects four clubs. This trick contains no hearts or Queen of Spades.',
      ],
    }),
    ...sequence({
      round: 2,
      hand: ['C4', 'C7', 'CA', 'D2', 'D5', 'D9', 'H2', 'H4', 'H8', 'HQ', 'S4', 'S9', 'SK'],
      opening: [{ seat: 1, card: 'C2' }, { seat: 2, card: 'C10' }, { seat: 3, card: 'CQ' }],
      choice: 'CA', winner: 0, legalChoices: ['C4', 'C7', 'CA'],
      titles: ['Clubs are led again', 'Ace of Clubs selected', 'Your ace is highest', 'You collect four clubs'],
      captions: [
        'This new round opens with clubs. All three clubs in your hand can follow.',
        'Your Ace of Clubs is selected. It has not left your hand yet.',
        'Your ace is the highest club. The completed trick contains no penalty cards.',
        'You collect this all-club trick. Taking a trick does not always mean taking penalties.',
      ],
    }),
  ],
  trix: [
    ...sequence({
      round: 1,
      hand: ['C2', 'C5', 'C8', 'D3', 'D7', 'DK', 'H3', 'H7', 'HQ', 'HK', 'S4', 'S9', 'SA'],
      opening: [{ seat: 3, card: 'DQ' }, { seat: 2, card: 'D9' }, { seat: 1, card: 'D4' }],
      choice: 'D3', winner: 3, legalChoices: ['D3', 'D7', 'DK'],
      titles: ['Diamonds is this request', 'Three of Diamonds selected', 'Diamonds remain the suit', 'Theo collects four diamonds'],
      captions: [
        'Diamonds request: avoid collecting diamonds, while following the led suit.',
        'The 3 of Diamonds is selected. Your other diamonds remain legal alternatives.',
        'Your 3 follows diamonds. Theo’s Queen is highest in this completed trick.',
        'Theo collects four diamonds. The request assigns penalties to their collector.',
      ],
    }),
    ...sequence({
      round: 2,
      hand: ['C2', 'C7', 'CQ', 'D4', 'D6', 'DK', 'H2', 'H6', 'HJ', 'HK', 'S3', 'S8', 'SA'],
      opening: [{ seat: 3, card: 'H9' }, { seat: 2, card: 'HQ' }, { seat: 1, card: 'H4' }],
      choice: 'H2', winner: 2, legalChoices: ['H2', 'H6', 'HJ', 'HK'],
      titles: ['Queens is this request', 'Two of Hearts selected', 'Maya’s Queen stays highest', 'Maya collects the Queen'],
      captions: [
        'Queens request: avoid collecting queens. Hearts were led, and you hold hearts.',
        'The 2 of Hearts is selected. Following hearts is required here.',
        'Your 2 follows hearts. Maya’s Queen remains highest in the completed trick.',
        'Maya collects the Queen of Hearts. Your hand now contains twelve cards.',
      ],
    }),
  ],
};

/** Pre-trick examples use only the player's own cards and confirmed public announcements. */
function selectionFrame(frame: Omit<ReplayFrame, 'trick' | 'plays' | 'winner' | 'remaining'>): ReplayFrame {
  return {
    ...frame,
    hand: [...frame.hand],
    trick: 0,
    plays: [],
    winner: null,
    remaining: [13, 13, 13, 13],
  };
}

const selectionOpeningHand = ['C2', 'C5', 'C8', 'D3', 'D7', 'DK', 'H3', 'H7', 'HQ', 'HK', 'S4', 'S9', 'SA'];
const heartsRightHand = ['C3', 'C6', 'CJ', 'D2', 'D6', 'DQ', 'H2', 'H8', 'HJ', 'HA', 'S2', 'S7', 'SK'];
const kingRequestHand = ['C3', 'C7', 'CA', 'D2', 'D5', 'DQ', 'H2', 'H6', 'H9', 'HK', 'S3', 'S8', 'SJ'];

/** Selection previews are illustrative; confirmation is shown as a separate moment. */
export const selectionLessons: Partial<Record<'spades' | 'hearts' | 'trix', ReplayFrame[]>> = {
  hearts: [
    selectionFrame({
      round: 1, moment: 'Pass left', phase: 'pass',
      title: 'Choose three cards',
      caption: 'Choose exactly three cards to pass left.',
      hand: selectionOpeningHand,
    }),
    selectionFrame({
      round: 1, moment: 'Pass left', phase: 'pass',
      title: 'Three cards selected',
      caption: 'These high cards can take later tricks. Selection is not confirmation.',
      hand: selectionOpeningHand, selected: ['HQ', 'HK', 'SA'], focusCards: ['HQ', 'HK', 'SA'],
    }),
    selectionFrame({
      round: 1, moment: 'Pass left · Confirmed',
      title: 'Your pass is confirmed',
      caption: 'Three cards left your hand. You received the 10 of Clubs, Diamonds and Spades.',
      hand: ['C2', 'C5', 'C8', 'C10', 'D3', 'D7', 'D10', 'DK', 'H3', 'H7', 'S4', 'S9', 'S10'],
      focusCards: ['C10', 'D10', 'S10'],
    }),
    selectionFrame({
      round: 2, moment: 'Pass right', phase: 'pass',
      title: 'The direction changes',
      caption: 'This round passes right. Choose three cards from your own hand.',
      hand: heartsRightHand,
    }),
    selectionFrame({
      round: 2, moment: 'Pass right', phase: 'pass',
      title: 'Selection can still change',
      caption: 'Selection only previews the pass. You can change these three cards before confirming.',
      hand: heartsRightHand, selected: ['DQ', 'HA', 'SK'], focusCards: ['DQ', 'HA', 'SK'],
    }),
    selectionFrame({
      round: 2, moment: 'Pass right · Confirmed',
      title: 'Three new cards received',
      caption: 'The pass is confirmed. Your thirteen-card hand now includes the three received cards.',
      hand: ['C3', 'C6', 'C9', 'CJ', 'D2', 'D6', 'D9', 'H2', 'H8', 'HJ', 'S2', 'S5', 'S7'],
      focusCards: ['C9', 'D9', 'S5'],
    }),
  ],
  trix: [
    selectionFrame({
      round: 1, moment: 'Queens · Doubling', phase: 'double',
      title: 'Queens can be doubled',
      caption: 'Queens request: your Queen of Hearts is eligible; your King of Hearts is not.',
      hand: selectionOpeningHand, focusCards: ['HQ'], doubled: [],
    }),
    selectionFrame({
      round: 1, moment: 'Queens · Doubling', phase: 'double',
      title: 'Your Queen is selected',
      caption: 'Queen of Hearts selected. Confirming is separate; you can still choose Pass.',
      hand: selectionOpeningHand, selected: ['HQ'], focusCards: ['HQ'], doubled: [],
    }),
    selectionFrame({
      round: 1, moment: 'Queens · Double confirmed',
      title: 'Your Queen is announced',
      caption: 'The confirmed Queen is publicly announced. It remains in your hand until played.',
      hand: selectionOpeningHand, doubled: ['HQ'],
    }),
    selectionFrame({
      round: 2, moment: 'The King · Doubling', phase: 'double',
      title: 'A new request begins',
      caption: 'New request, new deal. Only your King of Hearts is eligible here.',
      hand: kingRequestHand, focusCards: ['HK'], doubled: [],
    }),
    selectionFrame({
      round: 2, moment: 'The King · Doubling', phase: 'double',
      title: 'Your King is selected',
      caption: 'The King of Hearts is selected. Confirm to double it, or choose Pass.',
      hand: kingRequestHand, selected: ['HK'], focusCards: ['HK'], doubled: [],
    }),
    selectionFrame({
      round: 2, moment: 'The King · Double confirmed',
      title: 'Your King is announced',
      caption: 'Your King is now publicly announced. The earlier Queen announcement does not carry over.',
      hand: kingRequestHand, doubled: ['HK'],
    }),
  ],
};
