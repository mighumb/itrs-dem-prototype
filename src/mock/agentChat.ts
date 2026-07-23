import type { ChatMessage, JourneyStep, JourneyTemplate } from '../types'
import { resolveJourneyTemplate } from './data'

export interface AgentChatContext {
  journey: JourneyTemplate
  steps: JourneyStep[]
  isComplete: boolean
  isRunning: boolean
}

export type AgentChatOutcome =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'new_journey'; prompt: string; message: ChatMessage }
  | { kind: 'update_steps'; steps: JourneyStep[]; message: ChatMessage }

function agentMessage(id: string, content: string, actions?: ChatMessage['actions']): ChatMessage {
  return { id, role: 'agent', content, actions }
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i)
  return match?.[0] ?? null
}

function wantsDifferentJourney(text: string, current: JourneyTemplate): boolean {
  const lower = text.toLowerCase()
  const next = resolveJourneyTemplate(text)
  const hasUrl = Boolean(extractUrl(text))

  if (hasUrl && next.id !== current.id) return true

  const switchPhrases =
    /\b(instead|rather|switch to|start over|new journey|different (site|url|journey)|try monitoring|monitor (the )?|go to)\b/i
  if (switchPhrases.test(lower) && next.id !== current.id) return true

  if (hasUrl && next.id === current.id && text.trim().length > 40) {
    return /\b(instead|start over|new journey|switch|try)\b/i.test(lower)
  }

  return false
}

function cloneSteps(steps: JourneyStep[]): JourneyStep[] {
  return steps.map((step) => ({ ...step }))
}

function tryRemoveStep(text: string, steps: JourneyStep[]): JourneyStep[] | null {
  const lower = text.toLowerCase()
  if (!/\b(remove|delete|drop|skip|without)\b/.test(lower)) return null

  const indexMatch = lower.match(/\bstep\s*(\d+)\b/)
  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1
    if (index >= 0 && index < steps.length) {
      return steps.filter((_, i) => i !== index)
    }
  }

  const keywords = ['cookie', 'banner', 'personaliz', 'verify', 'search', 'navigate']
  const keyword = keywords.find((k) => lower.includes(k))
  if (keyword) {
    const filtered = steps.filter((step) => !step.label.toLowerCase().includes(keyword))
    if (filtered.length < steps.length) return filtered
  }

  return null
}

