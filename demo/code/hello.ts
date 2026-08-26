import type { Artifact } from '@prism/core'

export interface Greeting {
  who: string
  times?: number
}

export function greet({ who, times = 1 }: Greeting): string[] {
  return Array.from({ length: times }, (_, i) => `hello ${who} #${i + 1}`)
}

export async function describe(a: Artifact): Promise<string> {
  const text = await a.readText()
  return `${a.path} (${a.mime}, ${a.size} bytes): ${text.slice(0, 40)}…`
}
