const chains = new Map<string, Promise<unknown>>()

export function enqueueByKey<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve()
  const run = prev.then(task, task)
  const settled = run.then(() => undefined, () => undefined)
  chains.set(key, settled)
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key)
  })
  return run
}
