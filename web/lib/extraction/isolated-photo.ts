import { createHash } from 'node:crypto';

export const ISOLATED_PHOTO_OUTPUT_TOKENS = 2200;
export const MAX_PHOTO_RESERVATION_MICROUSD = 1_000_000;

/** Slot zero deliberately reuses the existing parent identities: its successful
 * reservation/claim gates ALL slots; completion awaits the group, preserving old tombstones
 * and preventing concurrent replays from splitting group ownership. Slots 1..3
 * are deterministic children. Each identity depends only on its corresponding
 * parent and slot, never mutable photo IDs/hash/order or the other identity.
 * Thus changing either parent alone cannot bypass the other permanent fence.
 */
export function isolatedPhotoAttemptIds(parent: { attemptId: string; reservationId: string }, slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) throw Error('Invalid photo slot');
  if (slot === 0) return { attemptId: parent.attemptId, reservationId: parent.reservationId };
  const derive = (kind: string, id: string) => {
    const hash = createHash('sha1').update(Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex')).update(`ttb:isolated-photo:v1:${kind}:${id}:${slot}`).digest().subarray(0, 16);
    hash[6] = (hash[6] & 15) | 80; hash[8] = (hash[8] & 63) | 128;
    const h = hash.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  return { attemptId: derive('attempt', parent.attemptId), reservationId: derive('reservation', parent.reservationId) };
}
