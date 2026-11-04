/** Dedicated phone navigation keeps the resident's home separate from device controls. */
import { useCallback, useEffect, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HomeFace } from './controller.ts'
import type { PhoneFace } from './PhoneController.ts'
import { Phone } from './Phone.tsx'
import css from './Home.module.css'

/** Phone page observations and navigation supplied by its main-slot registration. */
export type PhonePageProps = PropsRuntime<'main'> & PropsLocale<'virtualLive'> & InjectFace<HomeFace & PhoneFace> & {
  openHome: () => void
  openConnections: () => void
}

/**
 * Open the named resident's actual phone with a direct return to her home.
 * @param props - Phone permissions, observations, actions, and home navigation.
 * @returns A responsive phone page; focus enters its heading without opening a keyboard.
 */
export function PhonePage({
  useResident, usePhone, useRemoteAccess, refreshPhone, controlPhone, watchPhone, openHome, openConnections, t,
}: PhonePageProps): ReactNode {
  const name = useResident(value => value.snapshot?.state.identity?.name)
  const canFollow = useRemoteAccess('virtualLivePhone/follow')
  const canObserve = useRemoteAccess('virtualLivePhone/observe')
  const canControl = useRemoteAccess('virtualLivePhone/action')
  const canOpenConnections = useRemoteAccess('virtualLiveConnections/status')
  const focusHeading = useCallback((node: HTMLHeadingElement | null) => { node?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    if (!canFollow || !canObserve) return
    const lifetime = new AbortController()
    void watchPhone(lifetime.signal)
    return () => { lifetime.abort() }
  }, [canFollow, canObserve, watchPhone])
  return <section className={css.page} data-virtual-live-view="phone">
    <header className={css.phoneHeader}>
      <Button variant="ghost" onClick={openHome}>{t('phone.returnHome')}</Button>
      <h1 ref={focusHeading} tabIndex={-1}>{name ? t('phone.title', { name }) : t('phone.unnamed')}</h1>
      <Button variant="ghost" disabled={!canOpenConnections} onClick={openConnections}>{t('phone.connections')}</Button>
    </header>
    {canFollow && canObserve && <p>{t('phone.automatic')}</p>}
    <div className={css.phonePage}>
      <Phone name={name} t={t} usePhone={usePhone} refreshPhone={refreshPhone} controlPhone={controlPhone}
        canFollow={canFollow} canObserve={canObserve} canControl={canControl} headingVisible={false} />
    </div>
  </section>
}
