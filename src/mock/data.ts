import type {
  BrowserFrame,
  ChatMessage,
  JourneyStep,
  JourneyTemplate,
  StepMonitoringMetrics,
} from '../types'
import { tf, type Locale } from '../i18n/messages'

/** Homepage sample cards — company + short journey title (not full step-by-step prompts). */
export type HomeJourneyExample = {
  id: 'salesforce' | 'axa' | 'totalenergies' | 'airbnb'
  company: string
  logoSrc: string
  url: string
  journeyTitle: { en: string; fr: string }
  /** Seed passed to Gemini (site + journey intent; params collected only if needed). */
  seed: { en: string; fr: string }
}

export const HOME_JOURNEY_EXAMPLES: readonly HomeJourneyExample[] = [
  {
    id: 'salesforce',
    company: 'Salesforce',
    logoSrc: '/logos/salesforce.svg',
    url: 'https://www.salesforce.com',
    journeyTitle: {
      en: 'Products → pricing → free trial',
      fr: 'Produits → tarifs → essai gratuit',
    },
    seed: {
      en: 'Monitor https://www.salesforce.com — journey: prove a real multi-step free-trial funnel works. Path: (1) open homepage (2) click "See all products" or "Agentforce" (3) verify product content (4) click "See full pricing" (5) verify pricing plans (6) click "Start for free" (7) on the trial form, TYPE a work email the user provides (8) verify the form accepts it / next state is visible. Ask the user for a work email before building the plan — do not invent one. Stop before password / Sales Cloud login / submitting a real account if a password gate appears.',
      fr: 'Monitorer https://www.salesforce.com — parcours : prouver qu’un vrai funnel multi-étapes d’essai gratuit fonctionne. Chemin : (1) ouvrir l’accueil (2) cliquer « See all products » ou « Agentforce » (3) vérifier le contenu produit (4) cliquer « See full pricing » (5) vérifier les offres tarifaires (6) cliquer « Start for free » (7) sur le formulaire d’essai, SAISIR un e-mail pro fourni par l’utilisateur (8) vérifier que le formulaire l’accepte / que l’état suivant est visible. Demander l’e-mail pro à l’utilisateur avant de construire le plan — ne pas l’inventer. S’arrêter avant mot de passe / login Sales Cloud / création de compte réelle si une étape password apparaît.',
    },
  },
  {
    id: 'axa',
    company: 'AXA',
    logoSrc: '/logos/axa.svg',
    url: 'https://www.axa.fr',
    journeyTitle: {
      en: 'Get a car insurance quote',
      fr: 'Obtenir un devis assurance auto',
    },
    seed: {
      en: 'Monitor https://www.axa.fr — journey: Get a car insurance quote.',
      fr: 'Monitorer https://www.axa.fr — parcours : Obtenir un devis assurance auto.',
    },
  },
  {
    id: 'totalenergies',
    company: 'TotalEnergies',
    logoSrc: '/logos/totalenergies.svg',
    url: 'https://www.totalenergies.fr',
    journeyTitle: {
      en: 'Find a nearby station',
      fr: 'Trouver une station proche',
    },
    seed: {
      en: 'Monitor https://www.totalenergies.fr — journey: Find a nearby station.',
      fr: 'Monitorer https://www.totalenergies.fr — parcours : Trouver une station proche.',
    },
  },
  {
    id: 'airbnb',
    company: 'Airbnb',
    logoSrc: '/logos/airbnb.svg',
    url: 'https://www.airbnb.com',
    journeyTitle: {
      en: 'Search for a stay',
      fr: 'Rechercher un séjour',
    },
    seed: {
      en: 'Monitor https://www.airbnb.com — journey: Search for a stay. Public path: open homepage → use search (destination / dates / guests) → submit Search → verify homes results are shown.',
      fr: 'Monitorer https://www.airbnb.com — parcours : Rechercher un séjour. Chemin public : ouvrir l’accueil → utiliser la recherche (destination / dates / voyageurs) → lancer Search → vérifier que des logements s’affichent.',
    },
  },
] as const

export function getHomeExamples(_locale: Locale | 'en' | 'fr'): readonly HomeJourneyExample[] {
  return HOME_JOURNEY_EXAMPLES
}

