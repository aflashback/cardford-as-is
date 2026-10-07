import { backend } from '../platform/web.ts';
import { useGoSession } from './useGoSession.ts';
import { useNodeSession } from './useNodeSession.ts';

// Build-time selection is immutable for the lifetime of this application.
export function useSession() {
  return backend === 'go' ? useGoSession() : useNodeSession();
}
