/** זיהוי ביטול בקשה (AbortController / fetch). */
export function isAbortError(e: unknown): boolean {
  return (
    (e instanceof Error && e.name === 'AbortError') ||
    (typeof e === 'object' &&
      e !== null &&
      'name' in e &&
      (e as { name?: string }).name === 'AbortError')
  )
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  const err = new Error('The user aborted a request.')
  err.name = 'AbortError'
  throw err
}
