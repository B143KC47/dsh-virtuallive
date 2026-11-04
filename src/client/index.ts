/** Browser registration for the resident's dedicated DSH home panel. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import remote from '@deepseek-ai/dsh-experimental-dsh-virtuallive/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { Home, HomeIcon } from './Home.tsx'
import { HomeController } from './controller.ts'
import { PhoneController } from './PhoneController.ts'
import { PhonePage } from './PhonePage.tsx'
import { ConversationMode, ResidentConversationLabel } from './ConversationMode.tsx'
import { mountConnections } from './connections-mount.ts'
import { zh, en, type HomeLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Resident home dictionary. */
    virtualLive: HomeLocaleKey
  }
}

/** Client services needed to mount the Remote contribution and home navigation. */
export const inject = ['slots', 'locale', 'remote', 'remoteAccess', 'layout', 'uiWorkspace']

/** Client render budget and visible-phone capture cadence. */
export interface Config { pixelRatioLimit: number; maximumFrameRate: number; phoneRefreshIntervalMs: number }

/** Validated canvas limits and delay between completed phone operations and automatic capture. */
export const Config: z<Config> = z.object({
  pixelRatioLimit: z.number().min(1).max(3).default(2), maximumFrameRate: z.number().min(30).max(120).default(60),
  phoneRefreshIntervalMs: z.natural().min(250).max(60000).default(3000),
})

/**
 * Register a home visible to peers authorized to observe the resident.
 * @param ctx - Browser plugin owner.
 * @param config - Client render budget and visible-phone capture cadence.
 * @returns After the generated Remote contribution is mounted.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const unmount = await ctx.remote.$mount(remote)
  ctx.effect(() => unmount, 'virtuallive: remote')
  ctx.effect(() => ctx.locale.register('virtualLive', { zh, en }), 'virtuallive: locale')
  await ctx.inject(['remote.virtualLive', 'remote.virtualLivePhone', 'remote.virtualLiveConnections'], (child) => { mountHome(child, config) })
}

function mountHome(ctx: Context, config: Config): void {
  const panel = 'virtuallive' as MainPanelId
  const phonePanel = 'virtuallive-phone' as MainPanelId
  const t = ctx.locale.bind('virtualLive')
  ctx.remoteAccess.whenAccess('virtualLive/follow', function* () {
    const controller = new HomeController(ctx)
    const phone = new PhoneController(ctx, config.phoneRefreshIntervalMs)
    const openHome = (): void => { ctx.layout.selectPanel(panel) }
    const openPhone = (): void => { ctx.layout.selectPanel(phonePanel) }
    yield async () => { await Promise.all([controller.dispose(), phone.dispose()]) }
    const connections = mountConnections(ctx, phone, openPhone)
    yield connections.dispose
    const openConnections = connections.open
    void controller.connect()
    yield ctx.remoteAccess.whenAccess('virtualLivePhone/follow', function* () {
      void phone.connect()
      yield () => phone.disconnect()
    })
    yield ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: panel, locale: 'virtualLive',
      inject: () => ({
        ...controller.face(), openPhone, openConnections,
        pixelRatioLimit: config.pixelRatioLimit, maximumFrameRate: config.maximumFrameRate,
      }),
    }, Home))
    yield ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: phonePanel, locale: 'virtualLive',
      inject: () => ({
        ...controller.face(), ...phone.face(), hooks: { ...controller.face().hooks, ...phone.face().hooks }, openHome, openConnections,
      }),
    }, PhonePage))
    yield ctx.remoteAccess.whenAccess('virtualLive/snapshot', function* () {
      yield ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left', id: 'virtuallive-mode', order: 40, locale: 'virtualLive',
        inject: () => ({ ...controller.face(), openWorkspaceConversation: () => { ctx.uiWorkspace.startSession() } }),
      }, ConversationMode))
      yield ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions', id: 'virtuallive-resident', order: -5, locale: 'virtualLive',
        inject: () => ({ ...controller.face(), openHome }),
      }, ResidentConversationLabel))
    })
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: panel, order: 10, label: () => t('panel'), locale: 'virtualLive',
    }, HomeIcon))
    yield () => {
      const active = ctx.layout.panelInfo.getSnapshot().activePanelId
      if (active === panel || active === phonePanel) ctx.layout.selectPanel(null)
    }
  })
}
