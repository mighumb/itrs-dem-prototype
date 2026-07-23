export type Screen = 'home' | 'new-journey'

export type StepStatus = 'pending' | 'running' | 'done' | 'failed'

export interface JourneyStep {
  id: string
  label: string
  action: string
  duration?: string
  status: StepStatus
  target?: string
  timeout?: string
}

export interface ChatMessage {
  id: string
  role: 'agent' | 'user'
  content: string
  actions?: ChatAction[]
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
  matchPrompts: string[]
  steps: Omit<JourneyStep, 'status'>[]
  browserFrames: BrowserFrame[]
  monitoring: JourneyMonitoringPreview
}

export function scheduleSummary(schedule: JourneySchedule): string {
  return `${schedule.frequency} · ${schedule.locations.join(' + ')} · ${schedule.activeHours}`
}
