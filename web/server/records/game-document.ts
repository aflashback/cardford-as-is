/** Installed document dispatch; pure envelope codecs remain independent of game installation. */
export * from './game-document-codec.ts';
import type { BoundSession } from '../game/kernel/session.ts';
import { decodeRegisteredDocument } from '../games/registrations.ts';
export function decodeDocument(raw: unknown): BoundSession {
  return decodeRegisteredDocument(raw);
}
