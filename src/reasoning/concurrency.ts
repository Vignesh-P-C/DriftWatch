// A small, dependency-free worker-pool: runs `fn` over `items` with at most
// `limit` calls in flight at once, instead of either fully sequential
// (slow, wastes the rate-limit headroom you actually have) or a bare
// Promise.all (fast, but can blow through RPM/TPM in one burst).
//
// Pattern: `limit` workers pull from a shared cursor (`nextIndex`) and race
// to grab the next item as soon as they finish their current one — so the
// pool stays exactly `limit`-wide the whole time, not just at the start.
// Each result is captured as a PromiseSettledResult so one failed call
// doesn't reject the whole batch — matches the existing "fail open per
// candidate" behavior in watcher/index.ts's try/catch.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      try {
        const value = await fn(items[current], current);
        results[current] = { status: "fulfilled", value };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}