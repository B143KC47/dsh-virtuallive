/** Room arrangement controls send complete edits to the persistent room owner. */
import { useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { HOME_LAYER_IDS, HOME_SPACE, initialHomeLayout } from '../home-space.ts'
import { HOME_FURNITURE } from '../home-catalog.ts'
import type { HomeLayerId, HomeLayerPlacement, HomeLayout } from '../types.ts'
import css from './Home.module.css'

/** Observed arrangement and admission state, with no component-owned persistence. */
export type HomeLayersProps = PropsLocale<'virtualLive'> & {
  layout: HomeLayout
  revision: number
  disabled: boolean
  error: 'none' | 'invalid' | 'conflict' | 'unconfirmed'
  arrange: (layout: HomeLayout, revision: number) => Promise<boolean>
  reconnect: () => void
}

/**
 * Select, hide, replace, and move independent furniture without editing the wallpaper.
 * @param props - Committed arrangement, localized labels, and the Host action.
 * @returns Keyboard-accessible layer controls and persistent validation feedback.
 */
export function HomeLayers({ layout, revision, disabled, error, arrange, reconnect, t }: HomeLayersProps): ReactNode {
  const [selected, setSelected] = useState<HomeLayerId>('sofa')
  const placement = layout.layers[selected]
  const edit = (patch: Partial<HomeLayerPlacement>): void => {
    void arrange({ ...layout, layers: { ...layout.layers, [selected]: { ...placement, ...patch } } }, revision)
  }
  const empty = (): void => {
    const next = structuredClone(layout)
    for (const id of HOME_LAYER_IDS) next.layers[id].visible = false
    void arrange(next, revision)
  }
  return <details className={css.layerEditor}>
    <summary>{t('layers')}</summary>
    <p>{t('layersHint')}</p>
    <div className={css.layerActions}>
      <Button disabled={disabled} onClick={empty}>{t('emptyRoom')}</Button>
      <Button disabled={disabled} onClick={() => { void arrange(initialHomeLayout(), revision) }}>{t('restoreRoom')}</Button>
      <Button disabled={disabled} onClick={() => { void arrange({ ...layout, background: layout.background === 'afternoon' ? 'night' : 'afternoon' }, revision) }}>{t(layout.background === 'afternoon' ? 'nightWallpaper' : 'dayWallpaper')}</Button>
    </div>
    <div className={css.layerChoices} role="group" aria-label={t('chooseLayer')}>
      {HOME_LAYER_IDS.map(id => <Button key={id} aria-pressed={selected === id} variant={selected === id ? 'primary' : 'ghost'} onClick={() => { setSelected(id) }}>{t(`layer.${id}`)}{layout.layers[id].visible ? '' : ` · ${t('hidden')}`}</Button>)}
    </div>
    <fieldset className={css.layerControls} disabled={disabled}>
      <legend>{t(`layer.${selected}`)}</legend>
      <Button onClick={() => { edit({ visible: !placement.visible }) }}>{t(placement.visible ? 'hideLayer' : 'showLayer')}</Button>
      <Button disabled={placement.x <= 0} onClick={() => { edit({ x: Math.max(0, placement.x - 0.25) }) }}>{t('moveLeft')}</Button>
      <Button disabled={placement.x >= HOME_SPACE.width} onClick={() => { edit({ x: Math.min(HOME_SPACE.width, placement.x + 0.25) }) }}>{t('moveRight')}</Button>
      <Button disabled={placement.z <= 0} onClick={() => { edit({ z: Math.max(0, placement.z - 0.25) }) }}>{t('moveBack')}</Button>
      <Button disabled={placement.z >= HOME_SPACE.depth} onClick={() => { edit({ z: Math.min(HOME_SPACE.depth, placement.z + 0.25) }) }}>{t('moveForward')}</Button>
      {HOME_FURNITURE[selected].variants.includes('alternate') && <Button onClick={() => { edit({ variant: placement.variant === 'standard' ? 'alternate' : 'standard' }) }}>{t('changeStyle')}</Button>}
    </fieldset>
    {error !== 'none' && <p role="alert">{t(error === 'invalid' ? 'arrangementInvalid' : error === 'conflict' ? 'arrangementConflict' : 'arrangementUnconfirmed')}{error === 'unconfirmed' && <Button onClick={reconnect}>{t('retry')}</Button>}</p>}
  </details>
}
