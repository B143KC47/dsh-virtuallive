/** Official Hindsight client with validated asynchronous write acknowledgements. */
import { HindsightClient, HindsightError, createClient, createConfig, sdk } from '@vectorize-io/hindsight-client'
import { z } from 'zod'
import type { MemoryConfig, MemoryFailure, MemoryPending } from './memory-types.ts'

const operationSchema = z.object({
  operation_id: z.uuid(), status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled', 'not_found']),
})
const retainSchema = z.object({ success: z.literal(true), async: z.literal(true), operation_id: z.uuid() })
const readinessSchema = z.object({ status: z.literal('healthy') })
const recallSchema = z.object({ results: z.array(z.object({
  id: z.string(), text: z.string(), type: z.string().nullable().optional(),
  occurred_start: z.string().nullable().optional(), document_id: z.string().nullable().optional(),
})) })

/** Expected memory failure; the durable backlog remains authoritative after rejection. */
export class MemoryError extends Error {
  constructor(readonly failure: MemoryFailure, message: string, options?: ErrorOptions) { super(message, options) }
}

/** Hindsight network operations do not retry non-idempotent synchronous writes. */
export class MemoryTransport {
  private readonly client: HindsightClient
  private readonly raw: ReturnType<typeof createClient>

  constructor(private readonly config: MemoryConfig) {
    const token = config.apiKeyEnvironment === '' ? undefined : process.env[config.apiKeyEnvironment]
    if (config.apiKeyEnvironment !== '' && !token) throw new Error(`Memory API token environment variable ${config.apiKeyEnvironment} is empty`)
    this.client = new HindsightClient({ baseUrl: config.endpoint, ...(token === undefined ? {} : { apiKey: token }), maxAttempts: 1 })
    this.raw = createClient(createConfig({ baseUrl: config.endpoint, headers: token ? { Authorization: `Bearer ${token}` } : {} }))
  }

  /**
   * Check that the API and its database are ready.
   * @param signal - Owning operation's cancellation and deadline.
   * @returns After Hindsight reports readiness; connection failures reject.
   */
  async ready(signal: AbortSignal): Promise<void> {
    const response = await sdk.getReadiness({ client: this.raw, signal })
    if (response.error !== undefined || response.response === undefined || !response.response.ok) throw new MemoryError('connection', 'Hindsight is not ready')
    if (!readinessSchema.safeParse(response.data).success) throw new MemoryError('invalid-response', 'Hindsight returned invalid readiness fields')
  }

  /**
   * Submit one asynchronous retain with a durable caller-supplied UUID.
   * @param bankId - Resident-isolated destination.
   * @param entry - The unchanged outbox entry, including its UUID and original timestamp.
   * @param signal - Owning operation's cancellation and deadline.
   * @returns After server admission, without claiming extraction has finished.
   */
  async submit(bankId: string, entry: MemoryPending, signal: AbortSignal): Promise<void> {
    const response = retainSchema.safeParse(await this.client.retain(bankId, entry.content, {
      async: true, operationId: entry.operationId, documentId: entry.operationId,
      timestamp: entry.timestamp, context: `Virtual Live ${entry.source} statement`,
      metadata: { source: entry.source }, updateMode: 'replace', signal,
    }))
    if (!response.success || response.data.operation_id !== entry.operationId) {
      throw new MemoryError('invalid-response', 'Hindsight did not acknowledge the submitted memory operation')
    }
  }

  /**
   * Observe an operation before deciding whether its idempotent submission is needed.
   * @param bankId - Resident-isolated destination.
   * @param entry - Outstanding memory UUID.
   * @param signal - Owning operation's cancellation and deadline.
   * @returns Server status; absent operations return not_found and other failures reject.
   */
  async status(bankId: string, entry: MemoryPending, signal: AbortSignal): Promise<z.infer<typeof operationSchema>['status']> {
    const response = await sdk.getOperationStatus({ client: this.raw, path: { bank_id: bankId, operation_id: entry.operationId }, signal })
    if (response.response === undefined) throw new MemoryError('connection', 'Hindsight operation status could not be reached')
    if (response.response.status === 404) return 'not_found'
    if (response.error !== undefined) throw new HindsightError('Unable to read memory operation', response.response.status)
    const parsed = operationSchema.safeParse(response.data)
    if (!parsed.success || parsed.data.operation_id !== entry.operationId) throw new MemoryError('invalid-response', 'Hindsight returned invalid memory operation fields')
    return parsed.data.status
  }

  /**
   * Retrieve bounded source memories through the ordinary tool-result path.
   * @param bankId - Resident-isolated destination.
   * @param query - Natural-language retrieval query.
   * @param signal - Owning operation's cancellation and deadline.
   * @returns Validated source text and its document references; the complete serialized result is size-bounded.
   */
  async recall(bankId: string, query: string, signal: AbortSignal): Promise<string> {
    const response = recallSchema.safeParse(await this.client.recall(bankId, query, {
      maxTokens: this.config.recallMaxTokens, budget: 'mid', includeChunks: true, signal,
    }))
    if (!response.success) throw new MemoryError('invalid-response', 'Hindsight returned invalid recall fields')
    const memories = response.data.results.map(item => ({
      id: item.id, text: item.text, kind: item.type ?? 'unspecified',
      occurredAt: item.occurred_start ?? null, documentId: item.document_id ?? null,
    }))
    let truncated = false
    while (true) {
      const text = JSON.stringify({ status: 'recalled', memories, truncated })
      if (text.length <= this.config.resultMaxCharacters) return text
      if (memories.length === 0) throw new MemoryError('invalid-response', 'Memory result character limit cannot fit its result envelope')
      memories.pop()
      truncated = true
    }
  }
}
