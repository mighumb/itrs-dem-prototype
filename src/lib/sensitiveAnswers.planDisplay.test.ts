/**
 * Runnable with: npx tsx src/lib/sensitiveAnswers.planDisplay.test.ts
 */
import assert from 'node:assert/strict'
import { formatPlanMessage } from '../mock/discovery.ts'
import { maskSensitiveDisplayText } from './sensitiveAnswers.ts'

assert.match(
  maskSensitiveDisplayText('Saisir « miguelhumberto25@gmail.com » dans Email'),
  /m•+@gmail\.com/,
)
assert.doesNotMatch(
  maskSensitiveDisplayText('Saisir « miguelhumberto25@gmail.com » dans Email'),
  /miguelhumberto25@gmail\.com/,
)

const planMsg = formatPlanMessage({
  summary: 'Parcours brochure',
  steps: [
    { id: '1', action: 'Type', label: 'Saisir « miguelhumberto25@gmail.com » dans Email' },
    { id: '2', action: 'Click', label: 'Cliquer sur Brochure' },
  ],
})
assert.doesNotMatch(planMsg, /miguelhumberto25@gmail\.com/)
assert.match(planMsg, /m•+@gmail\.com/)
assert.match(planMsg, /Cliquer sur Brochure/)

console.log('OK — sensitive plan display cases passed')
