/** One persistent Virtual Live resident, exposed through authenticated DSH remotes. */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, AgentHandle, AgentSetup } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import { PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { residentPersona } from './persona.ts'
import { installResidentTools } from './resident-tools.ts'
import { residentProjectionDefinition } from './state.ts'
import { commitHomeArrangement } from './home-arrangement.ts'
import type { HomeLayout, ResidentSnapshot, ResidentState } from './types.ts'
import { VirtualLivePhone, phoneConfigSchema } from './phone.ts'
import { installPhoneTools } from './phone-tools.ts'
import { ResidentMemory, memoryConfigSchema } from './memory.ts'
import type { PhoneConfig } from './phone-types.ts'
import type { MemoryConfig } from './memory-types.ts'
import { VirtualLiveConnections, connectionsConfigSchema, type ConnectionConfig } from './connections.ts'

export type * from './types.ts'
export { VirtualLivePhone } from './phone.ts'
export { VirtualLiveConnections } from './connections.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Owns the configured resident's Agent and durable history. */
    virtualLive: VirtualLive
  }
}

/** Deployment-owned resident identity and message limits. */
export interface Config {
  /** Stable Session id; changing it selects another resident history. */
  sessionId: string
  /** Preset to mount; an empty value selects the deployment default. */
  preset: string
  /** Maximum characters accepted in one user message. */
  maxMessageCharacters: number
  /** Resident walking speed in scene metres per second. */
  walkingSpeed: number
  /** Dedicated Android connection; disabled deployments do not start Python. */
  phone: PhoneConfig
  /** Long-term memory connection and optional managed Python process. */
  memory: MemoryConfig
  /** Account connection request and QR-login lifetimes. */
  connections: ConnectionConfig
}

/** Lazily opens one resident Session; unloading stops and drains its Agent. */
export default class VirtualLive extends TypertRemoteService {
  static inject = ['agents', 'agentDefaultModel', 'agentPresets', 'sessionPersistence', 'sessionProjections', 'typert']
  static Config: z<Config> = z.object({
    sessionId: z.string().pattern(/^[a-zA-Z0-9_-]+$/).default('virtuallive-resident'),
    preset: z.string().default(''),
    maxMessageCharacters: z.natural().min(1).default(16000),
    walkingSpeed: z.number().min(0.1).max(4).default(1.1),
    phone: phoneConfigSchema.default({ enabled: false }),
    memory: memoryConfigSchema.default({ enabled: false }),
    connections: connectionsConfigSchema.default({}),
  })

