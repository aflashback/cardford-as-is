/** Frozen profile: failed Nil tricks are bags, never contract credit or +1 points. */
export function scoreCompetitor(input: { bids: number[]; tricks: number[]; oldBags: number }): {
  delta: number;
  bags: number;
} {
  const { bids, tricks, oldBags } = input;
  if (
    !bids.length ||
    bids.length !== tricks.length ||
    bids.some((n) => !Number.isInteger(n) || n < 0 || n > 13) ||
    tricks.some((n) => !Number.isInteger(n) || n < 0 || n > 13) ||
    !Number.isInteger(oldBags) ||
    oldBags < 0 ||
    oldBags > 9
  )
    throw new Error('Invalid scoring input.');
  let contract = 0,
    credit = 0,
    failed = 0,
    nil = 0;
  bids.forEach((bid, i) => {
    if (bid === 0) {
      nil += tricks[i] === 0 ? 100 : -100;
      failed += tricks[i];
    } else {
      contract += bid;
      credit += tricks[i];
    }
  });
  const made = credit >= contract;
  const over = made ? credit - contract : 0;
  const total = oldBags + over + failed;
  return {
    delta: (made ? 10 : -10) * contract + nil + over - 100 * Math.floor(total / 10),
    bags: total % 10,
  };
}
