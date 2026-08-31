import type { ChatMessage } from '../types'

const HOME_KEY = 'itrs-discovery-chat-v1'
const WORKSPACE_PREFIX = 'itrs-workspace-chat-v1:'

function safeParseMessages(raw: string | null): ChatMessage[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const messages = parsed.filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        typeof m === 'object' &&
        typeof (m as ChatMessage).id === 'string' &&
        ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'agent') &&
        typeof (m as ChatMessage).content === 'string',
    )
    return messages.length > 0 ? messages : null
  } catch {
    return null
  }
}

export function loadHomeChat(): ChatMessage[] | null {
  if (typeof sessionStorage === 'undefined') return null
  return safeParseMessages(sessionStorage.getItem(HOME_KEY))
}

export function saveHomeChat(messages: ChatMessage[]) {
  if (typeof sessionStorage === 'undefined') return
  if (messages.length === 0) {
    sessionStorage.removeItem(HOME_KEY)
    return
  }
  try {
    sessionStorage.setItem(HOME_KEY, JSON.stringify(messages.slice(-120)))
  } catch {
    /* quota */
  }
}

export function workspaceChatKey(prompt: string): string {
  const slug = prompt.trim().slice(0, 80) || 'default'
  return `${WORKSPACE_PREFIX}${slug}`
}

export function loadWorkspaceChat(prompt: string): ChatMessage[] | null {
  if (typeof sessionStorage === 'undefined') return null
  return safeParseMessages(sessionStorage.getItem(workspaceChatKey(prompt)))
}

export function saveWorkspaceChat(prompt: string, messages: ChatMessage[]) {
  if (typeof sessionStorage === 'undefined') return
  const key = workspaceChatKey(prompt)
  if (messages.length === 0) {
    sessionStorage.removeItem(key)
    return
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(messages.slice(-120)))
  } catch {
    /* quota */
  }
}
