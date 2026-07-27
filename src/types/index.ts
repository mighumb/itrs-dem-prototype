import { localizeScheduleValue, type Locale } from '../i18n/messages'

export type Screen = 'home' | 'new-journey'

export type StepStatus = 'pending' | 'running' | 'done' | 'failed'

export interface JourneyStep {
  id: string
  label: string
  action: string
  duration?: string
  status: StepStatus
  target?: string
  /** Visible link/button text from site explore. */
  targetHint?: string
  /** Absolute URL observed for this step. */
  href?: string
  timeout?: string
}

export interface ChatAttachment {
  id: string
  filename: string
  mimeType: string
  /** Full file body for download — never rendered as message text. */
  text: string
}

export interface ChatMessage {
  id: string
  role: 'agent' | 'user'
  content: string
  actions?: ChatAction[]
  /** Optional downloadable file chip (e.g. recorded journey JSON). */
  attachment?: ChatAttachment
}

export interface ChatAction {
  id: string
  label: string
  variant?: 'primary' | 'secondary'
}

export interface BrowserFrame {
  url: string
  title: string
  highlight?: string
  cursor?: { x: number; y: number }
  /** Real Playwright JPEG/PNG data URL when live run is active */
  screenshotDataUrl?: string
}

export interface JourneySchedule {
  frequency: string
  locations: string[]
  activeHours: string
}

export interface StepMonitoringMetrics {
  stepDuration: string
  readyForUser: string | null
  mainContentVisible: string | null
  pageFullyLoaded: string | null
  layoutStability: string
  status: 'ok' | 'failing' | 'degraded'
  statusLabel: string
  insight?: string
  executedAt: string
  location: string
  previewCaption: string
}

/** Real metrics from the latest Playwright (or simulated) run — overwrites Monitoring each run. */
export interface LastRunStepMetric {
  stepId: string
  index: number
  label: string
  status: 'done' | 'failed'
  durationMs: number
  url?: string
  title?: string
  error?: string
  screenshotDataUrl?: string
}

export interface LastRunSnapshot {
  mode: 'playwright' | 'simulated'
  finishedAt: number
  steps: LastRunStepMetric[]
}

export interface JourneyMonitoringPreview {
  kpi: {
    availability: string
    totalTime: string
    failingSteps: string
  }
  failingStepIndex?: number
  alertTitle?: string
  alertMessage?: string
  lastRunLabel?: string
  alertSeverity?: 'warning' | 'error'
}

export interface JourneyTemplate {
  id: string
  name: string
  steps: Omit<JourneyStep, 'status'>[]
  browserFrames: BrowserFrame[]
  monitoring: JourneyMonitoringPreview
}

export function scheduleSummary(schedule: JourneySchedule, locale: Locale = 'en'): string {
  const frequency = localizeScheduleValue(locale, schedule.frequency)
  const activeHours = localizeScheduleValue(locale, schedule.activeHours)
  const locations = schedule.locations
    .map((loc) => localizeScheduleValue(locale, loc))
    .join(' + ')
  return `${frequency} · ${locations} · ${activeHours}`
}
