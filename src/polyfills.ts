if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = function structuredClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

if (!Object.hasOwn) {
  Object.hasOwn = (object: object, property: PropertyKey) =>
    Object.prototype.hasOwnProperty.call(object, property)
}

if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true,
    writable: true,
    value(this: unknown[], index: number) {
      const n = Math.trunc(index) || 0
      const k = n < 0 ? this.length + n : n
      if (k < 0 || k >= this.length) return undefined
      return this[k]
    },
  })
}

if (!String.prototype.replaceAll) {
  Object.defineProperty(String.prototype, 'replaceAll', {
    configurable: true,
    writable: true,
    value(this: string, search: string | RegExp, replacement: string) {
      if (search instanceof RegExp) {
        return this.replace(search, replacement)
      }
      return this.split(search).join(replacement)
    },
  })
}

if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren = function replaceChildren(...nodes: (Node | string)[]) {
    while (this.lastChild) this.removeChild(this.lastChild)
    this.append(...nodes)
  }
}
