export function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  // Fallback for non-secure contexts (e.g. http over LAN IP)
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

