/** Memory status copy preserves uncertainty and distinguishes a disabled connection. */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { MemoryCard } from '../src/client/MemoryCard.tsx'
import { memoryEn, memoryZh, type MemoryLocaleKey } from '../src/client/memory-locales.ts'
import type { MemorySnapshot } from '../src/memory-types.ts'

const counts = { engine: 'hindsight' as const, bankId: 'isolated-resident', retained: 2, pending: 3, lastRetainedAt: null }
function markup(memory: MemorySnapshot, dictionary: Record<MemoryLocaleKey, string>): string {
  return renderToStaticMarkup(createElement(MemoryCard, {
    memory, t: (key, parameters = {}) => Object.entries(parameters).reduce((text, [key, value]) => text.replace(`{${key}}`, value), dictionary[key]),
  }))
}

it('shows confirmed and pending deliveries independently while retaining', () => {
  const html = markup({ ...counts, phase: 'retaining' }, memoryEn)
  expect(html).toContain('Organizing memories')
  expect(html).toContain('2 confirmed memories, 3 awaiting confirmation')
  expect(html).not.toContain('Memory connected')
})

it('keeps an extraction failure visible alongside the saved backlog in both locales', () => {
  const english = markup({ ...counts, phase: 'failed', failure: 'operation' }, memoryEn)
  const chinese = markup({ ...counts, phase: 'failed', failure: 'operation' }, memoryZh)
  expect(english).toContain('role="alert"')
  expect(english).toContain('Its source is preserved')
  expect(chinese).toContain('原文仍保留')
  expect(chinese).toContain('待确认 3 条')
})

it('describes disabled retrieval without claiming a ready connection', () => {
  const html = markup({ ...counts, pending: 0, phase: 'disabled' }, memoryEn)
  expect(html).toContain('Long-term memory disabled')
  expect(html).toContain('Conversations remain in her history')
  expect(html).not.toContain('confirmed memories')
  expect(html).not.toContain('Memory connected')
})
