import type {
  BrowserFrame,
  ChatMessage,
  JourneyStep,
  JourneyTemplate,
  StepMonitoringMetrics,
} from '../types'

/** Ready-made demo prompts — not to be confused with agent-generated Suggestions (URL-only → analyzed paths). */
export const HOME_EXAMPLES = [
  'Go to https://www.nike.com, search for France 2026 Stadium Home, select size L, personalize with Miguel / 6, and verify "Add to bag" is visible.',
  'Go to https://www.thetrainline.com, search for trains from Paris Gare de Lyon to Lyon Part-Dieu tomorrow morning, select a morning TGV, choose a Standard ticket, and verify you can enter passenger details.',
  'Go to https://www.booking.com, search for hotels in Barcelona next weekend, open the first result, and verify room options are shown.',
]

export const DEMO_PROMPT =
  'Go to https://www.nike.com, search for France 2026 Stadium Home, select size L, personalize with name Miguel and number 6, then finish.'

const TRAIN_JOURNEY: JourneyTemplate = {
  id: 'train',
  name: 'Paris → Lyon Train',
  matchPrompts: [HOME_EXAMPLES[1]],
  steps: [
    {
      id: 'train-1',
      label: 'Navigate to thetrainline.com',
      action: 'Navigate',
      duration: '3.8s',
      target: 'https://www.thetrainline.com',
      timeout: '30s',
    },
    {
      id: 'train-2',
      label: 'Search Paris Gare de Lyon → Lyon',
      action: 'Type',
      duration: '1.4s',
      target: 'input[name="origin"], input[name="destination"]',
      timeout: '30s',
    },
    {
      id: 'train-3',
      label: 'Set outbound to tomorrow morning',
      action: 'Click',
      duration: '890ms',
      target: 'button[data-testid="date-picker"]',
      timeout: '30s',
    },
    {
      id: 'train-4',
      label: 'Select a morning TGV',
      action: 'Click',
      duration: '720ms',
      target: '.search-results__item[data-train-type="tgv"]',
      timeout: '30s',
    },
    {
      id: 'train-5',
      label: 'Choose Standard ticket',
      action: 'Click',
      duration: '640ms',
      target: 'button[data-fare="standard"]',
      timeout: '30s',
    },
    {
      id: 'train-6',
      label: 'Verify passenger details form',
      action: 'Verify',
      duration: '420ms',
      target: 'form.passenger-details',
      timeout: '30s',
    },
  ],
  browserFrames: [
    {
      url: 'https://www.thetrainline.com',
      title: 'Trainline — Train tickets',
      highlight: 'Homepage loaded',
    },
    {
      url: 'https://www.thetrainline.com',
      title: 'Trainline — Search',
      highlight: 'Paris Gare de Lyon → Lyon Part-Dieu',
      cursor: { x: 45, y: 35 },
    },
    {
      url: 'https://www.thetrainline.com',
      title: 'Trainline — Date',
      highlight: 'Tomorrow · Morning',
      cursor: { x: 52, y: 28 },
    },
    {
      url: 'https://www.thetrainline.com/search',
      title: 'Trainline — Results',
      highlight: 'Morning TGV — selected',
      cursor: { x: 50, y: 48 },
    },
    {
      url: 'https://www.thetrainline.com/book/ticket-options',
      title: 'Trainline — Ticket options',
      highlight: 'Standard ticket — selected',
      cursor: { x: 62, y: 55 },
    },
    {
      url: 'https://www.thetrainline.com/book/passenger-details',
      title: 'Trainline — Passenger details',
      highlight: 'Passenger form — verified ✓',
    },
  ],
  monitoring: {
    kpi: { availability: '100%', totalTime: '7.87 s', failingSteps: '0 issues' },
    lastRunLabel: 'Preview run',
  },
}

