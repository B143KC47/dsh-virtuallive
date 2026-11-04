/** Actual Android display, account entrypoints, and explicit user controls. */
import { useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { PhoneFace } from './PhoneController.ts'
import type { PhoneLocaleKey } from './phone-locales.ts'
import type { PhoneAction } from '../phone-types.ts'
import css from './Phone.module.css'

/** Phone controls consume Host state and the resident's current self-chosen name. */
export type PhoneProps = Omit<InjectFace<PhoneFace>, 'watchPhone'> & {
  name: string | undefined
  t: Translate<PhoneLocaleKey>
  canFollow: boolean
  canObserve: boolean
  canControl: boolean
  /** The page supplies the resident heading when the controls occupy a dedicated view. */
  headingVisible?: boolean
}

/**
 * Show the captured device and retain text drafts until input is confirmed.
 * @param props - Injected device observations, controls, localization, and current resident name.
 * @returns Accessible touch display with system controls and six application shortcuts.
 */
export function Phone({
  usePhone, refreshPhone, controlPhone, name, t, canFollow, canObserve, canControl, headingVisible = true,
}: PhoneProps): ReactNode {
  const state = usePhone(value => value)
  const snapshot = state.snapshot
  const screen = canFollow ? snapshot?.screen : null
  const [draft, setDraft] = useState('')
  const [address, setAddress] = useState('')
  const [clear, setClear] = useState(false)
  const inputId = useId()
  const addressId = useId()
  const pointer = useRef<{ x: number; y: number; time: number; pointerId: number } | null>(null)
  const ready = canFollow && snapshot?.status === 'ready' && state.connection === 'ready' && !state.unconfirmed
  const disabled = state.busy || !ready || !canControl
  const status = !canFollow ? 'phone.accessDenied' : state.unconfirmed ? 'phone.transport' : snapshot?.status === 'uncertain' ? 'phone.uncertain' : state.connection === 'failed' || snapshot?.status === 'failed' ? 'phone.failed' : state.connection === 'loading' || snapshot === null ? 'phone.loading' : snapshot.status === 'unconfigured' ? 'phone.unconfigured' : 'phone.ready'
  const submit = async (action: PhoneAction): Promise<void> => {
    if (await controlPhone(action) && action.kind === 'type') setDraft(value => value === action.text ? '' : value)
  }
  return <section className={css.card}>
    <header className={css.header}>{headingVisible && <h2>{name ? t('phone.title', { name }) : t('phone.unnamed')}</h2>}<Button disabled={!canFollow || !canObserve || state.busy || snapshot?.status === 'unconfigured'} onClick={() => { void refreshPhone() }}>{t(snapshot?.screen ? 'phone.refresh' : 'phone.connect')}</Button></header>
    <p className={css.status} role="status">{canFollow && state.busy && !screen ? t('phone.loading') : t(status)}</p>
    {screen && <>
      <div className={css.display}>
        <button type="button" className={css.touchscreen} disabled={disabled} aria-label={t('phone.control')}
          onPointerDown={(event) => {
            if (disabled) return
            const rect = event.currentTarget.getBoundingClientRect()
            pointer.current = {
              x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height,
              time: event.timeStamp, pointerId: event.pointerId,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerCancel={() => { pointer.current = null }}
          onPointerUp={(event) => {
            const start = pointer.current
            pointer.current = null
            if (start === null || start.pointerId !== event.pointerId || disabled) return
            const rect = event.currentTarget.getBoundingClientRect()
            const x = Math.max(0, Math.min(screen.deviceWidth - 1,
              Math.round((event.clientX - rect.left) / rect.width * screen.deviceWidth)))
            const y = Math.max(0, Math.min(screen.deviceHeight - 1,
              Math.round((event.clientY - rect.top) / rect.height * screen.deviceHeight)))
            const x1 = Math.max(0, Math.min(screen.deviceWidth - 1, Math.round(start.x * screen.deviceWidth)))
            const y1 = Math.max(0, Math.min(screen.deviceHeight - 1, Math.round(start.y * screen.deviceHeight)))
            if (Math.hypot((event.clientX - rect.left) - start.x * rect.width, (event.clientY - rect.top) - start.y * rect.height) < 10) void submit({ kind: 'tap', x, y })
            else void submit({ kind: 'swipe', x1, y1, x2: x, y2: y, durationMs: Math.max(100, Math.min(3000, Math.round(event.timeStamp - start.time))) })
          }}>
          <img src={`data:${screen.mediaType};base64,${screen.data}`} alt={t('phone.screen')} draggable={false} />
        </button>
        {state.busy && <span className={css.spinner} role="status" aria-label={t('phone.loading')} />}
      </div>
      <p>{t('phone.hint')}</p>
      <div className={css.buttons}>{(['back', 'home', 'enter'] as const).map(button => <Button key={button} disabled={disabled} onClick={() => { void submit({ kind: 'button', button }) }}>{t(`phone.${button}`)}</Button>)}</div>
    </>}
    {canFollow && snapshot?.apps.length !== 0 && <div className={css.apps}>{snapshot?.apps.map(app => <Button key={app.id} disabled={disabled} onClick={() => { void submit({ kind: 'open', app: app.id }) }}><span>{t(`phone.${app.id}`)}</span><small>{t(app.installed ? 'phone.native' : 'phone.web')}</small></Button>)}</div>}
    {canFollow && !canControl && <p>{t('phone.readOnly')}</p>}
    {canFollow && !canObserve && <p>{t('phone.refreshDenied')}</p>}
    <p>{t('phone.accounts')}</p>
    {screen && <>
      <form className={css.form} onSubmit={(event) => { event.preventDefault(); if (draft && !disabled) void submit({ kind: 'type', text: draft, clear }) }}>
        <label htmlFor={inputId}>{t('phone.text')}</label>
        <textarea id={inputId} value={draft} rows={2} readOnly={!canControl} placeholder={t('phone.textPlaceholder')} onChange={(event) => { setDraft(event.target.value) }} />
        <div className={css.inputActions}><label><input type="checkbox" checked={clear} disabled={!canControl} onChange={(event) => { setClear(event.target.checked) }} />{t('phone.clear')}</label><Button type="submit" disabled={disabled || !draft}>{t('phone.type')}</Button></div>
      </form>
      <form className={css.form} onSubmit={(event) => { event.preventDefault(); if (address && !disabled) void submit({ kind: 'url', url: address }) }}><label htmlFor={addressId}>{t('phone.address')}</label><div className={css.address}><input id={addressId} type="url" value={address} readOnly={!canControl} placeholder={t('phone.addressPlaceholder')} onChange={(event) => { setAddress(event.target.value) }} /><Button type="submit" disabled={disabled || !address}>{t('phone.openAddress')}</Button></div></form>
    </>}
    {snapshot?.elapsedMs !== null && snapshot?.elapsedMs !== undefined && <p>{t('phone.observed', { ms: String(snapshot.elapsedMs) })}</p>}
  </section>
}
