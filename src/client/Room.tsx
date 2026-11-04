/** DOM-owned canvas lifecycle; resident facts arrive only through props. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { HOME_SPACE, homePlaces } from '../home-space.ts'
import type { ResidentState, RoomPoint } from '../types.ts'
import { HomeScene } from './home-scene.ts'
import css from './Home.module.css'

/** Resident facts and explicit destination suggestions passed by the home panel. */
export type RoomProps = PropsLocale<'virtualLive'> & {
  state: ResidentState
  speaking: boolean
  onDestination: (point: RoomPoint) => void
  onPhoneOpen?: (() => void) | undefined
  disabled: boolean
  pixelRatioLimit: number
  maximumFrameRate: number
}

/**
 * Render the interactive room with keyboard-accessible destination invitations.
 * @param props - Current state, locale, and parent-owned admission action.
 * @returns Canvas, movement guidance, and destination buttons.
 */
export function Room({
  state, speaking, onDestination, onPhoneOpen, disabled, pixelRatioLimit, maximumFrameRate, t,
}: RoomProps): ReactNode {
  const element = useRef<HTMLDivElement>(null)
  const renderer = useRef<HomeScene | null>(null)
  const latest = useRef({ state, speaking, onDestination, onPhoneOpen, disabled })
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const places = useMemo(() => homePlaces(state.home), [state.home])
  useLayoutEffect(() => {
    latest.current = { state, speaking, onDestination, onPhoneOpen, disabled }
    renderer.current?.update(state, speaking)
  }, [state, speaking, onDestination, onPhoneOpen, disabled])
  useEffect(() => {
    if (element.current === null) return
    setFailed(false)
    setReady(false)
    try {
      renderer.current = new HomeScene(element.current, latest.current.state, {
        pixelRatioLimit,
        maximumFrameRate,
        onDestination: (point) => { if (!latest.current.disabled) latest.current.onDestination(point) },
        onPhoneOpen: () => { latest.current.onPhoneOpen?.() },
        onReady: () => { setReady(true) },
        onFailure: (error) => { console.error('Virtual Live artwork failed', error); setFailed(true) },
      })
      renderer.current.update(latest.current.state, latest.current.speaking)
    } catch (error) {
      console.error('Virtual Live room rendering failed', error)
      setFailed(true)
    }
    return () => { renderer.current?.dispose(); renderer.current = null }
  }, [pixelRatioLimit, maximumFrameRate])
  return <figure className={css.sceneFigure}>
    <div className={css.sceneStage}>
      <div className={css.sceneCanvas} ref={element} role="img" aria-label={t('sceneDescription')} />
      {!ready && !failed && <span className={`${css.spinner} ${css.sceneLoading}`} aria-label={t('loadingRoom')} />}
    </div>
    <figcaption className={css.sceneCaption}>{t(failed ? 'sceneFailed' : 'sceneHint')}</figcaption>
    <div className={css.places} aria-label={t('places')}>
      {Object.entries(places).map(([place, point]) => <Button key={place} disabled={disabled || !ready || failed} onClick={() => { onDestination(point) }}>{t(`place.${place as keyof typeof HOME_SPACE.places}`)}</Button>)}
    </div>
  </figure>
}
