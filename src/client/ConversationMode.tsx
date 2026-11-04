/** Workspace navigation selects the resident's existing conversation by identity. */
import { useId, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { HomeFace } from './controller.ts'
import css from './Home.module.css'

/** Existing composer controls receive a dedicated resident navigation choice. */
export type ConversationModeProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'virtualLive'> & InjectFace<HomeFace> & {
  openWorkspaceConversation: () => void
}

/**
 * Select ordinary workspace conversation or the resident's retained Session.
 * @param props - Current Session identity, resident observation, and navigation actions.
 * @returns An accessible mode control with an inline opening failure.
 */
export function ConversationMode({
  sessionId, useResident, openConversation, openWorkspaceConversation, t,
}: ConversationModeProps): ReactNode {
  const state = useResident(value => value)
  const id = useId()
  const selected = state.snapshot?.sessionId === sessionId ? 'resident' : 'workspace'
  return <div className={css.mode}>
    <label htmlFor={id}>{t('conversationMode')}</label>
    <select id={id} value={selected} disabled={state.openingConversation} onChange={(event) => {
      if (event.target.value === 'resident') void openConversation()
      else openWorkspaceConversation()
    }}>
      <option value="workspace">{t('workspaceConversation')}</option>
      <option value="resident">{t('residentConversation')}</option>
    </select>
    {state.conversationError && <span className={css.modeError} role="status">{t('conversationFailed')}<Button variant="ghost" onClick={() => { void openConversation() }}>{t('retry')}</Button></span>}
  </div>
}

/** Header identity links the resident's conversation back to her home. */
export type ResidentConversationLabelProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'virtualLive'> & InjectFace<HomeFace> & {
  openHome: () => void
}

/**
 * Name the resident when the current workspace conversation uses her Session.
 * @param props - Current Session identity and resident observation.
 * @returns Resident identity and home navigation, or no entry for other Sessions.
 */
export function ResidentConversationLabel({ sessionId, useResident, openHome, t }: ResidentConversationLabelProps): ReactNode {
  const snapshot = useResident(value => value.snapshot)
  if (snapshot?.sessionId !== sessionId) return null
  return <Button variant="ghost" onClick={openHome}>{snapshot.state.identity ? t('talkingWith', { name: snapshot.state.identity.name }) : t('residentConversation')}</Button>
}
