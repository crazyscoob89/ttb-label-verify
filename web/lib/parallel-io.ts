/** Independent I/O only: at most two operations, in ordered waves. Drain both
 * started operations even on failure; never leave an untracked sibling running
 * or start a later wave after failure/cancellation. Callers retain their existing
 * deadlines and validation/quota/commit barriers. No retries. */
export async function mapTwoIO<T, R>(items: readonly T[], work: (item: T, index: number) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += 2) {
    signal?.throwIfAborted();
    const wave = await Promise.allSettled(items.slice(start, start + 2).map(async (item, offset) => {
      signal?.throwIfAborted();
      return work(item, start + offset);
    }));
    for (const result of wave) {
      if (result.status === 'rejected') throw result.reason;
      results.push(result.value);
    }
    signal?.throwIfAborted();
  }
  return results;
}
