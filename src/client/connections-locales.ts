/** Connection setup copy; phone login and API credentials are separate account states. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Account setup and truthful platform access status. */
    virtualLiveConnections: ConnectionsLocaleKey
  }
}

/** English connection setup labels. */
export const connectionsEn = {
  title: 'App connections',
  intro: 'Choose how the resident accesses each app. Sign in yourself on the dedicated phone; its accounts stay on that device.',
  back: 'Back to home', phone: 'Open phone', refresh: 'Refresh status',
  loading: 'Loading connection settings', loadFailed: 'Connection settings could not be loaded. Refresh status to try again.',
  phoneTitle: 'Accounts on the dedicated phone',
  phoneHint: 'Opening an app or website does not verify its account. Review the actual login screen on the phone.',
  phoneUnavailable: 'The phone is unavailable. Open it to check its connection before signing in.',
  installed: 'Installed on phone', notInstalled: 'App not installed', unknown: 'Installation not checked',
  loginUnknown: 'Login not verified', openApp: 'Open app on phone', openWebsite: 'Open website on phone', officialWebsite: 'Official website',
  qq: 'QQ', wechat: 'WeChat', bilibili: 'Bilibili', rednote: 'Rednote', x: 'X', youtube: 'YouTube',
  qqHint: 'Use the Android app for personal QQ chats. The official website provides app downloads.',
  wechatHint: 'Use the Android app for personal chats. The official website provides app downloads.',
  bilibiliHint: 'Sign in through the app or website on the phone to watch and interact there.',
  rednoteHint: 'Sign in through the app or official website on the phone.',
  xHint: 'Sign in through the app or official website on the phone.',
  youtubeHint: 'Sign in with your Google account in the app or website on the phone.',
  apiTitle: 'Bilibili account verification',
  apiHint: 'Scan with Bilibili, then confirm on your own phone. This saves a credential for account verification in DSH; the Android app and separately installed video plugins have their own login.',
  notChecked: 'Account status not checked', notLinked: 'No account linked', unverified: 'Saved account · Verification needed', verified: 'Account verified', expired: 'Sign-in expired · Link again', invalid: 'Stored credential cannot be read · Remove it and link again',
  account: '{name} · UID {id}',
  begin: 'Link with QR code', relink: 'Link another account', verify: 'Verify account', disconnect: 'Remove saved account',
  noStorage: 'Credential storage is unavailable. Enable the DSH credential provider before linking an account.',
  readOnly: 'Credential storage is read-only. An existing account can be verified, but accounts cannot be linked or removed.',
  qrAlt: 'Bilibili login QR code', qrHint: 'Scan with the Bilibili app and confirm the sign-in, then check confirmation below.',
  waiting: 'Waiting for a scan', scanned: 'Scanned · Confirm in Bilibili', qrExpired: 'This QR code expired. Create a new code to continue.',
  check: 'Check confirmation', cancel: 'Cancel login', checking: 'Checking account',
  bridgeTitle: 'WeChat bridge plugin',
  bridgeHint: 'dsh-wechat links an iLink bot through its own QR settings and can forward messages to DSH. Install and configure it in Plugins when you want that bridge. It is separate from the resident’s Android WeChat app.',
  bridgeSource: 'Review dsh-wechat on GitHub', plugins: 'Open Plugins',
  biliSource: 'Bilibili QR implementation reference',
  readOnlyHint: 'These controls verify account access only. They do not send messages or publish content.',
  disconnected: 'Saved Bilibili account removed', linked: 'Bilibili account verified and saved',
  errorNetwork: 'Bilibili could not be reached. Check your connection and try again.',
  errorRejected: 'Bilibili refused the request. Check the account in Bilibili before trying again.',
  errorResponse: 'Bilibili returned an unexpected response. Keep the account unchanged and try again later.',
  errorAttempt: 'This login attempt was replaced or expired. Create a new QR code.',
  errorStorage: 'The account change could not be confirmed. Refresh status before trying again.',
  errorUnavailable: 'Credential storage is unavailable. Restore the DSH credential provider and try again.',
  errorCancelled: 'The account operation was cancelled. Refresh status before continuing.',
} as const