const HOTEL_JOURNEY: JourneyTemplate = {
  id: 'hotel',
  name: 'Barcelona Hotels',
  matchPrompts: [HOME_EXAMPLES[2]],
  steps: [
    {
      id: 'hotel-1',
      label: 'Navigate to booking.com',
      action: 'Navigate',
      duration: '4.2s',
      target: 'https://www.booking.com',
      timeout: '30s',
    },
    {
      id: 'hotel-2',
      label: 'Search Barcelona, next weekend',
      action: 'Type',
      duration: '1.8s',
      target: 'input[name="ss"]',
      timeout: '30s',
    },
    {
      id: 'hotel-3',
      label: 'Open first hotel result',
      action: 'Click',
      duration: '950ms',
      target: '.sr_property_block:first-child a',
      timeout: '30s',
    },
    {
      id: 'hotel-4',
      label: 'View available rooms',
      action: 'Click',
      duration: '680ms',
      target: '#hprt-table',
      timeout: '30s',
    },
    {
      id: 'hotel-5',
      label: 'Verify room options shown',
      action: 'Verify',
      duration: '380ms',
      target: '.hprt-roomtype-link',
      timeout: '30s',
    },
  ],
  browserFrames: [
    {
      url: 'https://www.booking.com',
      title: 'Booking.com',
      highlight: 'Homepage loaded',
    },
    {
      url: 'https://www.booking.com',
      title: 'Booking.com — Search',
      highlight: 'Barcelona · Next weekend',
      cursor: { x: 48, y: 32 },
    },
    {
      url: 'https://www.booking.com/hotel/es/example.html',
      title: 'Hotel Arts Barcelona — Booking.com',
      highlight: 'Hotel page',
      cursor: { x: 40, y: 55 },
    },
    {
      url: 'https://www.booking.com/hotel/es/example.html',
      title: 'Hotel Arts Barcelona — Booking.com',
      highlight: 'Available rooms',
      cursor: { x: 55, y: 62 },
    },
    {
      url: 'https://www.booking.com/hotel/es/example.html',
      title: 'Hotel Arts Barcelona — Booking.com',
      highlight: 'Room options — verified ✓',
    },
  ],
  monitoring: {
    kpi: { availability: '100%', totalTime: '8.01 s', failingSteps: '0 issues' },
    lastRunLabel: 'Preview run',
  },
}

const NIKE_JOURNEY: JourneyTemplate = {
  id: 'nike',
  name: 'Nike Checkout',
  matchPrompts: [HOME_EXAMPLES[0], DEMO_PROMPT],
  steps: [
    {
      id: 'nike-1',
      label: 'Navigate to nike.com',
      action: 'Navigate',
      duration: '6.2s',
      target: 'https://www.nike.com',
      timeout: '30s',
    },
    {
      id: 'nike-2',
      label: 'Dismiss cookie banner',
      action: 'Click',
      duration: '634ms',
      target: 'button#onetrust-accept-btn-handler',
      timeout: '30s',
    },
    {
      id: 'nike-3',
      label: 'Search for France 2026 Stadium',
      action: 'Type',
      duration: '1.9s',
      target: 'input[name="search"]',
      timeout: '30s',
    },
    {
      id: 'nike-4',
      label: 'Select product',
      action: 'Click',
      duration: '1.1s',
      target: 'a.product-card[href*="france-jersey"]',
      timeout: '30s',
    },
    {
      id: 'nike-5',
      label: 'Select size L',
      action: 'Click',
      duration: '890ms',
      target: 'button.size-selector[data-value="L"]',
      timeout: '30s',
    },
    {
      id: 'nike-6',
      label: 'Personalize — Miguel, 6',
      action: 'Type',
      duration: '2.4s',
      target: 'input[name="customName"], input[name="customNumber"]',
      timeout: '30s',
    },
    {
      id: 'nike-7',
      label: 'Verify "Add to bag" visible',
      action: 'Verify',
      duration: '420ms',
      target: 'button[data-qa="add-to-bag"]',
      timeout: '30s',
    },
  ],
  browserFrames: [
    {
      url: 'https://www.nike.com',
      title: 'Nike. Just Do It.',
      highlight: 'Homepage loaded',
    },
    {
      url: 'https://www.nike.com',
      title: 'Nike. Just Do It.',
      highlight: 'Cookie banner — Accept',
      cursor: { x: 72, y: 78 },
    },
    {
      url: 'https://www.nike.com/search',
      title: 'Search — Nike',
      highlight: 'Search: France 2026 Stadium',
      cursor: { x: 45, y: 12 },
    },
    {
      url: 'https://www.nike.com/t/france-jersey',
      title: 'France 2026 Stadium Home — Nike',
      highlight: 'Product page',
    },
    {
      url: 'https://www.nike.com/t/france-jersey',
      title: 'France 2026 Stadium Home — Nike',
      highlight: 'Size L selected',
      cursor: { x: 58, y: 52 },
    },
    {
      url: 'https://www.nike.com/customize',
      title: 'Personalize — Nike',
      highlight: 'Name: Miguel · Number: 6',
      cursor: { x: 50, y: 45 },
    },
    {
      url: 'https://www.nike.com/t/france-jersey',
      title: 'France 2026 Stadium Home — Nike',
      highlight: 'Add to bag — verified ✓',
    },
  ],
  monitoring: {
    kpi: { availability: '100%', totalTime: '13.54 s', failingSteps: '0 issues' },
    lastRunLabel: 'Preview run',
  },
}

