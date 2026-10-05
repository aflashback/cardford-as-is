/** M01 port declaration. M04 installs the web adapter and reconnect handling.
 * Hosted implementations supply only deployment-allowlisted HTTPS origins;
 * null preserves browser same-origin. Native implementations remain deferred.
 */
export interface ClientPlatform {
  readonly kind: 'web' | 'native';
  apiOrigin(): string | null;
  onForeground(listener: () => void): () => void;
  openExternal(url: string): Promise<void>;
}
