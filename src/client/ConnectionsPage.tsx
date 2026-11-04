/** Account setup renders confirmed Host facts and explicit user gestures. */
import type { ReactNode } from 'react'
import { Button, IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PhoneAppId } from '../phone-types.ts'
import type { ConnectionFailure } from '../connections-types.ts'
import type { ConnectionsFace } from './ConnectionsController.ts'
import type { PhoneFace } from './PhoneController.ts'
import type { ConnectionsLocaleKey } from './connections-locales.ts'
import css from './ConnectionsPage.module.css'

/** Data and navigation supplied by the registration owner. */
export type ConnectionsPageFace = ConnectionsFace & PhoneFace & {
  openPhone: () => void
  openPlugins: (() => void) | null
}

/** Shared presentation receives only the global access hook it actually reads. */
export type ConnectionsBodyProps = PropsLocale<'virtualLiveConnections'> & InjectFace<ConnectionsPageFace> & Pick<PropsRuntime<'main'>, 'useRemoteAccess'> & { leave: () => void }

/** The same account content fits the Settings shell without adding another modal. */
export type ConnectionsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'virtualLiveConnections'> & InjectFace<ConnectionsPageFace>

/** The direct page shares the controller with Settings and keeps a route back to the room. */
export type ConnectionsMainProps = PropsRuntime<'main'> & PropsLocale<'virtualLiveConnections'> & InjectFace<ConnectionsPageFace> & { back: () => void }

const apps: readonly { id: PhoneAppId; url: string }[] = [
  { id: 'qq', url: 'https://im.qq.com/' }, { id: 'wechat', url: 'https://weixin.qq.com/' },
  { id: 'bilibili', url: 'https://www.bilibili.com/' }, { id: 'rednote', url: 'https://www.xiaohongshu.com/' },
  { id: 'x', url: 'https://x.com/' }, { id: 'youtube', url: 'https://www.youtube.com/' },
]

/**
 * Render the registered Settings section.
 * @param props - Host state, localization, authorized operations, and Settings close action.
 * @returns The app account setup page.
 */
export function ConnectionsSection(props: ConnectionsSectionProps): ReactNode {
  return <ConnectionsBody {...props} leave={props.close} />
}

/**
 * Render the directly navigable connection page.
 * @param props - Shared account state and room navigation.
 * @returns Page content within the main panel's scrolling surface.
 */
export function ConnectionsMain(props: ConnectionsMainProps): ReactNode {
  return <div className={css.main}><Button onClick={props.back}>{props.t('back')}</Button><ConnectionsBody {...props} leave={() => {}} /></div>
}

/**
 * Render app access and account setup without subscribing outside the injected hooks.
 * @param props - Account and phone facts, permission checks, and user actions.
 * @returns The same account controls in Settings and in the resident's direct page.
 */
