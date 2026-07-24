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
  id: 'salesforce' | 'axa' | 'amazon' | 'airbnb'
  company: string
  logoSrc: string
  url: string
  journeyTitle: { en: string; fr: string }
  /** Seed passed to Gemini (site + journey intent; params collected only if needed). */
  seed: { en: string; fr: string }
}

const SAMPLE_ACTION_RULES_EN =
  'Hard rules for the plan: intermediate steps only Navigate, Click, or Type. At most ONE Verify, and only as the final step. Do not invent extra Verify steps to pad the journey.'

const SAMPLE_ACTION_RULES_FR =
  'Règles dures pour le plan : étapes intermédiaires uniquement Navigate, Click ou Type. Au plus UN Verify, uniquement en dernière étape. Ne pas inventer de Verify pour gonfler le parcours.'

export const HOME_JOURNEY_EXAMPLES: readonly HomeJourneyExample[] = [
  {
    id: 'salesforce',
    company: 'Salesforce',
    logoSrc: '/logos/salesforce.svg',
    url: 'https://www.salesforce.com',
    journeyTitle: {
      en: 'Start a free trial',
      fr: 'Démarrer un essai gratuit',
    },
    seed: {
      en: `Monitor https://www.salesforce.com — journey: prove a real free-trial funnel. Required actions: Navigate homepage → Click "See all products" or "Agentforce" → Click "See full pricing" → Click "Start for free" → Type the user-provided work email on the trial form → final Verify the email field/next state reflects the input. Ask for a work email before building the plan — do not invent one. Stop before password / Sales Cloud login. ${SAMPLE_ACTION_RULES_EN}`,
      fr: `Monitorer https://www.salesforce.com — parcours : prouver un vrai funnel d’essai gratuit. Actions requises : Navigate accueil → Click « See all products » ou « Agentforce » → Click « See full pricing » → Click « Start for free » → Type l’e-mail pro fourni par l’utilisateur sur le formulaire d’essai → Verify final que le champ/état suivant reflète la saisie. Demander l’e-mail pro avant le plan — ne pas l’inventer. S’arrêter avant mot de passe / login Sales Cloud. ${SAMPLE_ACTION_RULES_FR}`,
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
      en: `Monitor https://www.axa.fr — journey: car insurance quote with real form actions. Required actions: Navigate homepage → Click auto / vehicle insurance → Click to start a quote → Type user-provided values the quote needs (e.g. postal code / vehicle info — ask only for what steps need) → Click continue/next as far as the public flow allows → final Verify a quote step or summary is shown. ${SAMPLE_ACTION_RULES_EN}`,
      fr: `Monitorer https://www.axa.fr — parcours : devis assurance auto avec de vraies actions formulaire. Actions requises : Navigate accueil → Click assurance auto / véhicules → Click pour démarrer un devis → Type les valeurs fournies par l’utilisateur nécessaires au devis (ex. code postal / infos véhicule — demander seulement ce dont les steps ont besoin) → Click continuer/suivant aussi loin que le parcours public le permet → Verify final qu’une étape de devis ou un récap s’affiche. ${SAMPLE_ACTION_RULES_FR}`,
    },
  },
  {
    id: 'amazon',
    company: 'Amazon',
    logoSrc: '/logos/amazon.svg',
    url: 'https://www.amazon.com',
    journeyTitle: {
      en: 'Search and add a product to cart',
      fr: 'Rechercher et ajouter un produit au panier',
    },
    seed: {
      en: `Monitor https://www.amazon.com — journey: ecommerce add-to-cart with real actions. Required actions: Navigate homepage → Type a user-provided search query → Click/submit search → Click a product result → Click "Add to cart" → final Verify the cart reflects the added item (cart count or cart page). Ask for the search query before building the plan — do not invent a SKU. Stop before checkout/payment/login. ${SAMPLE_ACTION_RULES_EN}`,
      fr: `Monitorer https://www.amazon.com — parcours : e-commerce ajout panier avec de vraies actions. Actions requises : Navigate accueil → Type une requête de recherche fournie par l’utilisateur → Click/submit recherche → Click un produit dans les résultats → Click « Add to cart » → Verify final que le panier reflète l’ajout (compteur ou page panier). Demander la requête de recherche avant le plan — ne pas inventer de SKU. S’arrêter avant checkout/paiement/login. ${SAMPLE_ACTION_RULES_FR}`,
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
      en: `Monitor https://www.airbnb.com — journey: stay search with real search actions. Required actions: Navigate homepage → Type a user-provided destination → Click/set dates if the UI requires it (suggested defaults only if user delegates) → Click guests if needed → Click "Search" → final Verify homes/results are listed. Ask for the destination before building the plan. ${SAMPLE_ACTION_RULES_EN}`,
      fr: `Monitorer https://www.airbnb.com — parcours : recherche de séjour avec de vraies actions. Actions requises : Navigate accueil → Type une destination fournie par l’utilisateur → Click/renseigner les dates si l’UI l’exige (defaults suggérés seulement si délégation) → Click voyageurs si besoin → Click « Search » → Verify final que des logements/résultats s’affichent. Demander la destination avant le plan. ${SAMPLE_ACTION_RULES_FR}`,
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