export const JOURNEY_TEMPLATES: JourneyTemplate[] = [
  NIKE_JOURNEY,
  TRAIN_JOURNEY,
  HOTEL_JOURNEY,
]

const STEP_FRAME_MAP = new Map<string, BrowserFrame>()
for (const template of JOURNEY_TEMPLATES) {
  template.steps.forEach((step, index) => {
    STEP_FRAME_MAP.set(step.id, template.browserFrames[index])
  })
}

export function resolveJourneyTemplate(prompt: string): JourneyTemplate {
  const trimmed = prompt.trim()
  const lower = trimmed.toLowerCase()

  const exact = JOURNEY_TEMPLATES.find((template) =>
    template.matchPrompts.some((match) => match.toLowerCase() === lower),
  )
  if (exact) return exact

  if (lower.includes('nike') || lower.includes('stadium') || lower.includes('jersey')) {
    return NIKE_JOURNEY
  }
  if (
    lower.includes('trainline') ||
    lower.includes('thetrainline') ||
    lower.includes('train') ||
    (lower.includes('paris') && lower.includes('lyon'))
  ) {
    return TRAIN_JOURNEY
  }
  if (
    lower.includes('booking.com') ||
    lower.includes('hotel') ||
    lower.includes('barcelona')
  ) {
    return HOTEL_JOURNEY
  }
  if (
    lower.includes('checkout') ||
    lower.includes('cart') ||
    lower.includes('payment') ||
    lower.includes('shipping') ||
    lower.includes('add to bag')
  ) {
    return NIKE_JOURNEY
  }

  if (trimmed) return NIKE_JOURNEY
  return NIKE_JOURNEY
}

/** @deprecated Use resolveJourneyTemplate().name */
export const JOURNEY_NAME = NIKE_JOURNEY.name

/** @deprecated Use resolveJourneyTemplate().steps */
export const MOCK_STEPS = NIKE_JOURNEY.steps

/** @deprecated Use resolveJourneyTemplate().browserFrames */
export const BROWSER_FRAMES = NIKE_JOURNEY.browserFrames

/** @deprecated Use journey.monitoring.kpi */
export const RESULTS_KPI = NIKE_JOURNEY.monitoring.kpi

export const AGENT_INTRO: ChatMessage = {
  id: 'intro',
  role: 'agent',
  content:
    "Hello! I'm your journey assistant. Tell me what to monitor, or paste a URL to get started.",
}

