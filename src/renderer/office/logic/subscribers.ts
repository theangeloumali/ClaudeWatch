export interface Subscribers {
  subscribe(listener: () => void): () => void
  notify(): void
}

// The listener set behind a module store; `subscribe` is stable, as useSyncExternalStore needs.
export function createSubscribers(): Subscribers {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    notify() {
      for (const listener of listeners) listener()
    }
  }
}
