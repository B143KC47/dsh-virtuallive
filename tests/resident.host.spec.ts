/** Real Agent, tool, projection, and JSONL lifetime coverage for a resident. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Group from '@deepseek-ai/cordis-plugin-group'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import AgentPresets from '@deepseek-ai/dsh-agent-preset-registry'
import Typert from '@deepseek-ai/dsh-typert-registry'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { LlmError } from '@deepseek-ai/dsh-llm'
import VirtualLive from '../src/index.ts'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import { HOME_SPACE, initialHomeLayout } from '../src/home-space.ts'

async function mount(root: string, adapter: MockAdapter): Promise<Context> {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.baseUrl = new URL('./', import.meta.url).href
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Jsonl, { root })
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.effect(() => ctx.llm.registerAdapter(['resident-test'], adapter))
  await ctx.plugin(AgentDefaultModel, { provider: 'resident-test', model: 'scripted' })
  await ctx.plugin(AgentPresets, { default: 'resident-test' })
  await ctx.agentPresets.register({ id: 'resident-test', plugins: [] })
  await ctx.plugin(Typert)
  await ctx.plugin(SubprocessLocal)
  await ctx.plugin(VirtualLive, { ...VirtualLive.Config(), sessionId: 'resident-test', preset: '', maxMessageCharacters: 16000, walkingSpeed: 1.1 })
  return ctx
}

async function privateRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-virtuallive-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

describe('resident lifetime', () => {
  it('reports a failed admitted greeting after restart and clears it when a later turn completes', async () => {
    const root = await privateRoot()
    const adapter = new MockAdapter([() => { throw new LlmError('Provider refused this isolated request', 'AUTH') }])
    const ctx = await mount(root, adapter)
    const initial = await ctx.virtualLive.snapshot()
    await expect(ctx.virtualLive.speak('Please introduce yourself.', new AbortController().signal)).resolves.toBeUndefined()
    await ctx.agents.get(initial.sessionId)?.whenIdle()
    const failed = await ctx.virtualLive.snapshot()
    expect(failed).toMatchObject({ phase: 'failed', state: { identity: null, turn: { number: 1, outcome: 'error' } } })
    expect(adapter.requests).toHaveLength(1)
    await ctx.fiber.dispose()
    const resumed = await mount(root, new MockAdapter([textResponse('I can reply again now.')]))
    expect(await resumed.virtualLive.snapshot()).toEqual(failed)
    await resumed.virtualLive.speak('Please try again.', new AbortController().signal)
    await resumed.agents.get(initial.sessionId)?.whenIdle()
    expect(await resumed.virtualLive.snapshot()).toMatchObject({ phase: 'unmet', state: { turn: { number: 2, outcome: 'completed' } } })
  })

  it('releases a caller-activated resident when only its owning plugin unloads', async () => {
    const ctx = await mount(await privateRoot(), new MockAdapter([]))
    const first = await ctx.virtualLive.snapshot()
    const fiber = [...ctx.registry.get(VirtualLive)?.fibers ?? []][0]
    if (fiber === undefined) throw new Error('The resident plugin did not mount')
    await fiber.dispose()
    expect(ctx.get('virtualLive') === undefined).toBe(true)
    expect(ctx.agents.get(first.sessionId) === undefined).toBe(true)
    await ctx.plugin(VirtualLive, { ...VirtualLive.Config(), sessionId: 'resident-test' })
    expect(await ctx.virtualLive.snapshot()).toEqual(first)
  })

  it('records model furniture edits and refuses stale or obstructing edits without changing the home', async () => {
    const layout = initialHomeLayout()
    layout.layers.sofa.variant = 'alternate'
    layout.layers.plant.visible = false
    const blocked = structuredClone(layout)
    blocked.layers.bed.x = HOME_SPACE.places.center.x
    blocked.layers.bed.z = HOME_SPACE.places.center.z
    const adapter = new MockAdapter([
      toolCallResponse('arrange', 'live_arrange_home', { layout, expectedRevision: 0 }),
      toolCallResponse('stale', 'live_arrange_home', { layout: initialHomeLayout(), expectedRevision: 0 }),
      toolCallResponse('blocked', 'live_arrange_home', { layout: blocked, expectedRevision: 1 }),
      textResponse('I changed the sofa and put away the plant.'),
    ])
    const ctx = await mount(await privateRoot(), adapter)
    const results: unknown[] = []
    ctx.on('session/event', (_session, event) => {
      if (event.type !== 'tool/result') return
      const text = event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
      results.push(JSON.parse(text))
    }, { global: true })
    const resident = await ctx.virtualLive.snapshot()
    await ctx.virtualLive.speak('Arrange the home as you prefer.', new AbortController().signal)
    await ctx.agents.get(resident.sessionId)?.whenIdle()
    const edited = await ctx.virtualLive.snapshot()
    expect(edited.state.home).toEqual(layout)
    expect(edited.state.homeRevision).toBe(1)
    expect(results).toHaveLength(3)
    expect(results[0]).toMatchObject({ status: 'arranged', homeRevision: 1, layout })
    expect(results[1]).toEqual({ status: 'conflict', homeRevision: 1 })
    expect(results[2]).toEqual({ status: 'invalid', reason: 'resident-blocked' })
  })

  it('persists independent layer edits and rejects stale or obstructing replacements', async () => {
    const root = await privateRoot()
    const adapter = new MockAdapter([])
    const ctx = await mount(root, adapter)
    const signal = new AbortController().signal
    const layout = initialHomeLayout()
    layout.layers.sofa.visible = false
    layout.layers.bed.x = 8.75
    layout.background = 'night'
    await ctx.virtualLive.arrange(layout, 0, signal)
    const edited = await ctx.virtualLive.snapshot()
    expect(edited.state.home).toEqual(layout)
    expect(edited.state.homeRevision).toBe(1)
    expect(edited.state.journey.path).toEqual([HOME_SPACE.places.center])
    await expect(ctx.virtualLive.arrange(initialHomeLayout(), 0, signal)).rejects.toMatchObject({ code: 'virtuallive/stale-arrangement' })
    const blocked = structuredClone(layout)
    blocked.layers.bed.x = 5
    blocked.layers.bed.z = 5
    await expect(ctx.virtualLive.arrange(blocked, 1, signal)).rejects.toMatchObject({ code: 'virtuallive/invalid-arrangement' })
    const invalid = structuredClone(layout)
    invalid.layers.bed.variant = 'alternate'
    await expect(ctx.virtualLive.arrange(invalid, 1, signal)).rejects.toMatchObject({ code: 'virtuallive/invalid-arrangement' })
    await expect(ctx.virtualLive.arrange(layout, 1, AbortSignal.abort())).rejects.toThrow()
    expect(await ctx.virtualLive.snapshot()).toEqual(edited)
    expect(adapter.requests).toHaveLength(0)
    await ctx.fiber.dispose()
    const restored = await mount(root, new MockAdapter([]))
    expect(await restored.virtualLive.snapshot()).toEqual(edited)
    await restored.fiber.dispose()
  })

  it('opens once without a model call, then preserves the model-chosen name after restart', async () => {
    const root = await privateRoot()
    const adapter = new MockAdapter([
      toolCallResponse('identity', 'live_choose_identity', { name: '汐音', reason: '我喜欢潮汐', values: ['诚实', '好奇'] }),
      toolCallResponse('expression', 'live_express', { activity: 'waving', mood: 'happy', outfit: 'classic', intention: '认识新朋友' }),
      toolCallResponse('walk', 'live_move', HOME_SPACE.places.sofa),
      textResponse('你好，我想叫自己汐音。'),
    ])
    const ctx = await mount(root, adapter)
    const creations: string[] = []
    ctx.on('agent/created', ({ agent }) => { creations.push(agent.id) })
    const observations = await Promise.all([ctx.virtualLive.snapshot(), ctx.virtualLive.snapshot()])
    expect(observations.map(value => value.phase)).toEqual(['unmet', 'unmet'])
    expect(creations).toEqual(['resident-test'])
    expect(adapter.requests).toHaveLength(0)
    const idle = new Promise<void>((resolve) => {
      const stop = ctx.on('agent/status', ({ agent, status }) => {
        if (agent.id === 'resident-test' && status === 'idle') { stop(); resolve() }
      })
    })
    await ctx.virtualLive.speak('你好，你想给自己取什么名字？', new AbortController().signal)
    await idle
    const named = await ctx.virtualLive.snapshot()
    expect(named.state.identity).toEqual({ name: '汐音', reason: '我喜欢潮汐', values: ['诚实', '好奇'] })
    expect(named.state.expression.activity).toBe('waving')
    expect(named.state.lastSpoken).toBe('你好，我想叫自己汐音。')
    expect(named.phase).toBe('idle')
    expect(named.state.journey.path.at(-1)).toEqual(HOME_SPACE.places.sofa)
    expect(named.state.journey.path[0]).toEqual(HOME_SPACE.places.center)
    expect(adapter.requests).toHaveLength(4)
    await ctx.fiber.dispose()

    const restoredAdapter = new MockAdapter([])
    const restored = await mount(root, restoredAdapter)
    expect(await restored.virtualLive.snapshot()).toEqual(named)
    expect(restoredAdapter.requests).toHaveLength(0)
    await restored.fiber.dispose()
  })

  it('rejects blank and cancelled messages before starting a resident', async () => {
    const ctx = await mount(await privateRoot(), new MockAdapter([]))
    const creations: string[] = []
    ctx.on('agent/created', ({ agent }) => { creations.push(agent.id) })
    await expect(ctx.virtualLive.speak('   ', new AbortController().signal)).rejects.toMatchObject({ code: 'virtuallive/invalid-message' })
    await expect(ctx.virtualLive.speak('hello', AbortSignal.abort())).rejects.toThrow()
    expect(creations).toEqual([])
    await ctx.fiber.dispose()
  })
})