export const SCHEDULE_SUGGESTION = {
  primary: 'Every 15 min, 24/7, from Paris + Frankfurt',
  alternatives: ['Every hour, business hours only', 'Custom schedule…'],
}

export function getBrowserFrameForStep(step: JourneyStep, index: number): BrowserFrame {
  const known = STEP_FRAME_MAP.get(step.id)
  if (known) return known

  const url = step.target?.startsWith('http')
    ? step.target
    : step.label.toLowerCase().includes('nike')
      ? 'https://www.nike.com'
      : 'https://example.com'

  const cursorOffset = { x: 35 + (index * 11) % 45, y: 25 + (index * 9) % 50 }

  switch (step.action) {
    case 'Navigate':
      return { url, title: step.label, highlight: step.label }
    case 'Click':
      return { url, title: step.label, highlight: step.label, cursor: cursorOffset }
    case 'Type':
      return {
        url,
        title: step.label,
        highlight: `Typing: ${step.label}`,
        cursor: { x: 45, y: 18 },
      }
    case 'Verify':
      return { url, title: step.label, highlight: `✓ ${step.label}` }
    default:
      return { url, title: step.label, highlight: step.label, cursor: cursorOffset }
  }
}

/** Index of the step that fails on this run, or null if all pass. Run stops at the first failure. */
export function pickRandomFailureIndex(stepCount: number): number | null {
  if (stepCount === 0) return null
  if (Math.random() < 0.25) return null
  return Math.floor(Math.random() * stepCount)
}

export function buildJourneyReadyMessage(journey: JourneyTemplate): ChatMessage {
  const stepCount = journey.steps.length
  return {
    id: 'done-1',
    role: 'agent',
    content: `Journey ready — **${journey.name}** (${stepCount} steps). Use **Run** in Steps to replay, or **Edit** to adjust the flow.`,
  }
}

export function buildScheduleMessage(): ChatMessage {
  return {
    id: 'done-2',
    role: 'agent',
    content: 'Suggested schedule:',
    actions: [
      { id: 'accept-schedule', label: 'Every 15 min, Paris + Frankfurt', variant: 'primary' },
      { id: 'custom-schedule', label: 'Customize', variant: 'secondary' },
      { id: 'skip-schedule', label: 'Skip for now', variant: 'secondary' },
    ],
  }
}

export interface RunFailureInfo {
  stepIndex: number
  stepLabel: string
}

export const RUN_OUTCOME_MESSAGE_ID = 'run-outcome'

export function ensureFullJourneySteps(
  currentSteps: JourneyStep[],
  journey: JourneyTemplate,
): JourneyStep[] {
  if (currentSteps.length >= journey.steps.length) return currentSteps

  const merged = [...currentSteps]
  for (let i = currentSteps.length; i < journey.steps.length; i++) {
    merged.push({ ...journey.steps[i], status: 'pending' })
  }
  return merged
}

export function applyAgentStepFix(step: JourneyStep): { step: JourneyStep; changeSummary: string } {
  const previousTarget = step.target ?? step.label
  let newTarget = step.target

  if (step.label.toLowerCase().includes('select product')) {
    newTarget = 'a.product-card__link[href*="france-jersey"]'
  } else if (step.action === 'Click') {
    newTarget = `[data-testid="${step.id}-target"]`
  } else if (step.action === 'Type') {
    newTarget = step.target?.includes(',') ? step.target : `${step.target}, input[autocomplete="off"]`
  } else if (step.action === 'Verify') {
    newTarget = `${step.target ?? 'button'}, [data-qa="add-to-bag"]`
  }

  const changeSummary =
    newTarget && newTarget !== step.target
      ? `I updated **${step.label}** — the target moved on the page (\`${previousTarget}\` → \`${newTarget}\`). Continuing from here.`
      : `I refreshed the locator for **${step.label}** to match the current page. Continuing from here.`

  return {
    step: { ...step, status: 'pending', target: newTarget ?? step.target },
    changeSummary,
  }
}

