import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export const protocol = 'windows-replay-1';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// The original checkpoint algorithm is UTF-16 lexical order. Keep this tiny
// helper independent of the large test/support module's strategy import graph.
// Every use is checked against the immutable original per-checkpoint hashes.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key)+':'+canonical(value[key])).join(',') + '}';
  const text=JSON.stringify(value); if (text===undefined) throw new Error('Non-JSON canonical input');return text;
}
export const semanticHash = value => sha256(canonical(value));
export function verifyFrame(frame, expected) {
  assert.equal(frame.commandIndex,expected.commandIndex);
  assert.equal(semanticHash(frame.state),expected.stateSha256,'original state hash');
  for(let seat=0;seat<4;seat++) {
    assert.equal(semanticHash(frame.observations[seat]),expected.observations[seat],`seat ${seat} observation hash`);
    assert.equal(semanticHash(frame.observations[seat].legalActions),expected.legal[seat],`seat ${seat} legal hash`);
    assert.equal(semanticHash(frame.views[seat]),expected.views[seat],`seat ${seat} view hash`);
    assert.equal(semanticHash(frame.candidateIds[seat]),expected.candidateIds[seat],`seat ${seat} candidates hash`);
  }
}
export function args(argv=process.argv.slice(2)) {
  const result={};for(const arg of argv) {const [key,...value]=arg.replace(/^--/,'').split('=');result[key]=value.length?value.join('='):true;}return result;
}
export function assertWindowsNode() {
  assert.equal(process.platform,'win32','native Windows required');
  assert.equal(process.arch,'x64','Windows x64 required');
  assert.equal(process.version,'v24.19.0','pinned Node required');
}
