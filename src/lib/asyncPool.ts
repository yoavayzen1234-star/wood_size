/**
 * מריץ משימות אסינכרוניות עם מגבלת מקבילות (תור).
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, Math.floor(concurrency))
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    for (;;) {
      const i = nextIndex++
      if (i >= items.length) break
      results[i] = await fn(items[i]!, i)
    }
  }

  const n = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}
