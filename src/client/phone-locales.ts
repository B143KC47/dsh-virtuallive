/** Phone copy distinguishes verified device state from unverified account access. */
export const phoneZh = {
  'phone.title': '{name}的手机', 'phone.unnamed': '她的手机',
  'phone.open': '打开手机', 'phone.returnHome': '返回小家', 'phone.entryHint': '打开她的独立手机，查看屏幕或使用应用', 'phone.connections': '账号与连接',
  'phone.connect': '连接手机', 'phone.refresh': '刷新屏幕', 'phone.loading': '正在读取手机屏幕',
  'phone.automatic': '页面可见时会自动更新屏幕；连接异常后请手动刷新',
  'phone.unconfigured': '独立手机尚未配置',
  'phone.failed': '手机连接中断，请刷新屏幕后继续',
  'phone.uncertain': '上次操作的结果尚未确认。请先刷新屏幕并查看结果，再决定下一步',
  'phone.transport': '未能确认操作结果，请刷新屏幕并查看后再继续',
  'phone.ready': '独立 Android 手机已连接',
  'phone.accessDenied': '目前没有查看手机屏幕的权限', 'phone.readOnly': '你可以查看手机，目前没有操作手机的权限', 'phone.refreshDenied': '屏幕将随操作更新，目前没有手动刷新屏幕的权限',
  'phone.control': '手机触控屏，可点击或拖动滑动', 'phone.screen': '独立手机的实际屏幕',
  'phone.hint': '点击屏幕操作，按住拖动滑动；也可用下面的系统按键',
  'phone.back': '返回', 'phone.home': '主屏幕', 'phone.enter': '回车',
  'phone.text': '输入到手机', 'phone.textPlaceholder': '先在手机屏幕中选中输入框',
  'phone.type': '输入文字', 'phone.clear': '替换当前输入框的文字',
  'phone.accounts': '账号状态未验证。请在手机中用你自己的账号登录；安装应用或打开网页不代表已经登录',
  'phone.native': '应用入口', 'phone.web': '未安装 · 官方网页',
  'phone.qq': 'QQ', 'phone.wechat': '微信', 'phone.bilibili': '哔哩哔哩', 'phone.rednote': '小红书', 'phone.x': 'X', 'phone.youtube': 'YouTube',
  'phone.observed': '最近一次读取耗时 {ms} 毫秒',
  'phone.address': '打开网页', 'phone.addressPlaceholder': 'https://…', 'phone.openAddress': '打开',
} as const

/** Phone keys merged into the resident home's locale namespace. */
export type PhoneLocaleKey = keyof typeof phoneZh

/** English phone dictionary. */
export const phoneEn: Record<PhoneLocaleKey, string> = {
  'phone.title': '{name}’s phone', 'phone.unnamed': 'Her phone',
  'phone.open': 'Open phone', 'phone.returnHome': 'Back to home', 'phone.entryHint': 'Open her dedicated phone to view its screen or use its apps.', 'phone.connections': 'Accounts and connections',
  'phone.connect': 'Connect phone', 'phone.refresh': 'Refresh screen', 'phone.loading': 'Reading the phone screen',
  'phone.automatic': 'The screen updates automatically while this page is visible. If the connection fails, refresh it manually.',
  'phone.unconfigured': 'The dedicated phone is not configured',
  'phone.failed': 'The phone connection failed. Refresh the screen to continue.',
  'phone.uncertain': 'The last input outcome is unknown. Refresh and inspect the screen before deciding what to do next.',
  'phone.transport': 'The operation outcome was not confirmed. Refresh and inspect the screen before continuing.',
  'phone.ready': 'Dedicated Android phone connected',
  'phone.accessDenied': 'Viewing the phone requires additional access', 'phone.readOnly': 'You can view this phone. Operating it requires additional access.', 'phone.refreshDenied': 'The screen follows phone activity. Manual refresh requires additional access.',
  'phone.control': 'Phone touch screen; tap or drag to swipe', 'phone.screen': 'Actual dedicated phone display',
  'phone.hint': 'Tap the screen or drag to swipe. System buttons are available below.',
  'phone.back': 'Back', 'phone.home': 'Home', 'phone.enter': 'Enter',
  'phone.text': 'Type on phone', 'phone.textPlaceholder': 'Select a text field on the phone first',
  'phone.type': 'Type text', 'phone.clear': 'Replace the focused field’s text',
  'phone.accounts': 'Account access is unverified. Sign in with your own accounts on the phone; installing an app or opening a website does not confirm login.',
  'phone.native': 'Open app', 'phone.web': 'Not installed · Official website',
  'phone.qq': 'QQ', 'phone.wechat': 'WeChat', 'phone.bilibili': 'Bilibili', 'phone.rednote': 'Rednote', 'phone.x': 'X', 'phone.youtube': 'YouTube',
  'phone.observed': 'Latest observation took {ms} ms',
  'phone.address': 'Open website', 'phone.addressPlaceholder': 'https://…', 'phone.openAddress': 'Open',
}