function tryAddStep(text: string, steps: JourneyStep[]): { steps: JourneyStep[]; label: string } | null {
  const lower = text.toLowerCase()
  if (!/\b(add|append|insert|also|include)\b/.test(lower)) return null
  if (!/\b(step|verify|check|click|navigate|type)\b/.test(lower)) return null

  let label = 'Verify page state'
  let action = 'Verify'
  let target = '[data-testid="page-ready"]'

  if (/\bverify\b|\bcheck\b/.test(lower)) {
    const quoted = text.match(/["“]([^"”]+)["”]/)
    label = quoted ? `Verify "${quoted[1]}" visible` : 'Verify expected element visible'
    action = 'Verify'
    target = '[data-qa="target-element"]'
  } else if (/\bclick\b/.test(lower)) {
    label = 'Click target element'
    action = 'Click'
    target = 'button[data-action="primary"]'
  } else if (/\bnavigate\b|\bopen\b/.test(lower)) {
    const url = extractUrl(text)
    label = url ? `Navigate to ${url}` : 'Navigate to target page'
    action = 'Navigate'
    target = url ?? 'https://example.com'
  }

  const newStep: JourneyStep = {
    id: `chat-${Date.now()}`,
    label,
    action,
    duration: action === 'Navigate' ? '3.5s' : '520ms',
    target,
    timeout: '30s',
    status: 'pending',
  }

  return { steps: [...steps, newStep], label }
}

function tryUpdateStep(text: string, steps: JourneyStep[]): { steps: JourneyStep[]; detail: string } | null {
  const lower = text.toLowerCase()
  if (!/\b(change|update|modify|rename|edit|replace)\b/.test(lower)) return null

  const indexMatch = lower.match(/\bstep\s*(\d+)\b/)
  const quoted = text.match(/(?:to|with|say)\s+["“]([^"”]+)["”]/i)

  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1
    if (index >= 0 && index < steps.length) {
      const next = cloneSteps(steps)
      const newLabel = quoted?.[1] ?? next[index].label
      next[index] = { ...next[index], label: newLabel, status: 'pending' }
      return { steps: next, detail: `Step ${index + 1} is now **${newLabel}**.` }
    }
  }

  const keyword = ['search', 'size', 'personaliz', 'cookie', 'verify', 'navigate'].find((k) =>
    lower.includes(k),
  )
  if (keyword) {
    const index = steps.findIndex((step) => step.label.toLowerCase().includes(keyword))
    if (index >= 0) {
      const next = cloneSteps(steps)
      const newLabel = quoted?.[1] ?? `${next[index].label} (updated)`
      next[index] = { ...next[index], label: newLabel, status: 'pending' }
      return { steps: next, detail: `Updated **${steps[index].label}** → **${newLabel}**.` }
    }
  }

  return null
}

export function handleAgentChatInput(input: string, ctx: AgentChatContext): AgentChatOutcome {
  const text = input.trim()
  const id = `agent-chat-${Date.now()}`

  if (ctx.isRunning) {
    return {
      kind: 'message',
      message: agentMessage(
        id,
        "I'm still running this journey — I'll be ready to refine or switch once the current pass finishes.",
      ),
    }
  }

  if (wantsDifferentJourney(text, ctx.journey)) {
    const next = resolveJourneyTemplate(text)
    return {
      kind: 'new_journey',
      prompt: text,
      message: agentMessage(
        id,
        `Got it — I'll build **${next.name}** from your instructions. Watch the browser while I set it up.`,
      ),
    }
  }

  if (!ctx.isComplete || ctx.steps.length === 0) {
    return {
      kind: 'message',
      message: agentMessage(
        id,
        "I'm still setting up this journey. Once the first run finishes, you can ask me to **add or remove steps**, or paste a **URL** to start a different flow.",
      ),
    }
  }

  const removed = tryRemoveStep(text, ctx.steps)
  if (removed) {
    return {
      kind: 'update_steps',
      steps: removed.map((step) => ({ ...step, status: step.status === 'failed' ? 'pending' : step.status })),
      message: agentMessage(
        id,
        `Done — I removed that step. **${removed.length} steps** remain. Hit **Run** in Steps when you want to try the updated flow.`,
      ),
    }
  }

  const added = tryAddStep(text, ctx.steps)
  if (added) {
    return {
      kind: 'update_steps',
      steps: added.steps,
      message: agentMessage(
        id,
        `Added **${added.label}** at the end of the journey. Hit **Run** to execute the updated flow.`,
      ),
    }
  }

  const updated = tryUpdateStep(text, ctx.steps)
  if (updated) {
    return {
      kind: 'update_steps',
      steps: updated.steps,
      message: agentMessage(
        id,
        `${updated.detail} Hit **Run** to validate the change in the browser.`,
      ),
    }
  }

  const url = extractUrl(text)
  if (url) {
    const next = resolveJourneyTemplate(text)
    return {
      kind: 'new_journey',
      prompt: text,
      message: agentMessage(
        id,
        `I'll explore **${url}** and draft a new journey (**${next.name}**). One moment…`,
      ),
    }
  }

  return {
    kind: 'message',
    message: agentMessage(
      id,
      'I can help you **iterate on this journey** — try:\n\n• *Add a step to verify the checkout button*\n• *Remove the cookie banner step*\n• *Change step 3 to "Select size M"*\n\nOr start fresh: paste a **URL** or describe another flow (e.g. *Go to booking.com and search hotels in Rome*).',
    ),
  }
}
