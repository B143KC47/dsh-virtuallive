/** One account controller serves normal Settings and the resident's direct connection page. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { ConnectionsController } from './ConnectionsController.ts'
import { ConnectionsMain, ConnectionsSection, ConnectionsToast, type ConnectionsPageFace } from './ConnectionsPage.tsx'
import type { PhoneController } from './PhoneController.ts'
import { connectionsEn as en, connectionsZh as zh } from './connections-locales.ts'

/**
 * Register both entry points while the peer can observe account configuration.
 * @param ctx - Browser plugin context with mounted account remotes and layout services.
 * @param phone - The resident's existing phone owner, shared with its phone view.
 * @param openPhone - Navigate to the actual phone controls.
 * @returns Page navigation and the disposer the enclosing resident-access owner must retain.
 */
export function mountConnections(
  ctx: Context, phone: PhoneController, openPhone: () => void,
): { open: () => void; dispose: () => Promise<void> } {
  const panel = 'virtuallive-connections' as MainPanelId
  const home = 'virtuallive' as MainPanelId
  const controllers = new Set<ConnectionsController>()
  const disposeLocale = ctx.effect(() => ctx.locale.register('virtualLiveConnections', { zh, en }), 'virtuallive: connection copy')
  const disposeAccess = ctx.remoteAccess.whenAccess('virtualLiveConnections/status', function* () {
    const controller = new ConnectionsController(ctx.remote.virtualLiveConnections)
    controllers.add(controller)
    yield async () => { await controller.dispose(); controllers.delete(controller) }
    const face = (): ConnectionsPageFace => ({
      ...controller.face(), ...phone.face(), hooks: { ...controller.face().hooks, ...phone.face().hooks },
      openPhone, openPlugins: ctx.get('pluginNavigation') === undefined ? null : () => { ctx.get('pluginNavigation')?.openBundle('dsh-wechat') },
    })
    void controller.face().refreshConnections()
    yield ctx.on('connection/reset', () => { void controller.face().refreshConnections() })
    yield ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section', id: 'virtuallive-connections', order: 25, label: () => ctx.locale.bind('virtualLiveConnections')('title'), locale: 'virtualLiveConnections', inject: face,
    }, ConnectionsSection))
    yield ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: panel, locale: 'virtualLiveConnections', inject: () => ({ ...face(), back: () => { ctx.layout.selectPanel(home) } }),
    }, ConnectionsMain))
    yield ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay', id: 'virtuallive-connections-feedback', locale: 'virtualLiveConnections', inject: () => controller.face(),
    }, ConnectionsToast))
    yield () => { if (ctx.layout.panelInfo.getSnapshot().activePanelId === panel) ctx.layout.selectPanel(null) }
  })
  return {
    open: () => { ctx.layout.selectPanel(panel) },
    dispose: async () => {
      disposeAccess()
      await Promise.all([...controllers].map(controller => controller.dispose()))
      await disposeLocale()
    },
  }
}
