// @vitest-environment jsdom
/** Account controls distinguish installation, phone access, QR progress, and verified API credentials. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ConnectionsBody, type ConnectionsBodyProps } from '../src/client/ConnectionsPage.tsx'
import { connectionsEn } from '../src/client/connections-locales.ts'
import type { ConnectionsState } from '../src/client/ConnectionsController.ts'
import type { PhoneState } from '../src/client/PhoneController.ts'
import type { ConnectionAttemptId } from '../src/connections-types.ts'

afterEach(cleanup)
const dictionary: Readonly<Record<string, string>> = connectionsEn

function fixture(override: Partial<ConnectionsState> = {}, phoneOverride: Partial<PhoneState> = {}, allowed = true) {
  const state: ConnectionsState = {
    snapshot: { storage: 'available', bilibili: { status: 'not-linked', account: null, verifiedAt: null, verifiedUntil: null } },
    loading: false, loadFailed: false, busy: false, login: null, loginStatus: null, notice: null, ...override,
  }
  const phone: PhoneState = {
    snapshot: { status: 'ready', error: null, screen: null, tree: '', treeTruncated: false, observedAt: 1, elapsedMs: 1,
      apps: (['qq', 'wechat', 'bilibili', 'rednote', 'x', 'youtube'] as const).map(id => ({ id, installed: id === 'youtube', login: 'unknown' })),
    }, connection: 'ready', busy: false, unconfirmed: false, ...phoneOverride,
  }
  const props: ConnectionsBodyProps = {
    t: (key, parameters) => (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(parameters?.[name])),
    useConnections: selector => selector(state), usePhone: selector => selector(phone), useRemoteAccess: () => allowed,
    refreshConnections: vi.fn(async () => {}), beginLogin: vi.fn(async () => {}), checkLogin: vi.fn(async () => {}),
    cancelLogin: vi.fn(async () => {}), verifyAccount: vi.fn(async () => {}), disconnectAccount: vi.fn(async () => {}),
    refreshPhone: vi.fn(async () => {}), controlPhone: vi.fn(async () => true), watchPhone: vi.fn(async () => {}), openPhone: vi.fn(),
    openPlugins: vi.fn(), leave: vi.fn(), dismissConnectionNotice: vi.fn(),
  }
  return { state, phone, props, ...render(<ConnectionsBody {...props} />) }
}

describe('app connection settings', () => {
  it('keeps six app login states unverified and routes explicit opening to the real phone', () => {
    const f = fixture()
    expect(screen.getAllByText('Login not verified')).toHaveLength(6)
    expect(screen.getAllByText('App not installed')).toHaveLength(5)
    expect(screen.getByText('Installed on phone')).toBeTruthy()
    expect(screen.getByText(/Android app and separately installed video plugins have their own login/)).toBeTruthy()
    const youtube = screen.getByRole('heading', { name: 'YouTube' }).closest('article')!
    fireEvent.click(within(youtube).getByRole('button', { name: 'Open app on phone' }))
    expect(f.props.leave).toHaveBeenCalledOnce()
    expect(f.props.openPhone).toHaveBeenCalledOnce()
    expect(f.props.controlPhone).toHaveBeenCalledWith({ kind: 'open', app: 'youtube' })
    expect(screen.queryByText('Account verified')).toBeNull()
  })

  it('requires an explicit QR action and an explicit confirmation check', () => {
    const f = fixture()
    fireEvent.click(screen.getByRole('button', { name: 'Link with QR code' }))
    expect(f.props.beginLogin).toHaveBeenCalledOnce()
    expect(f.props.checkLogin).not.toHaveBeenCalled()
    f.state.login = { id: 'attempt' as ConnectionAttemptId, image: 'data:image/png;base64,cXI=', expiresAt: 5000 }
    f.state.loginStatus = 'scanned'
    f.rerender(<ConnectionsBody {...f.props} />)
    expect(screen.getByRole('img', { name: 'Bilibili login QR code' })).toBeTruthy()
    expect(screen.getByText('Scanned · Confirm in Bilibili')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check confirmation' }))
    expect(f.props.checkLogin).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel login' }))
    expect(f.props.cancelLogin).toHaveBeenCalledOnce()
  })

  it('blocks account mutations without credential storage and phone actions without access', () => {
    const f = fixture({ snapshot: { storage: 'unavailable', bilibili: { status: 'not-linked', account: null, verifiedAt: null, verifiedUntil: null } } }, {}, false)
    expect(screen.getByRole('button', { name: 'Link with QR code' }).hasAttribute('disabled')).toBe(true)
    for (const button of screen.getAllByRole('button', { name: 'Open website on phone' })) expect(button.hasAttribute('disabled')).toBe(true)
    expect(screen.getAllByText('Installation not checked')).toHaveLength(6)
    expect(f.props.beginLogin).not.toHaveBeenCalled()
    expect(f.props.controlPhone).not.toHaveBeenCalled()
  })

  it('withdraws expired QR images while retaining the account and phone entries', () => {
    fixture({ loginStatus: 'expired', loadFailed: true })
    expect(screen.queryByRole('img', { name: 'Bilibili login QR code' })).toBeNull()
    expect(screen.getByText(/This QR code expired/)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Refresh status')
    expect(screen.getAllByRole('article')).toHaveLength(6)
  })

  it('opens reviewed WeChat plugin setup without pretending it is already connected', () => {
    const f = fixture()
    expect(screen.getByRole('link', { name: 'Review dsh-wechat on GitHub' }).getAttribute('href')).toBe('https://github.com/pan17/dsh-wechat')
    fireEvent.click(screen.getByRole('button', { name: 'Open Plugins' }))
    expect(f.props.openPlugins).toHaveBeenCalledOnce()
    expect(f.props.controlPhone).not.toHaveBeenCalled()
    expect(screen.getByText(/separate from the resident’s Android WeChat app/)).toBeTruthy()
  })
})
