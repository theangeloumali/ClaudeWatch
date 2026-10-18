import { describe, expect, it } from 'vitest'
import { createSubscribers } from '../logic/subscribers'

describe('createSubscribers', () => {
  it('tells every listener once per notify', () => {
    const subscribers = createSubscribers()
    const heard: string[] = []
    subscribers.subscribe(() => heard.push('a'))
    subscribers.subscribe(() => heard.push('b'))
    subscribers.notify()
    expect(heard).toEqual(['a', 'b'])
  })

  it('tells nothing to a listener that unsubscribed', () => {
    const subscribers = createSubscribers()
    let heard = 0
    const stop = subscribers.subscribe(() => (heard += 1))
    stop()
    subscribers.notify()
    expect(heard).toBe(0)
  })
})
