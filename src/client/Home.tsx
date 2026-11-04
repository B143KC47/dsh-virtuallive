/** Resident home; all business state arrives through injected observations. */
import { useCallback, useId, useState, type ReactNode } from 'react'
import { Button, IconUserOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HomeFace } from './controller.ts'
import character from './assets/resident-idle-v1.png'
import { Room } from './Room.tsx'
import { HomeLayers } from './HomeLayers.tsx'
import { MemoryCard } from './MemoryCard.tsx'
import css from './Home.module.css'

/** Main-slot properties with host-owned observations and conversation navigation. */
export type HomeProps = PropsRuntime<'main'> & PropsLocale<'virtualLive'> & InjectFace<HomeFace> & {
  openPhone: () => void
  openConnections: () => void
  pixelRatioLimit: number
  maximumFrameRate: number
}

/**
 * Render the resident's home and a message composer that retains unconfirmed drafts.
 * @param props - Slot-owned localization, state, and actions.
 * @returns Responsive home panel.
 */
export function Home({
  t, useResident, useRemoteAccess, send, arrange, reconnect, openConversation, openPhone, openConnections,
  pixelRatioLimit, maximumFrameRate,
}: HomeProps): ReactNode {
  const state = useResident(value => value)
  const canSpeak = useRemoteAccess('virtualLive/speak')
  const canArrange = useRemoteAccess('virtualLive/arrange')
  const canFollowPhone = useRemoteAccess('virtualLivePhone/follow')
  const canOpenConnections = useRemoteAccess('virtualLiveConnections/status')
  const canOpenConversation = useRemoteAccess('virtualLive/snapshot')
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const focusHeading = useCallback((node: HTMLHeadingElement | null) => { node?.focus({ preventScroll: true }) }, [])
  const snapshot = state.snapshot
  const identity = snapshot?.state.identity
  const connected = state.connection === 'ready'
  const outcome = snapshot?.state.turn?.outcome
  const notice = outcome === 'error' ? 'turnFailed' : outcome === 'interrupted' ? 'turnInterrupted'
    : outcome === 'blocked' ? 'turnBlocked' : outcome === 'max-tokens' ? 'turnLimited'
      : outcome === 'aborted' || outcome === 'forked' || outcome === 'other' ? 'turnStopped' : null
  const needsAttention = snapshot?.phase !== 'running' && notice !== null
  const busy = state.sending || !connected || !canSpeak
  const submit = async (text: string): Promise<void> => {
    if (await send(text)) setDraft(current => current === text ? '' : current)
  }
  return <section className={css.page} data-virtual-live-view="home">
    <header className={css.header}>
      <div><p className={css.eyebrow}>{t('brand')}</p><h1 ref={focusHeading} tabIndex={-1}>{identity ? t('title', { name: identity.name }) : t('unnamed')}</h1><p>{t('intro')}</p></div>
      <div className={css.presence}><StateDot state={connected ? snapshot?.phase === 'running' ? 'ongoing' : needsAttention ? 'error' : 'done' : 'idle'} />{snapshot?.phase === 'running' ? t('thinking') : needsAttention ? t('turnAttention') : t('quiet')}</div>
    </header>
    {state.connection !== 'ready' && <div className={css.notice} role="status">
      {state.connection === 'loading' ? <span className={css.spinner} aria-label={t('reconnecting')} /> : <><span>{t(state.connection === 'failed' ? 'failed' : 'reconnecting')}</span>{state.connection === 'failed' && <Button onClick={reconnect}>{t('retry')}</Button>}</>}
    </div>}
    <div className={css.layout}>
      <div className={css.living}>
        {snapshot && <Room state={snapshot.state} speaking={snapshot.phase === 'running'} disabled={busy} t={t} pixelRatioLimit={pixelRatioLimit} maximumFrameRate={maximumFrameRate} onPhoneOpen={canFollowPhone ? openPhone : undefined} onDestination={(point) => { void submit(t('walkSuggestion', { x: String(point.x), z: String(point.z) })) }} />}
        {snapshot && <HomeLayers layout={snapshot.state.home} revision={snapshot.state.homeRevision} disabled={!canArrange || !connected || state.arranging || state.arrangementError === 'unconfirmed'} error={state.arrangementError} arrange={arrange} reconnect={reconnect} t={t} />}
        {!canArrange && <p className={css.accessNotice}>{t('arrangementReadOnly')}</p>}
        <div className={css.dialogue} aria-live="polite">
          <img className={css.portrait} src={character} alt={t('character')} />
          {identity ? <p>{snapshot.state.lastSpoken ?? identity.reason}</p> : <><h2>{t('welcome')}</h2><p>{t('invitation')}</p><Button disabled={busy || snapshot?.phase === 'running'} onClick={() => { void submit(t('hello')) }}>{t('meet')}</Button></>}
          {needsAttention && <p className={css.notice} role="alert">{t(notice)}</p>}
          <Button variant="ghost" disabled={!canOpenConversation || state.openingConversation} onClick={() => { void openConversation() }}>{t('conversation')}</Button>
          {state.conversationError && <p role="status">{t('conversationFailed')}</p>}
        </div>
        <form className={css.composer} onSubmit={(event) => { event.preventDefault(); if (draft.trim() && !busy) void submit(draft) }}>
          <label htmlFor={inputId}>{t('message')}</label>
          <div className={css.inputRow}><textarea id={inputId} rows={2} value={draft} disabled={!canSpeak} placeholder={t('placeholder')} onChange={(event) => { setDraft(event.target.value) }} /><Button type="submit" variant="primary" disabled={busy || !draft.trim()}>{t('send')}</Button></div>
          {!canSpeak && <p>{t('conversationReadOnly')}</p>}
          {state.submission !== 'none' && !(state.submission === 'accepted' && needsAttention) && <p role="status">{t(state.submission === 'accepted' ? 'accepted' : 'unconfirmed')}</p>}
        </form>
      </div>
      <aside className={css.details}>
        {identity && <><section className={css.card}><h2>{t('reason')}</h2><p>{identity.reason}</p></section><section className={css.card}><h2>{t('values')}</h2><ul>{identity.values.map(value => <li key={value}>{value}</li>)}</ul></section></>}
        {snapshot?.state.expression.intention && <section className={css.card}><h2>{t('intention')}</h2><p>{snapshot.state.expression.intention}</p></section>}
        <section className={css.card}><h2>{identity ? t('phone.title', { name: identity.name }) : t('phone.unnamed')}</h2><p>{t('phone.entryHint')}</p><div className={css.layerActions}><Button disabled={!canFollowPhone} onClick={openPhone}>{t('phone.open')}</Button><Button variant="ghost" disabled={!canOpenConnections} onClick={openConnections}>{t('phone.connections')}</Button></div>{!canFollowPhone && <p>{t('phone.accessDenied')}</p>}</section>
        {snapshot && <MemoryCard memory={snapshot.memory} t={t} />}
      </aside>
    </div>
  </section>
}

/**
 * Use the shared resident icon in the sidebar's own navigation button.
 * @param props - Sidebar-owned icon dimensions.
 * @returns Existing library glyph.
 */
export function HomeIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <IconUserOutlineRegular size={size} />
}
