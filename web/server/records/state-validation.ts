import { readLegacyGame } from '../game/legacy/reader.ts';
import { ApiFailure } from '../http/errors.ts';

/**
 * Validate active V1 rules/state before use or persistence without rewriting bytes.
 * Historical platform/advice records keep their original readers; their complete
 * versioned envelope and V2 activation remain the separate M03 migration.
 */
export function validateStoredGameState(game: { id: unknown; revision: unknown; document: unknown }): void {
  try {
    if (typeof game.id !== 'string' || !Number.isSafeInteger(game.revision) || Number(game.revision) < 0)
      throw new TypeError('Invalid stored game identity.');
    const document = game.document;
    if (typeof document !== 'object' || document === null || Array.isArray(document) || !Object.hasOwn(document, 'state'))
      throw new TypeError('Missing private state.');
    const state: unknown = Reflect.get(document, 'state');
    const parsed = readLegacyGame(state);
    if (parsed.kind !== 'playable' || parsed.state.id !== game.id)
      throw new TypeError('Unavailable or mismatched private state.');
  } catch {
    throw new ApiFailure(409, 'INVALID_COMMAND', 'The saved game state could not be validated. Its original records have been preserved.');
  }
}
