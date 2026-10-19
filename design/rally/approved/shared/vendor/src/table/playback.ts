/** UX-24: common deliberate playback waits; server thinking/network time is additional. */
export function playbackDelay(kind: 'turn' | 'trick' | 'throw', speed: number): number {
  return (kind === 'trick' ? 2100 : kind === 'throw' ? 150 : 900) / (speed * 1.3);
}
