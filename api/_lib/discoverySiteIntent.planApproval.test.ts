/**
 * Runnable with: npx tsx api/_lib/discoverySiteIntent.planApproval.test.ts
 */
import assert from 'node:assert/strict'
import {
  isSettledPlanApprovalTurn,
  looksLikePlanApprovalOnly,
} from './discoverySiteIntent'

for (const phrase of [
  "oui c'est bon",
  "oui, c'est bon",
  'ok parfait',
  "c'est bon",
  'oui',
  'ça me va',
]) {
  assert.equal(looksLikePlanApprovalOnly(phrase), true, phrase)
}

assert.equal(looksLikePlanApprovalOnly('lance le parcours'), false)
assert.equal(looksLikePlanApprovalOnly('ajoute une étape'), false)
assert.equal(looksLikePlanApprovalOnly('non merci'), false)

assert.equal(
  isSettledPlanApprovalTurn({
    mode: 'iterate',
    userMessage: "oui c'est bon",
    currentSteps: [{ label: 'Navigate', action: 'Go' }],
  }),
  true,
)

assert.equal(
  isSettledPlanApprovalTurn({
    mode: 'iterate',
    userMessage: "oui c'est bon",
    currentSteps: [],
  }),
  false,
)

console.log('discoverySiteIntent.planApproval: ok')
