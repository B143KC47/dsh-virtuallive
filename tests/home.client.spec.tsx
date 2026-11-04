// @vitest-environment jsdom
/** Home distinguishes admission from a failed turn and always offers its durable conversation. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { Home, type HomeProps } from '../src/client/Home.tsx'
import type {} from '../src/client/index.ts'
import type { HomeState } from '../src/client/controller.ts'
import { en } from '../src/client/locales.ts'
import { HOME_SPACE, initialHomeLayout } from '../src/home-space.ts'
import type { ResidentState } from '../src/types.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const useSessions: GlobalStandardProps['useSessions'] = selector => selector({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
const useWorkspaces: GlobalStandardProps['useWorkspaces'] = selector => selector({
  items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

function initialResidentState(): ResidentState {
  return {
    identity: null,
    expression: { activity: 'idle', mood: 'curious', outfit: 'classic', intention: '' },
    lastSpoken: null,
    journey: { path: [{ ...HOME_SPACE.places.center }], startedAt: 0, speed: 1 },
    home: initialHomeLayout(),
    homeRevision: 0,
    interaction: null,
    turn: null,
  }
}

vi.mock('../src/client/Room.tsx', () => ({ Room: () => null }))
afterEach(cleanup)
const dictionary: Readonly<Record<string, string>> = en

it('keeps unnamed history accessible and replaces delivered copy with the terminal failure', () => {
  const state: HomeState = {
    snapshot: {
      sessionId: SessionId('home-failure'), phase: 'failed',
      state: { ...initialResidentState(), turn: { number: 1, outcome: 'error' } },
      memory: { engine: 'hindsight', bankId: '', phase: 'disabled', pending: 0, retained: 0, lastRetainedAt: null },
    },
    connection: 'ready', sending: false, submission: 'accepted', arranging: false, arrangementError: 'none',
    openingConversation: false, conversationError: false,
  }
  const props: HomeProps = {
    t: (key, parameters) => (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(parameters?.[name])),
    useResident: selector => selector(state), useRemoteAccess: () => true,
    send: vi.fn(async () => true), arrange: vi.fn(async () => true), reconnect: vi.fn(),
    openConversation: vi.fn(async () => {}), openPhone: vi.fn(), openConnections: vi.fn(),
    usePanelInfo, useSessions, useSessionStatus, useSessionRetainInfo: () => undefined, useResource, useWorkspaces,
    useSessionAccess: () => true, useWorkspaceAccess: () => true,
    pixelRatioLimit: 1, maximumFrameRate: 60,
  }
  const view = render(<Home {...props} />)
  expect(screen.getByRole('alert').textContent).toBe(en.turnFailed)
  expect(screen.getByText(en.turnAttention)).toBeTruthy()
  expect(screen.queryByText(en.accepted)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.conversation }))
  expect(props.openConversation).toHaveBeenCalledOnce()
  if (state.snapshot === null) throw new Error('Fixture resident is missing')
  state.snapshot.phase = 'running'
  state.snapshot.state.turn = { number: 2, outcome: 'running' }
  view.rerender(<Home {...props} />)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: en.conversation })).toBeTruthy()
})
