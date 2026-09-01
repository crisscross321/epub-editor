import { describe, expect, it } from 'vitest'
import { enqueueByKey } from './saveQueue'

describe('enqueueByKey', () => {
  it('runs tasks for the same key one after another', async () => {
    const order: string[] = []
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = enqueueByKey('ch1', async () => {
      order.push('start-a')
      await gate
      order.push('end-a')
      return 'a'
    })
    const second = enqueueByKey('ch1', async () => {
      order.push('b')
      return 'b'
    })
    await Promise.resolve()
    expect(order).toEqual(['start-a'])
    release()
    expect(await first).toBe('a')
    expect(await second).toBe('b')
    expect(order).toEqual(['start-a', 'end-a', 'b'])
  })

  it('still runs the next task if the previous one failed', async () => {
    const failed = enqueueByKey('ch2', async () => {
      throw new Error('boom')
    })
    const next = enqueueByKey('ch2', async () => 'ok')
    await expect(failed).rejects.toThrow('boom')
    expect(await next).toBe('ok')
  })
})
