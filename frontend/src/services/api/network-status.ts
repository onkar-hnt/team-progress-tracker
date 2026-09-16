/**
 * The browser's view of connectivity, behind one pair of listeners.
 *
 * Everything that needs to know — the API client, which refuses to send while
 * offline, and the global feedback that tells the person so — reads it from
 * here, so no screen registers its own `online`/`offline` handlers.
 *
 * `navigator.onLine` is trustworthy in one direction only: `false` means there
 * is no connection, while `true` merely means the machine has a network, not
 * that the gateway is answering. It is therefore used to avoid pointless
 * requests, never to promise that one will succeed.
 */

type NetworkStatusListener = (online: boolean) => void

const listeners = new Set<NetworkStatusListener>()

function readBrowserStatus(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

let online = readBrowserStatus()

function announce(next: boolean): void {
  if (next === online) return

  online = next
  for (const listener of [...listeners]) listener(next)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => announce(true))
  window.addEventListener('offline', () => announce(false))
}

export function isOnline(): boolean {
  return online
}

/** Notified on every transition. Returns the unsubscribe function. */
export function onNetworkStatusChange(listener: NetworkStatusListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
