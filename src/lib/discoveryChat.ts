import type { DiscoveryPlan } from '../mock/discovery'
import { t, type Locale } from '../i18n/messages'

export function resolveAgentReplyContent(
  content: string,
  locale: Locale,
  options?: { plan?: DiscoveryPlan | null },
): string {
  const trimmed = content.trim()
  if (trimmed) return trimmed
  if (options?.plan && options.plan.steps.length > 0) return trimmed
  return t(locale, 'agentEmptyReply')
}

export function planStepsForIterate(plan: DiscoveryPlan) {
  return plan.steps.map((step, index) => ({
    id: `plan-step-${index + 1}`,
    label: step.label,
    action: step.action,
  }))
}
