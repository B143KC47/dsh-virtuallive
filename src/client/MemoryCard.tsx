/** A pure memory status card; retrieval content remains in the resident's conversation. */
import type { ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MemoryFailure, MemorySnapshot } from '../memory-types.ts'
import type { MemoryLocaleKey } from './memory-locales.ts'
import css from './MemoryCard.module.css'

const failureKey: Record<MemoryFailure, MemoryLocaleKey> = {
  connection: 'memoryConnectionFailure', operation: 'memoryOperationFailure', binding: 'memoryBindingFailure',
  durability: 'memoryDurabilityFailure', process: 'memoryProcessFailure', 'invalid-response': 'memoryInvalidResponseFailure',
}
const phaseKey: Record<MemorySnapshot['phase'], MemoryLocaleKey> = {
  disabled: 'memoryDisabled', connecting: 'memoryConnecting', ready: 'memoryReady', retaining: 'memoryRetaining', failed: 'memoryConnectionFailure',
}

/** Localized plain-data inputs for the resident memory card. */
export interface MemoryCardProps {
  memory: MemorySnapshot
  t: (key: MemoryLocaleKey, parameters?: Record<string, string>) => string
}

/**
 * Render readiness and confirmed-versus-pending counts without inferring success.
 * @param props - Host-owned memory observation and locale function.
 * @returns A naturally wrapping status card that preserves visible failure details.
 */
export function MemoryCard({ memory, t }: MemoryCardProps): ReactNode {
  const failed = memory.phase === 'failed'
  const status = t(failed ? failureKey[memory.failure] : phaseKey[memory.phase])
  return <section className={css.card}>
    <h2>{t('memoryTitle')}</h2>
    <div className={css.status} role={failed ? 'alert' : 'status'}>
      <StateDot state={failed ? 'error' : memory.phase === 'ready' ? 'done' : memory.phase === 'disabled' ? 'idle' : 'ongoing'} />
      <p>{status}</p>
    </div>
    {memory.phase !== 'disabled' && <p>{t('memoryCounts', { retained: String(memory.retained), pending: String(memory.pending) })}</p>}
    {!failed && <p>{t(memory.phase === 'disabled' ? 'memoryDisabledHint' : 'memoryReadyHint')}</p>}
  </section>
}
