/** Memory status copy describes confirmed delivery separately from a saved queue. */
export const memoryZh = {
  memoryTitle: '长期记忆', memoryConnecting: '正在连接记忆', memoryReady: '记忆已连接', memoryRetaining: '正在整理记忆', memoryDisabled: '长期记忆未启用',
  memoryCounts: '已确认 {retained} 条记忆，待确认 {pending} 条',
  memoryReadyHint: '她可以主动回忆过去，也可以选择记下重要的经历',
  memoryDisabledHint: '对话仍保存在她的历史中，长期检索暂不可用',
  memoryConnectionFailure: '暂时无法连接记忆服务，待写入原文仍保留；恢复连接后会继续',
  memoryOperationFailure: '这次记忆整理没有完成，原文仍保留；请检查记忆服务中的失败任务',
  memoryBindingFailure: '记忆配置与她的历史不一致，写入已停止；请恢复之前的记忆配置',
  memoryDurabilityFailure: '尚未确认记忆原文已保存，长期写入已暂停；请检查存储',
  memoryProcessFailure: '记忆服务已停止，待写入原文仍保留；请重新加载记忆服务',
  memoryInvalidResponseFailure: '记忆服务没有返回有效确认，原文仍保留；请检查服务',
}

/** Translation keys merged into the resident home namespace. */
export type MemoryLocaleKey = keyof typeof memoryZh

/** English memory status copy with identical keys. */
export const memoryEn: Record<MemoryLocaleKey, string> = {
  memoryTitle: 'Long-term memory', memoryConnecting: 'Connecting memory', memoryReady: 'Memory connected', memoryRetaining: 'Organizing memories', memoryDisabled: 'Long-term memory disabled',
  memoryCounts: '{retained} confirmed memories, {pending} awaiting confirmation',
  memoryReadyHint: 'She can recall the past and choose experiences she wants to remember.',
  memoryDisabledHint: 'Conversations remain in her history. Long-term retrieval is unavailable.',
  memoryConnectionFailure: 'Memory is temporarily unavailable. Queued source text is preserved and delivery resumes after reconnection.',
  memoryOperationFailure: 'A memory could not be processed. Its source is preserved. Check the failed task in the memory service.',
  memoryBindingFailure: 'The memory settings differ from her history. Writes are stopped. Restore the previous memory settings.',
  memoryDurabilityFailure: 'Saving the source text is unconfirmed. Memory writes are paused. Check storage.',
  memoryProcessFailure: 'The memory service stopped. Queued source text is preserved. Reload the memory service.',
  memoryInvalidResponseFailure: 'The memory service did not return a valid acknowledgement. Source text is preserved. Check the service.',
}
