import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
/** Server-only loader; off/zero never opens a credential file, even if configured. */
export async function loadOpenRouterKey(
  options: { live: boolean; mode: 'off' | 'shadow'; maxRequests: number; signal?: AbortSignal },
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  if (!options.live || options.mode === 'off' || options.maxRequests === 0) return null;
  if (options.signal?.aborted) throw new Error('Server credential load was cancelled.');
  const direct = env.OPENROUTER_API_KEY,
    file = env.OPENROUTER_API_KEY_FILE;
  if (direct !== undefined && file !== undefined)
    throw new Error('Configure exactly one server credential source.');
  let value: string;
  if (direct !== undefined) value = direct;
  else if (file !== undefined) {
    if (!isAbsolute(file)) throw new Error('Credential file path must be absolute.');
    try {
      value = await readFile(file, { encoding: 'utf8', signal: options.signal });
    } catch {
      throw new Error('Server credential file is unavailable.');
    }
  } else throw new Error('Server credential is unavailable.');
  const key = value.trim();
  if (options.signal?.aborted) throw new Error('Server credential load was cancelled.');
  if (!/^sk-or-v1-[A-Za-z0-9_-]{16,256}$/.test(key)) throw new Error('Server credential format is invalid.');
  return key;
}