  private projection!: ProjectionHandle<ResidentState>
  private readonly lifetime = new AbortController()
  private readonly activation: { handle?: AgentHandle; opening?: Promise<AgentHandle> } = {}
  private readonly owner: Context
  private readonly listeners = new Set<() => void>()
  private phone: VirtualLivePhone | undefined
  private memory: ResidentMemory | undefined

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'virtualLive')
    this.owner = ctx
    ctx.effect(() => async () => {
      this.lifetime.abort()
      this.notify()
      if (this.activation.opening !== undefined) await Promise.allSettled([this.activation.opening])
      await this.activation.handle?.dispose()
      delete this.activation.handle
      await this.phone?.close()
      await this.memory?.dispose()
    }, 'virtuallive: resident lifetime')
  }

  protected async [Service.init](): Promise<void> {
    this.projection = await this.ctx.sessionProjections.register(residentProjectionDefinition)
    await this.ctx.plugin(VirtualLivePhone, this.config.phone)
    const phone = this.ctx.get('virtualLivePhone')
    if (phone === undefined) throw new Error('Virtual Live phone service did not activate')
    this.phone = phone
    await this.ctx.plugin(VirtualLiveConnections, this.config.connections)
    this.memory = await ResidentMemory.create(this.ctx, this.config.memory, () => { this.notify() })
    this.ctx.on('api-session/resolve-agent', ({ sessionId }, next) => sessionId === this.config.sessionId ? this.resident() : next())
    this.ctx.on('session/event', (session) => {
      if (session.id === this.config.sessionId) this.notify()
    })
    this.ctx.on('agent/status', ({ agent }) => {
      if (agent.id === this.config.sessionId) this.notify()
    })
  }

  private notify(): void { for (const listener of this.listeners) listener() }

  private async resident(): Promise<Agent> {
    this.lifetime.signal.throwIfAborted()
    if (this.activation.handle !== undefined) return this.activation.handle.agent
    this.activation.opening ??= this.open().finally(() => { delete this.activation.opening })
    return (await this.activation.opening).agent
  }

  private async open(): Promise<AgentHandle> {
    const sessionId = SessionId(this.config.sessionId)
    const signal = this.lifetime.signal
    const phone = this.phone
    const memory = this.memory
    if (phone === undefined || memory === undefined) throw new Error('Virtual Live has not finished starting')
    const setup: AgentSetup = async (agentCtx, agent) => {
      await this.ctx.agentPresets.mount(agentCtx, this.config.preset || undefined)
      signal.throwIfAborted()
      agentCtx.effect(() => agentCtx.systemPrompt.section({
        name: PERSONA_PREFIX_SECTION,
        order: agentCtx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
        text: () => residentPersona(this.projection.stateOf(agent.session)),
        interpolate: false,
      }), 'virtuallive: persona')
      installResidentTools(agentCtx, agent, { state: () => this.projection.stateOf(agent.session), walkingSpeed: this.config.walkingSpeed })
      installPhoneTools(agentCtx, agent, phone)
      await memory.attach(agentCtx, agent)
    }
    const saved = await this.ctx.sessionPersistence.stat(sessionId)
    signal.throwIfAborted()
    const agentOptions = this.ctx.agentDefaultModel.currentSelection()
    const handle = saved === undefined
      ? await this.owner.agents.create({ sessionId, agentOptions, setup, signal })
      : await this.owner.agents.resume({ resumeSessionId: sessionId, agentOptions, setup, signal })
    if (signal.aborted) {
      await handle.dispose()
      signal.throwIfAborted()
    }
    this.activation.handle = handle
    return handle
  }

  /**
   * Open the resident's history without starting a model turn.
   * @returns Current identity, expression, and Agent readiness.
   */
  @Remote
  async snapshot(): Promise<ResidentSnapshot> {
    const agent = await this.resident()
    const state = this.projection.stateOf(agent.session)
    const memory = this.memory
    if (memory === undefined) throw new Error('Virtual Live has not finished starting')
    const failed = state.turn?.outcome === 'error' || state.turn?.outcome === 'interrupted'
    const phase = agent.status === 'running' ? 'running' : failed ? 'failed' : state.identity === null ? 'unmet' : 'idle'
    return { sessionId: agent.id, state, memory: memory.snapshot(), phase }
  }

  /**
   * Follow resident changes; disconnecting does not cancel her turn.
   * @param signal - Client observation lifetime.
   * @returns Initial and subsequent snapshots, coalescing intermediate updates.
   */
  @Remote({ mode: 'stream' })
  async *follow(signal: AbortSignal): AsyncIterable<ResidentSnapshot> {
    signal = AbortSignal.any([signal, this.lifetime.signal])
    signal.throwIfAborted()
    let wake = Promise.withResolvers<void>()
    let changed = true
    const notify = (): void => { changed = true; wake.resolve() }
    this.listeners.add(notify)
    signal.addEventListener('abort', notify, { once: true })
    const aborted = (): boolean => signal.aborted
    try {
      while (!aborted()) {
        if (!changed) await wake.promise
        if (aborted()) break
        wake = Promise.withResolvers<void>()
        changed = false
        yield await this.snapshot()
      }
    } finally {
      this.listeners.delete(notify)
      signal.removeEventListener('abort', notify)
    }
  }

  /**
   * Queue a user message for the resident; the Agent owns execution after admission.
   * @param text - Nonempty message within the configured character limit.
   * @param signal - Request cancellation, checked before inbox admission.
   * @returns After durable inbox admission, without waiting for the model.
   */
  @Remote
  async speak(text: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const content = text.trim()
    if (content.length === 0 || content.length > this.config.maxMessageCharacters) {
      throw new RemoteError('virtuallive/invalid-message', 'Message is empty or exceeds the configured length', { maximum: this.config.maxMessageCharacters })
    }
    const agent = await this.resident()
    signal.throwIfAborted()
    this.lifetime.signal.throwIfAborted()
    agent.followup(createUserMessage({ content: [{ type: 'text', text: content }], source: { kind: 'user' } }))
  }

  /**
   * Commit a complete arrangement while stopping travel before changed obstacles.
   * @param layout - Validated furniture placements and wallpaper selection.
   * @param expectedRevision - Revision observed when the client composed this edit.
   * @param signal - Cancellation checked before committing the arrangement.
   * @returns After the room record is appended; rejected arrangements leave it unchanged.
   */
  @Remote
  async arrange(layout: HomeLayout, expectedRevision: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const agent = await this.resident()
    signal.throwIfAborted()
    this.lifetime.signal.throwIfAborted()
    const result = commitHomeArrangement(agent.session, this.projection.stateOf(agent.session), layout, expectedRevision)
    if (result.status === 'conflict') throw new RemoteError('virtuallive/stale-arrangement', 'The room has changed since this edit was composed', { currentRevision: result.homeRevision })
    if (result.status === 'invalid') throw new RemoteError('virtuallive/invalid-arrangement', result.reason === 'resident-blocked' ? 'Furniture would block the resident' : 'Invalid room arrangement', { reason: result.reason })
  }
}