/** Translation keys shared by the settings entry and dedicated connection page. */
export type ConnectionsLocaleKey = keyof typeof connectionsEn

/** Chinese copy preserves the distinction between account verification and phone access. */
export const connectionsZh: Record<ConnectionsLocaleKey, string> = {
  title: '应用连接',
  intro: '选择居民访问各个应用的方式。请亲自在专属手机上登录，账号会保留在那台设备中',
  back: '返回房间', phone: '打开手机', refresh: '刷新状态',
  loading: '正在加载连接设置', loadFailed: '无法加载连接设置，请刷新状态后重试',
  phoneTitle: '专属手机上的账号', phoneHint: '打开应用或网页不代表账号已登录，请在手机的实际界面中确认',
  phoneUnavailable: '手机当前不可用，请先打开手机检查连接，再进行登录',
  installed: '手机已安装', notInstalled: '未安装应用', unknown: '尚未检查安装状态', loginUnknown: '登录状态未验证',
  openApp: '在手机中打开应用', openWebsite: '在手机中打开官网', officialWebsite: '官方网站',
  qq: 'QQ', wechat: '微信', bilibili: '哔哩哔哩', rednote: '小红书', x: 'X', youtube: 'YouTube',
  qqHint: '个人 QQ 聊天请使用安卓应用，官方网站提供应用下载',
  wechatHint: '个人微信聊天请使用安卓应用，官方网站提供应用下载',
  bilibiliHint: '在手机中的应用或网站登录，即可在那里观看与互动',
  rednoteHint: '请在手机中的应用或官方网站登录', xHint: '请在手机中的应用或官方网站登录',
  youtubeHint: '请在手机中的应用或网站登录 Google 账号',
  apiTitle: '哔哩哔哩账号验证',
  apiHint: '使用哔哩哔哩扫码，并在您自己的手机上确认。凭据保存在 DSH 中用于账号验证；安卓应用和单独安装的视频插件仍需各自登录',
  notChecked: '尚未检查账号状态', notLinked: '尚未关联账号', unverified: '已保存账号 · 待验证', verified: '账号已验证', expired: '登录已过期 · 请重新关联', invalid: '无法读取已保存的凭据 · 请移除后重新关联',
  account: '{name} · UID {id}', begin: '扫码关联', relink: '关联其他账号', verify: '验证账号', disconnect: '移除已保存账号',
  noStorage: '凭据存储不可用，请先启用 DSH 凭据服务，再关联账号', readOnly: '凭据存储为只读。可以验证已有账号，但无法关联或移除账号',
  qrAlt: '哔哩哔哩登录二维码', qrHint: '使用哔哩哔哩应用扫码并确认登录，然后点击下方的检查按钮',
  waiting: '等待扫码', scanned: '已扫码 · 请在哔哩哔哩确认', qrExpired: '二维码已过期，请生成新二维码继续',
  check: '检查登录确认', cancel: '取消登录', checking: '正在检查账号',
  bridgeTitle: '微信桥接插件', bridgeHint: 'dsh-wechat 在自己的设置页中扫码关联 iLink 机器人，可将微信消息转发至 DSH。需要此桥接时，请前往插件页面安装和配置。它与居民安卓手机中的微信应用相互独立',
  bridgeSource: '在 GitHub 查看 dsh-wechat', plugins: '打开插件页面', biliSource: '哔哩哔哩扫码实现参考',
  readOnlyHint: '这些控件仅验证账号访问，不会发送消息或发布内容', disconnected: '已移除保存的哔哩哔哩账号', linked: '已验证并保存哔哩哔哩账号',
  errorNetwork: '无法连接哔哩哔哩，请检查网络后重试', errorRejected: '哔哩哔哩拒绝了请求，请先在应用中检查账号，再重试',
  errorResponse: '哔哩哔哩返回了无法识别的响应，请保留当前账号，稍后重试', errorAttempt: '本次登录已被替换或已过期，请生成新二维码',
  errorStorage: '无法确认账号变更，请先刷新状态再重试', errorUnavailable: '凭据存储不可用，请恢复 DSH 凭据服务后重试',
  errorCancelled: '账号操作已取消，请刷新状态后再继续',
}
