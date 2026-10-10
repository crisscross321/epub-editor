export type WildcardToken = { type: 'text'; text: string } | { type: 'break' }

export function parseWildcards(input: string, enabled: boolean): WildcardToken[] {
  if (!enabled) return input ? [{ type: 'text', text: input }] : []
  const tokens: WildcardToken[] = []
  let buf = ''
  const flush = () => {
    if (!buf) return
    tokens.push({ type: 'text', text: buf })
    buf = ''
  }
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    const next = input[i + 1]
    if (ch === '^' && next === '^') {
      buf += '^'
      i += 1
      continue
    }
    if (ch === '^' && next === 'p') {
      flush()
      tokens.push({ type: 'break' })
      i += 1
      continue
    }
    buf += ch
  }
  flush()
  return tokens
}

export function tokensToNeedle(tokens: WildcardToken[]): string {
  return tokens.map((token) => (token.type === 'break' ? '\n' : token.text)).join('')
}

export function decodeWildcard(input: string, enabled: boolean): { needle: string; structural: boolean } {
  const tokens = parseWildcards(input, enabled)
  return {
    needle: tokensToNeedle(tokens),
    structural: tokens.some((token) => token.type === 'break'),
  }
}
