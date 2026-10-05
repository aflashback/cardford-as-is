import { runPartnerResourceMeasurement } from './measurement.ts';
const args = process.argv.slice(2);
const read = (flag: string) => {
  const i = args.indexOf(flag);
  return i < 0 ? undefined : args[i + 1];
};
const output = read('--out');
if (!output)
  throw new Error('Use --out <new evidence directory> [--count 1..64] [--max-wall-ms 100..60000].');
const run = runPartnerResourceMeasurement({
  output,
  count: read('--count') === undefined ? undefined : Number(read('--count')),
  maxWallMs: read('--max-wall-ms') === undefined ? undefined : Number(read('--max-wall-ms')),
});
console.log(JSON.stringify({ output: run.output, ...run.result }, null, 2));
