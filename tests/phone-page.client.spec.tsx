// @vitest-environment jsdom
/** Only an authorized mounted phone page owns an automatic capture view. */
import { cleanup, render, screen } from '@testing-library/react'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { PhonePage, type PhonePageProps } from '../src/client/PhonePage.tsx'
import { Config } from '../src/client/index.ts'
import type { HomeState } from '../src/client/controller.ts'
import type { PhoneFace, PhoneState } from '../src/client/PhoneController.ts'
import { en } from '../src/client/locales.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const useSessions: GlobalStandardProps['useSessions'] = selector => selector({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
const useWorkspaces: GlobalStandardProps['useWorkspaces'] = selector => selector({
  items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())
const renderLimits = { pixelRatioLimit: 2, maximumFrameRate: 60 }

const dictionary: Readonly<Record<string, string>> = en

it('bounds the deployment capture delay and supplies the default', () => {
  expect(Config().phoneRefreshIntervalMs).toBe(3000)
  for (const phoneRefreshIntervalMs of [0, 249, 3000.5, 60001]) {
    expect(() => Config({ ...renderLimits, phoneRefreshIntervalMs })).toThrow()
  }
  expect(Config({ ...renderLimits, phoneRefreshIntervalMs: 5000 }).phoneRefreshIntervalMs).toBe(5000)
})

function fixture() {
  const resident: HomeState = {
    snapshot: null, connection: 'loading', sending: false, submission: 'none', arranging: false,
    arrangementError: 'none', openingConversation: false, conversationError: false,
  }
  const phone: PhoneState = { snapshot: null, connection: 'loading', busy: false, unconfirmed: false }
  const signals: AbortSignal[] = []
  const watching: Promise<void>[] = []
  onTestFinished(async () => { cleanup(); await Promise.all(watching) })
  const props: PhonePageProps = {
    t: (key, parameters) => (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(parameters?.[name])),
    useResident: selector => selector(resident), usePhone: selector => selector(phone), useRemoteAccess: () => true,
    send: vi.fn(async () => true), arrange: vi.fn(async () => true), reconnect: vi.fn(),
    openConversation: vi.fn(async () => {}), openHome: vi.fn(), openConnections: vi.fn(),
    refreshPhone: vi.fn(async () => {}), controlPhone: vi.fn(async () => true),
    usePanelInfo, useSessions, useSessionStatus, useSessionRetainInfo: () => undefined, useResource, useWorkspaces,
    useSessionAccess: () => true, useWorkspaceAccess: () => true,
    watchPhone: vi.fn<PhoneFace['watchPhone']>((signal) => {
      signals.push(signal)
      const completion = new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      watching.push(completion)
      return completion
    }),
  }
  return { props, signals, watching }
}

it('starts one view while mounted and releases it on unmount', async () => {
  const f = fixture()
  const page = render(<PhonePage {...f.props} />)
  expect(f.props.watchPhone).toHaveBeenCalledOnce()
  expect(screen.getByText(en['phone.automatic'])).toBeTruthy()
  page.rerender(<PhonePage {...f.props} />)
  expect(f.props.watchPhone).toHaveBeenCalledOnce()
  page.unmount()
  expect(f.signals[0]?.aborted).toBe(true)
  await Promise.all(f.watching)
})

it('requires both phone viewing and observation permission and releases a revoked view', async () => {
  const f = fixture()
  const denied: PhonePageProps['useRemoteAccess'] = method => method !== 'virtualLivePhone/observe'
  const page = render(<PhonePage {...f.props} useRemoteAccess={denied} />)
  expect(f.props.watchPhone).not.toHaveBeenCalled()
  page.rerender(<PhonePage {...f.props} />)
  expect(f.props.watchPhone).toHaveBeenCalledOnce()
  page.rerender(<PhonePage {...f.props} useRemoteAccess={method => method !== 'virtualLivePhone/follow'} />)
  expect(f.signals[0]?.aborted).toBe(true)
  expect(screen.queryByText(en['phone.automatic'])).toBeNull()
  await Promise.all(f.watching)
  page.unmount()
})
