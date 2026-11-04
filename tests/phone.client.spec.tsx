// @vitest-environment jsdom
/** Phone controls retain uncertain results and map rendered gestures to Android pixels. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Phone, type PhoneProps } from '../src/client/Phone.tsx'
import { phoneEn } from '../src/client/phone-locales.ts'
import type { PhoneState } from '../src/client/PhoneController.ts'
import type { PhoneSnapshot } from '../src/phone-types.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const snapshot: PhoneSnapshot = {
  status: 'ready', error: null,
  screen: { mediaType: 'image/jpeg', data: 'aW1hZ2U=', width: 360, height: 640, deviceWidth: 720, deviceHeight: 1280 },
  tree: '{}', treeTruncated: false, observedAt: 1, elapsedMs: 123,
  apps: (['qq', 'wechat', 'bilibili', 'rednote', 'x', 'youtube'] as const).map(id => ({ id, installed: id === 'youtube', login: 'unknown' })),
}

function fixture(override: Partial<PhoneState> = {}) {
  const state: PhoneState = { snapshot, busy: false, connection: 'ready', unconfirmed: false, ...override }
  const controlPhone = vi.fn<PhoneProps['controlPhone']>().mockResolvedValue(true)
  const refreshPhone = vi.fn<PhoneProps['refreshPhone']>().mockResolvedValue()
  const props: PhoneProps = {
    name: 'Wren', usePhone: selector => selector(state), controlPhone, refreshPhone, canFollow: true, canObserve: true, canControl: true,
    t: (key, parameters) => phoneEn[key].replace(/\{(\w+)\}/g, (_match, name: string) => String(parameters?.[name])),
  }
  const view = render(<Phone {...props} />)
  return { ...view, props, state, controlPhone, refreshPhone }
}

describe('dedicated phone card', () => {
  it('does not claim that the phone is connected before its first observation', () => {
    fixture({ snapshot: null, connection: 'loading' })
    expect(screen.getByText('Reading the phone screen')).toBeTruthy()
    expect(screen.queryByText('Dedicated Android phone connected')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the resident name and real installation while keeping login explicitly unverified', () => {
    const f = fixture()
    expect(screen.getByRole('heading', { name: 'Wren’s phone' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Actual dedicated phone display' })).toBeTruthy()
    expect(screen.getAllByText('Not installed · Official website')).toHaveLength(5)
    expect(screen.getByText('Open app')).toBeTruthy()
    expect(screen.getByText(/Account access is unverified/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Bilibili/ }))
    expect(f.controlPhone).toHaveBeenCalledExactlyOnceWith({ kind: 'open', app: 'bilibili' })
  })

  it('retains a previous screen during uncertain input and offers only inspection', () => {
    const f = fixture({ snapshot: { ...snapshot, status: 'uncertain', error: 'timeout' } })
    expect(screen.getByRole('img', { name: 'Actual dedicated phone display' })).toBeTruthy()
    expect(screen.getByText(/last input outcome is unknown/)).toBeTruthy()
    for (const name of ['Back', 'Home', 'Enter', /Bilibili/]) expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh screen' }))
    expect(f.refreshPhone).toHaveBeenCalledOnce()
    expect(f.controlPhone).not.toHaveBeenCalled()
  })

  it('keeps unconfirmed text and clears it only after the focused-field input succeeds', async () => {
    const f = fixture()
    f.controlPhone.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const text = screen.getByRole('textbox', { name: 'Type on phone' })
    fireEvent.change(text, { target: { value: '你好，Wren' } })
    fireEvent.click(screen.getByRole('button', { name: 'Type text' }))
    await waitFor(() => { expect(f.controlPhone).toHaveBeenCalledOnce() })
    expect((text as HTMLTextAreaElement).value).toBe('你好，Wren')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Replace the focused field’s text' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Type text' })) })
    expect(f.controlPhone).toHaveBeenLastCalledWith({ kind: 'type', text: '你好，Wren', clear: true })
    expect((text as HTMLTextAreaElement).value).toBe('')
  })

  it('does not display an invented device when the deployment has no phone', () => {
    fixture({ snapshot: { ...snapshot, status: 'unconfigured', screen: null, apps: [], error: 'not-configured' } })
    expect(screen.getByText('The dedicated phone is not configured')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Connect phone' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps authorized viewing separate from device input and manual capture permissions', () => {
    const f = fixture()
    f.rerender(<Phone {...f.props} canControl={false} canObserve={false} />)
    expect(screen.getByRole('img', { name: 'Actual dedicated phone display' })).toBeTruthy()
    expect(screen.getByText(/Operating it requires additional access/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Home' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Refresh screen' }).hasAttribute('disabled')).toBe(true)
    f.rerender(<Phone {...f.props} canFollow={false} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: /Bilibili/ })).toBeNull()
    expect(screen.getByText('Viewing the phone requires additional access')).toBeTruthy()
  })

  it('converts tap and swipe positions from the displayed screen into original Android pixels', () => {
    const f = fixture()
    const touchscreen = screen.getByRole('button', { name: 'Phone touch screen; tap or drag to swipe' })
    vi.spyOn(touchscreen, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 180, height: 320, right: 190, bottom: 340, x: 10, y: 20, toJSON() {} })
    Object.defineProperty(touchscreen, 'setPointerCapture', { value: vi.fn() })
    const pointer = (type: string, x: number, y: number, time: number): void => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, timeStamp: { value: time }, pointerId: { value: 1 } })
      fireEvent(touchscreen, event)
    }
    pointer('pointerdown', 100, 180, 0)
    pointer('pointerup', 100, 180, 10)
    expect(f.controlPhone).toHaveBeenLastCalledWith({ kind: 'tap', x: 360, y: 640 })
    pointer('pointerdown', 20, 30, 100)
    pointer('pointerup', 180, 300, 300)
    expect(f.controlPhone).toHaveBeenLastCalledWith({ kind: 'swipe', x1: 40, y1: 40, x2: 680, y2: 1120, durationMs: 200 })
  })
})
