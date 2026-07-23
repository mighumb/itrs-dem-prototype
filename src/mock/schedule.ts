import type { JourneySchedule } from '../types'

export const DEFAULT_SCHEDULE: JourneySchedule = {
  frequency: 'Every 15 minutes',
  locations: ['Paris', 'Frankfurt'],
  activeHours: '24/7',
}
