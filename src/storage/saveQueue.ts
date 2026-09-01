const chains = new Map<string, Promise<unknown>>()

export function enqueueByKey<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve()
  const run = prev.then(task, task)
  chains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}
