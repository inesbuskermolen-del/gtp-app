/**
 * Simple serialised min-interval limiter. Nominatim's usage policy caps
 * usage at 1 request/second; we use a slightly more conservative interval
 * and serialise all callers through one queue so concurrent requests from
 * multiple users don't burst past it.
 */
export function createRateLimiter(minIntervalMs: number) {
  let chain: Promise<void> = Promise.resolve();

  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const result = await fn();
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs));
      return result;
    });
    // Swallow rejections in the chain itself so one failed call doesn't
    // permanently wedge the queue for subsequent callers.
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
