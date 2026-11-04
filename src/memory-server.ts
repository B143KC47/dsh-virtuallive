/** Optional Hindsight subprocess, owned through graceful exit and database teardown. */
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { MemoryConfig } from './memory-types.ts'
import { MEMORY_WORKER_SOURCE } from './memory-worker.ts'

/** A managed interpreter receives only host necessities and explicit server settings. */
export class ManagedMemoryServer {
  private readonly process: SubprocessHandle
  private readonly exited: Promise<void>
  private stopping = false
  private closing: Promise<void> | undefined

  constructor(subprocess: Pick<SubprocessRuntime, 'spawn'>, config: MemoryConfig, endpoint: URL, onFailure: (error: Error) => void) {
    this.process = subprocess.spawn({
      argv: [config.pythonExecutable, '-u', '-c', MEMORY_WORKER_SOURCE],
      cwd: config.serverWorkingDirectory || process.cwd(),
      env: {
        ...config.serverEnvironment,
        VIRTUALLIVE_MEMORY_HOST: endpoint.hostname, VIRTUALLIVE_MEMORY_PORT: endpoint.port || '80',
      },
      graceMs: config.shutdownTimeoutMs, stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
    })
    this.process.stdout?.resume()
    this.process.stderr?.resume()
    this.exited = this.process.done.then((outcome) => {
      if (!this.stopping) onFailure(new Error(`Hindsight server exited with code ${outcome.exitCode} and signal ${outcome.signal}`))
    }, (error: unknown) => { if (!this.stopping) onFailure(new Error('Hindsight server could not run', { cause: error })) })
    this.process.stdin?.on('error', (error) => { if (!this.stopping) onFailure(error) })
  }

  /**
   * Ask Python to finish its API lifespan, then await process exit.
   * @param timeoutMs - Grace period before terminating the owned process tree.
   * @returns After exit; forced teardown is rejected because graceful database cleanup is unconfirmed.
   */
  dispose(timeoutMs: number): Promise<void> {
    this.closing ??= this.stop(timeoutMs)
    return this.closing
  }

  private async stop(timeoutMs: number): Promise<void> {
    this.stopping = true
    this.process.stdin?.end('shutdown\n')
    const graceful = await this.process.waitForExit(AbortSignal.timeout(timeoutMs))
    if (graceful) { await this.exited; return }
    this.process.terminate()
    await this.process.waitForExit()
    await this.exited
    throw new Error('Hindsight server required forced termination; pending memory delivery remains unconfirmed')
  }
}

/** A deployment-selected local inference server; Hindsight closes before this consumer. */
export class ManagedMemoryModel {
  private readonly process: SubprocessHandle
  private readonly settled: Promise<void>
  private stopping = false
  private closing: Promise<void> | undefined

  constructor(subprocess: Pick<SubprocessRuntime, 'spawn'>, config: MemoryConfig, onFailure: (error: Error) => void) {
    this.process = subprocess.spawn({
      argv: [config.localModelExecutable, ...config.localModelArguments],
      cwd: config.localModelWorkingDirectory || process.cwd(), env: config.localModelEnvironment,
      graceMs: config.shutdownTimeoutMs, stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    })
    this.process.stdout?.resume()
    this.process.stderr?.resume()
    this.settled = this.process.done.then((outcome) => {
      if (!this.stopping) onFailure(new Error(`Local memory model exited with code ${outcome.exitCode} and signal ${outcome.signal}`))
    }, (error: unknown) => { if (!this.stopping) onFailure(new Error('Local memory model could not run', { cause: error })) })
  }

  /**
   * Terminate inference after its Hindsight consumer has finished closing.
   * @returns After the managed process range is empty and its outcome has settled.
   */
  dispose(): Promise<void> {
    this.closing ??= this.stop()
    return this.closing
  }

  private async stop(): Promise<void> {
    this.stopping = true
    this.process.terminate()
    await this.process.waitForExit()
    await this.settled
  }
}