export function buildRunOutcomeMessage(
  failedStep: RunFailureInfo | null,
  totalSteps?: number,
): ChatMessage {
  if (!failedStep) {
    const countLabel =
      totalSteps && totalSteps > 0
        ? `all **${totalSteps} steps**`
        : 'all steps'
    return {
      id: RUN_OUTCOME_MESSAGE_ID,
      role: 'agent',
      content: `Run complete — ${countLabel} executed successfully.`,
    }
  }

  const stepNumber = failedStep.stepIndex + 1
  return {
    id: RUN_OUTCOME_MESSAGE_ID,
    role: 'agent',
    content:
      `Run stopped at step ${stepNumber} — **${failedStep.stepLabel}** could not complete. ` +
      'Remaining steps were not executed.\n\n' +
      'The page layout may have changed since this journey was recorded. I can update the locator and continue for you.',
    actions: [{ id: 'fix-auto-continue', label: 'Fix and continue', variant: 'primary' }],
  }
}

export function applyPostRunMessages(
  messages: ChatMessage[],
  journey: JourneyTemplate,
  failedStep: RunFailureInfo | null,
  options?: { addJourneyReady?: boolean },
): ChatMessage[] {
  let next = withoutTransientRunMessages(messages)

  if (options?.addJourneyReady && !next.some((message) => message.id === 'done-1')) {
    next = [...next, buildJourneyReadyMessage(journey)]
  }

  if (failedStep) {
    next = next.filter((message) => message.id !== 'done-2')
  } else if (!next.some((message) => message.id === 'done-2')) {
    next = [...next, buildScheduleMessage()]
  }

  return [...next, buildRunOutcomeMessage(failedStep, journey.steps.length)]
}

/** Drop transient run messages so agent chat matches the latest run only. */
export function withoutTransientRunMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => {
    if (message.id === RUN_OUTCOME_MESSAGE_ID) return false
    if (message.id === 'agent-progress') return false
    if (message.id.startsWith('agent-fail-')) return false
    if (message.id.startsWith('agent-run-')) return false
    if (message.id.startsWith('agent-run-done-')) return false
    if (message.id.startsWith('agent-stop-')) return false
    if (message.id.startsWith('agent-continue-')) return false
    return true
  })
}

export function buildMonitoringPreviewSteps(steps: JourneyStep[]): JourneyStep[] {
  return steps.filter((step) => step.status === 'done' || step.status === 'failed')
}

export function computeRunMonitoringKpi(steps: JourneyStep[]): {
  availability: string
  totalTime: string
  failingSteps: string
} {
  if (steps.length === 0) {
    return { availability: '—', totalTime: '—', failingSteps: '—' }
  }

  const executed = buildMonitoringPreviewSteps(steps)
  const doneCount = steps.filter((step) => step.status === 'done').length
  const failedCount = steps.filter((step) => step.status === 'failed').length

  if (executed.length === 0) {
    return {
      availability: '—',
      totalTime: '—',
      failingSteps: formatFailingStepsLabel(0),
    }
  }

  const totalMs = executed.reduce(
    (sum, step) => sum + stepDurationMs(step),
    0,
  )

  return {
    availability: formatAvailabilityPercent(doneCount, steps.length),
    totalTime: formatMs(totalMs),
    failingSteps: formatFailingStepsLabel(failedCount),
  }
}

export function formatFailingStepsLabel(failedCount: number): string {
  if (failedCount === 0) return '0 issues'
  if (failedCount === 1) return '1 issue'
  return `${failedCount} issues`
}

export function formatAvailabilityPercent(doneCount: number, totalCount: number): string {
  if (totalCount === 0) return '—'
  return `${Math.round((doneCount / totalCount) * 100)}%`
}

function parseDurationMs(duration: string): number {
  const match = duration.match(/^([\d.]+)(ms|s)$/)
  if (!match) return 1100
  return match[2] === 'ms' ? parseFloat(match[1]) : parseFloat(match[1]) * 1000
}

