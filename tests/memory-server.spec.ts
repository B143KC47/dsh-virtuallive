/** Managed memory subprocess shutdown observes quiescence and preserves forced-exit failures. */
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { ManagedMemoryModel, ManagedMemoryServer } from '../src/memory-server.ts'
import { memoryConfigSchema } from '../src/memory.ts'

function child() {
  const outcome = Promise.withResolvers<SubprocessOutcome>()
  const exited = Promise.withResolvers<undefined>()
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const terminate = vi.fn(() => { outcome.resolve({ exitCode: null, signal: 'SIGTERM' }); exited.resolve(undefined) })
  const handle: SubprocessHandle = {
    stdin, stdout, stderr, control: undefined, collected: {}, done: outcome.promise, terminate,
    async waitForExit(signal) {
      if (signal === undefined) { await exited.promise; return true }
      if (signal.aborted) return false
      let abort: (() => void) | undefined
      const stopped = new Promise<false>((resolve) => { abort = () => { resolve(false) }; signal.addEventListener('abort', abort, { once: true }) })
      try { return await Promise.race([exited.promise.then(() => true), stopped]) }
      finally { if (abort !== undefined) signal.removeEventListener('abort', abort) }
    },
  }
  return { handle, outcome, exited, stdin, terminate }
}

describe('managed memory processes', () => {
  it('requests graceful Python shutdown and waits for its managed process range to exit', async () => {
    const process = child()
    const config = memoryConfigSchema({ ...memoryConfigSchema(), pythonExecutable: 'python', serverWorkingDirectory: '/memory' })
    let received = ''
    process.stdin.on('data', (data) => { received += String(data) })
    const spawn = vi.fn((_spec: SubprocessSpawnSpec) => process.handle)
    const failed = vi.fn()
    const server = new ManagedMemoryServer({ spawn }, config, new URL('http://127.0.0.1:8898'), failed)
    const closing = server.dispose(10000)
    expect(received).toBe('shutdown\n')
    const stillWaiting = vi.fn()
    void closing.then(stillWaiting)
    expect(stillWaiting).not.toHaveBeenCalled()
    process.outcome.resolve({ exitCode: 0, signal: null })
    process.exited.resolve(undefined)
    await closing
    expect(process.terminate).not.toHaveBeenCalled()
    expect(failed).not.toHaveBeenCalled()
    expect(spawn.mock.calls[0]?.[0]).toMatchObject({ argv: ['python', '-u', '-c', expect.any(String)], cwd: '/memory', stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' } })
    await server.dispose(10000)
  })

  it('terminates a server that misses its grace period and keeps that failure on repeated disposal', async () => {
    const process = child()
    process.handle.waitForExit = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const config = memoryConfigSchema({ ...memoryConfigSchema(), pythonExecutable: 'python' })
    const server = new ManagedMemoryServer({ spawn: () => process.handle }, config, new URL('http://127.0.0.1:8898'), vi.fn())
    await expect(server.dispose(10000)).rejects.toThrow('forced termination')
    expect(process.terminate).toHaveBeenCalledTimes(1)
    await expect(server.dispose(10000)).rejects.toThrow('forced termination')
  })

  it('reports an unexpected inference exit and drains model shutdown after termination', async () => {
    const process = child()
    const failed = vi.fn()
    const spawn = vi.fn((_spec: SubprocessSpawnSpec) => process.handle)
    const config = memoryConfigSchema({ ...memoryConfigSchema(), localModelExecutable: 'llama-server', localModelArguments: ['--model', 'resident.gguf'] })
    const model = new ManagedMemoryModel({ spawn }, config, failed)
    process.outcome.resolve({ exitCode: 7, signal: null })
    await vi.waitFor(() => { expect(failed).toHaveBeenCalledOnce() })
    const closing = model.dispose()
    await closing
    expect(process.terminate).toHaveBeenCalledTimes(1)
    await model.dispose()
    expect(process.terminate).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls[0]?.[0].argv).toEqual(['llama-server', '--model', 'resident.gguf'])
  })
})