export function ConnectionsBody({
  t, useConnections, usePhone, useRemoteAccess, refreshConnections, refreshPhone, controlPhone,
  beginLogin, checkLogin, cancelLogin, verifyAccount, disconnectAccount, openPhone, openPlugins, leave,
}: ConnectionsBodyProps): ReactNode {
  const state = useConnections(value => value)
  const phone = usePhone(value => value)
  const observe = useRemoteAccess('virtualLivePhone/observe')
  const follow = useRemoteAccess('virtualLivePhone/follow')
  const control = useRemoteAccess('virtualLivePhone/action')
  const canBegin = useRemoteAccess('virtualLiveConnections/beginBilibiliLogin')
  const canCheck = useRemoteAccess('virtualLiveConnections/checkBilibiliLogin')
  const canCancel = useRemoteAccess('virtualLiveConnections/cancelBilibiliLogin')
  const canVerify = useRemoteAccess('virtualLiveConnections/verifyBilibili')
  const canDisconnect = useRemoteAccess('virtualLiveConnections/disconnectBilibili')
  const ready = follow && phone.connection === 'ready' && phone.snapshot?.status === 'ready' && !phone.unconfirmed
  const account = state.snapshot?.bilibili
  const writable = state.snapshot?.storage === 'available'
  const linked = account !== undefined && account.status !== 'not-linked'
  const phoneAction = (app?: PhoneAppId): void => {
    leave()
    openPhone()
    if (app !== undefined) void controlPhone({ kind: 'open', app })
  }
  return <section className={css.section}>
    <header className={css.header}><div><h1>{t('title')}</h1><p>{t('intro')}</p></div><div className={css.actions}>
      <Button onClick={() => { phoneAction() }}>{t('phone')}</Button>
      <Button disabled={state.busy || phone.busy} onClick={() => { void refreshConnections(); if (follow && observe) void refreshPhone() }}>{t('refresh')}</Button>
    </div></header>
    {state.loading && <div className={css.loading}><span className={css.spinner} role="status" aria-label={t('loading')} /></div>}
    {state.loadFailed && <p className={css.notice} role="alert">{t('loadFailed')}</p>}
    <section className={css.group}>
      <h2>{t('phoneTitle')}</h2><p>{t('phoneHint')}</p>
      {!ready && <p className={css.notice}>{t('phoneUnavailable')}</p>}
      <div className={css.apps}>{apps.map((app) => {
        const installed = follow ? phone.snapshot?.apps.find(value => value.id === app.id)?.installed : undefined
        return <article key={app.id} className={css.card}>
          <div className={css.cardHead}><h3>{t(app.id)}</h3><span className={css.tag}>{t(installed === undefined ? 'unknown' : installed ? 'installed' : 'notInstalled')}</span></div>
          <p className={css.accountStatus}>{t('loginUnknown')}</p><p>{t(`${app.id}Hint`)}</p>
          <div className={css.actions}><Button variant="outline" disabled={!ready || !control || phone.busy} onClick={() => { phoneAction(app.id) }}>{t(installed ? 'openApp' : 'openWebsite')}</Button><a href={app.url} target="_blank" rel="noopener noreferrer">{t('officialWebsite')}</a></div>
        </article>
      })}</div>
    </section>
    <section className={css.group}>
      <h2>{t('apiTitle')}</h2><p>{t('apiHint')}</p>
      <p className={css.accountStatus} role="status">{t(account === undefined ? 'notChecked' : account.status === 'not-linked' ? 'notLinked' : account.status)}</p>
      {account?.account && <p>{t('account', { name: account.account.name, id: account.account.id })}</p>}
      {state.snapshot?.storage === 'unavailable' && <p className={css.notice}>{t('noStorage')}</p>}
      {state.snapshot?.storage === 'read-only' && <p className={css.notice}>{t('readOnly')}</p>}
      <div className={css.actions}>
        <Button variant="primary" disabled={!writable || state.busy || !canBegin} onClick={() => { void beginLogin() }}>{t(linked ? 'relink' : 'begin')}</Button>
        {linked && <><Button disabled={state.busy || !canVerify} onClick={() => { void verifyAccount() }}>{t('verify')}</Button><Button disabled={!writable || state.busy || !canDisconnect} onClick={() => { void disconnectAccount() }}>{t('disconnect')}</Button></>}
      </div>
      {state.login !== null && <div className={css.qr}>
        <img src={state.login.image} alt={t('qrAlt')} />
        <div><p>{t('qrHint')}</p><p role="status">{t(state.busy ? 'checking' : state.loginStatus === 'scanned' ? 'scanned' : 'waiting')}</p><div className={css.actions}>
          <Button variant="primary" disabled={state.busy || !canCheck} onClick={() => { void checkLogin() }}>{t('check')}</Button>
          <Button disabled={state.busy || !canCancel} onClick={() => { void cancelLogin() }}>{t('cancel')}</Button>
        </div></div>
      </div>}
      {state.loginStatus === 'expired' && <p className={css.notice} role="status">{t('qrExpired')}</p>}
      <p>{t('readOnlyHint')}</p><a href="https://github.com/CZX2244/dsh-bilibili/blob/main/lib/login.js" target="_blank" rel="noopener noreferrer">{t('biliSource')}</a>
    </section>
    <section className={css.group}>
      <h2>{t('bridgeTitle')}</h2><p>{t('bridgeHint')}</p><div className={css.actions}>
        {openPlugins !== null && <Button variant="outline" onClick={() => { leave(); openPlugins() }}>{t('plugins')}</Button>}
        <a href="https://github.com/pan17/dsh-wechat" target="_blank" rel="noopener noreferrer">{t('bridgeSource')}</a>
      </div>
    </section>
  </section>
}

const failures: Record<ConnectionFailure, ConnectionsLocaleKey> = {
  unavailable: 'errorUnavailable', network: 'errorNetwork', rejected: 'errorRejected', 'invalid-response': 'errorResponse',
  'invalid-attempt': 'errorAttempt', expired: 'errorAttempt', storage: 'errorStorage', cancelled: 'errorCancelled',
}

/**
 * Keep account-operation feedback alive when Settings closes or the main panel changes.
 * @param props - Shared notification state and acknowledgement.
 * @returns A shell-level toast for the latest completed operation.
 */
export function ConnectionsToast({ t, useConnections, dismissConnectionNotice }: PropsLocale<'virtualLiveConnections'> & InjectFace<ConnectionsFace>): ReactNode {
  const notice = useConnections(state => state.notice)
  if (notice === null) return null
  return <Toast key={notice.id} text={t(notice.kind === 'failed' ? failures[notice.reason ?? 'network'] : notice.kind)}
    {...(notice.kind === 'failed' ? { icon: <IconWarningOutlineRegular /> } : { tone: 'success' as const })} onDone={dismissConnectionNotice} />
}
