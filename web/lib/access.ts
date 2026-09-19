/** Runtime access is deliberately closed until managed authentication (Phase 4).
 * No browser flag, header or submitted identity is an authorization capability. */
export function runtimeAccess(): false { return false; }
export function fixtureDemoEnabled(nodeEnv: string | undefined, optIn: string | undefined): boolean {
  return nodeEnv === 'development' && optIn === '1';
}