export function isCuratedHomeExample(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  return HOME_JOURNEY_EXAMPLES.some(
    (example) =>
      example.seed.en.toLowerCase() === normalized ||
      example.seed.fr.toLowerCase() === normalized ||
      example.journeyTitle.en.toLowerCase() === normalized ||
      example.journeyTitle.fr.toLowerCase() === normalized ||
      `${example.company} — ${example.journeyTitle.en}`.toLowerCase() === normalized ||
      `${example.company} — ${example.journeyTitle.fr}`.toLowerCase() === normalized,
  )
}

export function getBrowserFrameForStep(step: JourneyStep, index: number): BrowserFrame {
  const urlFromLabel = step.label.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '')
  const url =
    (step.target?.startsWith('http') ? step.target : null) ??
    urlFromLabel ??
    'about:blank'

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

export function buildJourneyReadyMessage(journey: JourneyTemplate, locale: Locale = 'en'): ChatMessage {
  return {
    id: 'done-1',
    role: 'agent',
    content: tf(locale, 'journeyReady', { name: journey.name, count: journey.steps.length }),
  }
}

export function buildScheduleMessage(locale: Locale = 'en'): ChatMessage {
  return {
    id: 'done-2',
    role: 'agent',
    content: tf(locale, 'suggestedSchedule', {}),
    actions: [
      { id: 'accept-schedule', label: tf(locale, 'scheduleOptionPrimary', {}), variant: 'primary' },
      { id: 'custom-schedule', label: tf(locale, 'scheduleCustomize', {}), variant: 'secondary' },
      { id: 'skip-schedule', label: tf(locale, 'scheduleSkip', {}), variant: 'secondary' },
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

export function applyAgentStepFix(
  step: JourneyStep,
  locale: Locale = 'en',
): { step: JourneyStep; changeSummary: string } {
  const previousTarget = step.target ?? step.label
  let newTarget = step.target
  const label = step.label.toLowerCase()

  if (/cookie|bandeau|consent|rgpd|gdpr/i.test(label)) {
    newTarget =
      '#onetrust-accept-btn-handler, button:has-text("Accept"), button:has-text("Tout accepter"), [aria-label*="accept" i]'
  } else if (step.action === 'Click') {
    newTarget = step.target?.includes(',')
      ? step.target
      : `[data-testid="${step.id}-target"], button, a, [role="button"]`
  } else if (step.action === 'Type') {
    newTarget = step.target?.includes(',')
      ? step.target
      : `${step.target ?? 'input, textarea'}, input[autocomplete="off"]`
  } else if (step.action === 'Verify') {
    newTarget = step.target ?? 'body, main, h1'
  }

  const changeSummary =
    newTarget && newTarget !== step.target
      ? tf(locale, 'fixLocatorUpdated', {
          label: step.label,
          from: previousTarget,
          to: newTarget,
        })
      : tf(locale, 'fixLocatorRefreshed', { label: step.label })

  return {
    step: { ...step, status: 'pending', target: newTarget ?? step.target },
    changeSummary,
  }
}

export function buildRunOutcomeMessage(
  failedStep: RunFailureInfo | null,
  totalSteps?: number,
  locale: Locale = 'en',
): ChatMessage {
  if (!failedStep) {
    return {
      id: RUN_OUTCOME_MESSAGE_ID,
      role: 'agent',
      content:
        totalSteps && totalSteps > 0
          ? tf(locale, 'runCompleteAll', { count: totalSteps })
          : tf(locale, 'runComplete', {}),
    }
  }

  const stepNumber = failedStep.stepIndex + 1
  return {
    id: RUN_OUTCOME_MESSAGE_ID,
    role: 'agent',
    content: tf(locale, 'runStoppedAt', { n: stepNumber, label: failedStep.stepLabel }),
    actions: [{ id: 'fix-auto-continue', label: tf(locale, 'fixAndContinue', {}), variant: 'primary' }],
  }
}

export function applyPostRunMessages(
  messages: ChatMessage[],
  journey: JourneyTemplate,
  failedStep: RunFailureInfo | null,
  options?: { addJourneyReady?: boolean; locale?: Locale },
): ChatMessage[] {
  const locale = options?.locale ?? 'en'
  let next = withoutTransientRunMessages(messages)

  if (options?.addJourneyReady && !next.some((message) => message.id === 'done-1')) {
    next = [...next, buildJourneyReadyMessage(journey, locale)]
  }

  if (failedStep) {
    next = next.filter((message) => message.id !== 'done-2')
  } else if (!next.some((message) => message.id === 'done-2')) {
    next = [...next, buildScheduleMessage(locale)]
  }

  return [...next, buildRunOutcomeMessage(failedStep, journey.steps.length, locale)]
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

export function computeRunMonitoringKpi(
  steps: JourneyStep[],
  locale: Locale = 'en',
): {
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
      failingSteps: formatFailingStepsLabel(0, locale),
    }
  }

  const totalMs = executed.reduce((sum, step) => sum + stepDurationMs(step), 0)

  return {
    availability: formatAvailabilityPercent(doneCount, steps.length),
    totalTime: formatMs(totalMs),
    failingSteps: formatFailingStepsLabel(failedCount, locale),
  }
}

export function formatFailingStepsLabel(failedCount: number, locale: Locale = 'en'): string {
  if (failedCount === 0) return tf(locale, 'zeroIssues', {})
  if (failedCount === 1) return tf(locale, 'oneIssue', {})
  return tf(locale, 'nIssues', { count: failedCount })
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

function formatExecutedAt(stepIndex: number, allSteps: JourneyStep[], locale: Locale): string {
  let msBefore = 0
  for (let i = 0; i < stepIndex; i++) {
    const prior = allSteps[i]
    if (prior.status === 'done' || prior.status === 'failed') {
      msBefore += stepDurationMs(prior)
    }
  }
  const executedAt = new Date(Date.now() - msBefore)
  const time = executedAt.toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return tf(locale, 'todayAt', { time })
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

function previewCaptionForStep(step: JourneyStep, locale: Locale): string {
  switch (step.action) {
    case 'Navigate':
      return tf(locale, 'captionNavigate', {})
    case 'Click':
      return tf(locale, 'captionClick', {})
    case 'Type':
      return tf(locale, 'captionType', {})
    case 'Verify':
      return tf(locale, 'captionVerify', {})
    default:
      return tf(locale, 'captionDefault', {})
  }
}

export function getStepMonitoringMetrics(
  step: JourneyStep,
  index: number,
  allSteps: JourneyStep[] = [],
  locale: Locale = 'en',
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

  const showInteractionMetrics =
    !isFailing && (isPageLoad || step.action === 'Type' || step.action === 'Click')

  return {
    stepDuration: formatMs(stepMs),
    readyForUser: showInteractionMetrics ? formatMs(readyMs) : null,
    mainContentVisible: !isFailing && lcpMs !== null ? formatMs(lcpMs) : null,
    pageFullyLoaded: !isFailing && loadMs !== null ? formatMs(loadMs) : null,
    layoutStability: isFailing
      ? tf(locale, 'layoutUnstable', {})
      : isDegraded
        ? tf(locale, 'layoutMostlyStable', {})
        : tf(locale, 'layoutStable', {}),
    status: isFailing ? 'failing' : isDegraded ? 'degraded' : 'ok',
    statusLabel: isFailing
      ? tf(locale, 'statusNotWorking', {})
      : isDegraded
        ? tf(locale, 'statusNeedsAttention', {})
        : tf(locale, 'statusWorkingWell', {}),
    insight: isFailing
      ? tf(locale, 'insightStepFailing', {})
      : isDegraded
        ? tf(locale, 'insightStepDegraded', {
            duration: formatMs(expectedMs),
            target: formatMs(slowThreshold),
            action: step.action,
          })
        : undefined,
    executedAt: formatExecutedAt(index, allSteps.length > 0 ? allSteps : [step], locale),
    location: MONITORING_LOCATIONS[index % MONITORING_LOCATIONS.length],
    previewCaption: isFailing
      ? tf(locale, 'previewCaptionFailing', {})
      : previewCaptionForStep(step, locale),
  }
}
