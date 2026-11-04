/** Wire validation and complete-result limits around the official Hindsight client. */
import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { expect, it, onTestFinished } from 'vitest'
import { MemoryTransport } from '../src/memory-transport.ts'
import { memoryConfigSchema } from '../src/memory.ts'
import type { MemoryOperationId, MemoryPending } from '../src/memory-types.ts'

async function service(body: unknown): Promise<string> {
  const server = createServer((request, response) => {
    request.resume()
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(body))
  })
  onTestFinished(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected an allocated HTTP port')
  return `http://127.0.0.1:${address.port}`
}

it('bounds the complete recall envelope and explicitly reports omitted oversized source text', async () => {
  const endpoint = await service({ results: [{ id: 'long-memory', text: '乌龙茶'.repeat(500) }] })
  const transport = new MemoryTransport(memoryConfigSchema({ ...memoryConfigSchema(), endpoint, resultMaxCharacters: 64 }))
  const result = await transport.recall('isolated-bank', 'What tea?', new AbortController().signal)
  expect(result.length).toBeLessThanOrEqual(64)
  expect(JSON.parse(result)).toEqual({ status: 'recalled', memories: [], truncated: true })
})

it('rejects invalid readiness and recall fields received across HTTP', async () => {
  const endpoint = await service({ status: 'ready', results: [{ id: 'invalid', text: 23 }] })
  const transport = new MemoryTransport(memoryConfigSchema({ ...memoryConfigSchema(), endpoint }))
  await expect(transport.ready(new AbortController().signal)).rejects.toMatchObject({ failure: 'invalid-response' })
  await expect(transport.recall('isolated-bank', 'query', new AbortController().signal)).rejects.toMatchObject({ failure: 'invalid-response' })
})

it('rejects a successful-looking admission that acknowledges another operation UUID', async () => {
  const endpoint = await service({ success: true, async: true, operation_id: randomUUID() })
  const transport = new MemoryTransport(memoryConfigSchema({ ...memoryConfigSchema(), endpoint }))
  const entry: MemoryPending = {
    operationId: randomUUID() as MemoryOperationId, source: 'chosen', content: 'Remember this source', timestamp: new Date().toISOString(),
  }
  await expect(transport.submit('isolated-bank', entry, new AbortController().signal)).rejects.toMatchObject({ failure: 'invalid-response' })
})
