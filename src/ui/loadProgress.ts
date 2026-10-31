/** Counts model downloads in flight, so the loading screen can show how far a map is from ready. */
let total = 0;
let done = 0;
const waiters = new Set<() => void>();

/** Wraps an asset load; the loading bar counts it until it settles. */
export function track<T>(p: Promise<T>): Promise<T> {
  total++;
  const settle = () => {
    done++;
    if (done >= total) for (const w of [...waiters]) w();
  };
  p.then(settle, settle);
  return p;
}

/** Share of the loads started since `reset()` that have finished (1 when nothing is loading). */
export function assetShare(): number {
  return total ? done / total : 1;
}

export function reset(): void {
  total = 0;
  done = 0;
}

/** Resolves once nothing is loading, or after `ms` so a slow model never holds the player at the loading screen. */
export function assetsIdle(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let finish = () => {};
    const t = setTimeout(() => finish(), ms);
    finish = () => {
      clearTimeout(t);
      waiters.delete(finish);
      resolve();
    };
    // the world schedules its loads a frame or two after it is built
    setTimeout(() => (done >= total ? finish() : waiters.add(finish)), 300);
  });
}
