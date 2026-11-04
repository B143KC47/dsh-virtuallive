/** Real Agent/JSONL recovery against an isolated HTTP implementation of Hindsight. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Group from '@deepseek-ai/cordis-plugin-group'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import AgentPresets from '@deepseek-ai/dsh-agent-preset-registry'
import Typert from '@deepseek-ai/dsh-typert-registry'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import VirtualLive from '../src/index.ts'
import type { MemoryConfig } from '../src/memory-types.ts'

const retainBody = z.object({
  operation_id: z.uuid(), async: z.literal(true), items: z.array(z.object({ content: z.string(), document_id: z.string() })),
})

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  return JSON.parse(Buffer.concat(chunks).toString())
}

async function backend(): Promise<{
  endpoint: string
  writes: { operationId: string; content: string }[]
  operations: Map<string, 'completed' | 'failed'>
  loseAcknowledgement: boolean
  failExtraction: boolean
}> {
  const state = { endpoint: '', writes: [] as { operationId: string; content: string }[], operations: new Map<string, 'completed' | 'failed'>(), loseAcknowledgement: false, failExtraction: false }
  const respond = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/health/ready') { response.end('{"status":"healthy"}'); return }
    const operation = /\/operations\/([^/]+)$/.exec(request.url ?? '')
    if (operation !== null) {
      const id = operation[1]!
      const status = state.operations.get(id)
      response.statusCode = status === undefined ? 404 : 200
      response.end(JSON.stringify(status === undefined ? { detail: 'absent' } : { operation_id: id, status }))
      return
    }
    if (request.url?.endsWith('/memories/recall')) {
      response.end(JSON.stringify({ results: [{ id: 'recalled-source', text: 'The visitor prefers unsweetened oolong tea on Tuesdays.', document_id: 'source-document' }] }))
      return
    }
    if (request.method === 'POST' && request.url?.endsWith('/memories')) {
      const body = retainBody.parse(await readBody(request))
      if (!state.operations.has(body.operation_id)) {
        state.writes.push({ operationId: body.operation_id, content: body.items.map(item => item.content).join('\n') })
        state.operations.set(body.operation_id, state.failExtraction ? 'failed' : 'completed')
      }
      if (state.loseAcknowledgement) { request.socket.destroy(); return }
      response.end(JSON.stringify({ success: true, async: true, operation_id: body.operation_id, bank_id: 'memory-test', items_count: body.items.length }))
      return
    }
    response.statusCode = 404
    response.end('{"detail":"unexpected request"}')
  }
  const server = createServer((request, response) => {
    void respond(request, response).catch((error: unknown) => {
      response.statusCode = 500
      response.end(JSON.stringify({ error: String(error) }))
    })
  })
  onTestFinished(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected an allocated HTTP port')
  state.endpoint = `http://127.0.0.1:${address.port}`
  return state
}

async function storedRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

async function mount(root: string, endpoint: string, adapter = new MockAdapter([]), memory: Partial<MemoryConfig> = {}): Promise<Context> {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.baseUrl = new URL('./', import.meta.url).href
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Jsonl, { root })
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.effect(() => ctx.llm.registerAdapter(['memory-test'], adapter))
  await ctx.plugin(AgentDefaultModel, { provider: 'memory-test', model: 'scripted' })
  await ctx.plugin(AgentPresets, { default: 'memory-test' })
  await ctx.agentPresets.register({ id: 'memory-test', plugins: [] })
  await ctx.plugin(Typert)
  const defaults = VirtualLive.Config()
  await ctx.plugin(VirtualLive, VirtualLive.Config({ ...defaults, sessionId: 'memory-test', memory: {
    ...defaults.memory, enabled: true, endpoint, pollIntervalMs: 5, retryIntervalMs: 25, ...memory,
  } }))
  await ctx.virtualLive.snapshot()
  return ctx
}

function idle(ctx: Context): Promise<void> {
  return new Promise((resolve) => { const stop = ctx.on('agent/status', ({ agent, status }) => { if (agent.id === 'memory-test' && status === 'idle') { stop(); resolve() } }) })
}

describe('resident memory delivery', () => {
  it('keeps an uncertain accepted write in JSONL and acknowledges it after restart without another write', async () => {
    const api = await backend()
    api.loseAcknowledgement = true
    const root = await storedRoot()
    const first = await mount(root, api.endpoint)
    const agent = first.agents.get(SessionId('memory-test'))!
    expect(await first.sessions.flush(agent.session)).toBe(true)
    agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'The blue teacup belongs beside the east window.' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    await vi.waitFor(async () => { expect((await first.virtualLive.snapshot()).memory).toMatchObject({ phase: 'failed', pending: 1, retained: 0 }) })
    expect(api.writes).toHaveLength(1)
    const reader = await first.sessionPersistence.open(agent.id, 'read')
    try { expect(JSON.stringify((await reader.read()).events)).toContain('The blue teacup belongs beside the east window.') }
    finally { await reader.close() }
    await first.fiber.dispose()
    api.loseAcknowledgement = false
    const restored = await mount(root, api.endpoint)
    await vi.waitFor(async () => { expect((await restored.virtualLive.snapshot()).memory).toMatchObject({ phase: 'ready', pending: 0, retained: 1 }) })
    expect(api.writes).toHaveLength(1)
    await restored.fiber.dispose()
  })

  it('reports failed extraction with its pending source and blocks a changed destination', async () => {
    const api = await backend()
    api.failExtraction = true
    const root = await storedRoot()
    const first = await mount(root, api.endpoint)
    const agent = first.agents.get(SessionId('memory-test'))!
    expect(await first.sessions.flush(agent.session)).toBe(true)
    agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Preserve this source when extraction fails.' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    await vi.waitFor(async () => { expect((await first.virtualLive.snapshot()).memory).toMatchObject({ phase: 'failed', failure: 'operation', pending: 1, retained: 0 }) })
    await first.fiber.dispose()
    const rebound = await mount(root, api.endpoint, new MockAdapter([]), { bankId: 'another-resident' })
    expect((await rebound.virtualLive.snapshot()).memory).toMatchObject({ phase: 'failed', failure: 'binding', pending: 1, retained: 0 })
    expect(api.writes).toHaveLength(1)
    await rebound.fiber.dispose()
  })

  it('records retrieved source text as an ordinary tool result before the model uses it', async () => {
    const api = await backend()
    const adapter = new MockAdapter([
      toolCallResponse('recall', 'live_recall', { query: 'What does the visitor drink on Tuesdays?' }),
      textResponse('You prefer unsweetened oolong tea on Tuesdays.'),
    ])
    const ctx = await mount(await storedRoot(), api.endpoint, adapter, { automatic: false })
    const finished = idle(ctx)
    await ctx.virtualLive.speak('What do you remember about my tea?', new AbortController().signal)
    await finished
    const agent = ctx.agents.get(SessionId('memory-test'))!
    const reader = await ctx.sessionPersistence.open(agent.id, 'read')
    try {
      await ctx.sessions.flush(agent.session)
      const events = (await reader.read()).events
      const results = events.filter(event => event.type === 'tool/result')
      expect(JSON.stringify(results)).toContain('The visitor prefers unsweetened oolong tea on Tuesdays.')
      expect(JSON.stringify(adapter.requests[0])).not.toContain('The visitor prefers unsweetened oolong tea on Tuesdays.')
      expect(JSON.stringify(adapter.requests[1])).toContain('The visitor prefers unsweetened oolong tea on Tuesdays.')
    } finally { await reader.close() }
    expect(api.writes).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('pauses automatic admission when disabled and resumes in the same bank without backfilling that interval', async () => {
    const api = await backend()
    const root = await storedRoot()
    const first = await mount(root, api.endpoint)
    await first.fiber.dispose()
    const paused = await mount(root, api.endpoint, new MockAdapter([]), { enabled: false })
    const agent = paused.agents.get(SessionId('memory-test'))!
    agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'History continues while long-term retention is disabled.' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    expect((await paused.virtualLive.snapshot()).memory).toMatchObject({ phase: 'disabled', pending: 0 })
    await paused.fiber.dispose()
    const resumed = await mount(root, api.endpoint)
    await vi.waitFor(async () => { expect((await resumed.virtualLive.snapshot()).memory).toMatchObject({ phase: 'ready', pending: 0 }) })
    expect(api.writes).toHaveLength(0)
    await resumed.fiber.dispose()
  })
})