function defaultDurationMsForAction(action: string): number {
  switch (action) {
    case 'Navigate':
      return 3200
    case 'Type':
      return 1400
    case 'Verify':
      return 480
    default:
      return 720
  }
}

function stepDurationMs(step: JourneyStep): number {
  if (step.duration) return parseDurationMs(step.duration)
  return defaultDurationMsForAction(step.action)
}

const MONITORING_LOCATIONS = ['Paris', 'Frankfurt', 'London', 'New York'] as const

const SLOW_STEP_THRESHOLDS_MS: Record<string, number> = {
  Navigate: 5000,
  Click: 1200,
  Type: 2000,
  Verify: 800,
}

function formatExecutedAt(stepIndex: number, allSteps: JourneyStep[]): string {
  let msBefore = 0
  for (let i = 0; i < stepIndex; i++) {
    const prior = allSteps[i]
    if (prior.status === 'done' || prior.status === 'failed') {
      msBefore += stepDurationMs(prior)
    }
  }
  const executedAt = new Date(Date.now() - msBefore)
  return `Today at ${executedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export function defaultStepDurationForAction(action: string): string {
  return formatMs(defaultDurationMsForAction(action))
}

export function formatMonitoringDuration(duration: string): string {
  return formatMs(parseDurationMs(duration))
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function previewCaptionForStep(step: JourneyStep): string {
  switch (step.action) {
    case 'Navigate':
      return 'Page loaded successfully'
    case 'Click':
      return 'Element clicked as expected'
    case 'Type':
      return 'Text entered in the field'
    case 'Verify':
      return 'Check passed — element visible'
    default:
      return 'Step completed'
  }
}

export function getStepMonitoringMetrics(
  step: JourneyStep,
  index: number,
  allSteps: JourneyStep[] = [],
): StepMonitoringMetrics {
  const isFailing = step.status === 'failed'
  const expectedMs = stepDurationMs(step)
  const stepMs = isFailing ? Math.round(expectedMs * 0.72) : expectedMs
  const isPageLoad = step.action === 'Navigate'
  const slowThreshold = SLOW_STEP_THRESHOLDS_MS[step.action] ?? 1500
  const isDegraded = !isFailing && expectedMs > slowThreshold

  const readyMs = isPageLoad ? Math.round(stepMs * 0.22) : Math.round(stepMs * 0.55)
  const lcpMs = isPageLoad ? Math.round(stepMs * 0.48) : null
  const loadMs = isPageLoad ? Math.round(stepMs * 0.82) : null

  const showInteractionMetrics = !isFailing && (isPageLoad || step.action === 'Type' || step.action === 'Click')

  return {
    stepDuration: formatMs(stepMs),
    readyForUser: showInteractionMetrics ? formatMs(readyMs) : null,
    mainContentVisible: !isFailing && lcpMs !== null ? formatMs(lcpMs) : null,
    pageFullyLoaded: !isFailing && loadMs !== null ? formatMs(loadMs) : null,
    layoutStability: isFailing ? 'Unstable' : isDegraded ? 'Mostly stable' : 'Stable',
    status: isFailing ? 'failing' : isDegraded ? 'degraded' : 'ok',
    statusLabel: isFailing ? 'Not working' : isDegraded ? 'Needs attention' : 'Working well',
    insight: isFailing
      ? 'This step could not finish — the page may have changed since the journey was recorded.'
      : isDegraded
        ? `This step took ${formatMs(expectedMs)} — slower than the ${formatMs(slowThreshold)} target for ${step.action} actions.`
        : undefined,
    executedAt: formatExecutedAt(index, allSteps.length > 0 ? allSteps : [step]),
    location: MONITORING_LOCATIONS[index % MONITORING_LOCATIONS.length],
    previewCaption: isFailing
      ? 'Expected element was not found on the page'
      : previewCaptionForStep(step),
  }
}
