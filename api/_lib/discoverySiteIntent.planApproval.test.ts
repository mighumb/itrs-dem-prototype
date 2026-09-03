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
  "c'est good",
  "c'est good.",
  "oui c'est good",
  "it's good",
  'sounds good',
  'looks good',
  'all good',
  'oui',
  'ça me va',
  'ca marche',
]) {
  assert.equal(looksLikePlanApprovalOnly(phrase), true, `should approve: ${phrase}`)
}

assert.equal(looksLikePlanApprovalOnly('lance le parcours'), false)
assert.equal(looksLikePlanApprovalOnly('ajoute une étape'), false)
assert.equal(looksLikePlanApprovalOnly('non merci'), false)
assert.equal(looksLikePlanApprovalOnly('change step 2'), false)

assert.equal(
  isSettledPlanApprovalTurn({
    mode: 'iterate',
    userMessage: "c'est good",
    currentSteps: [{ label: 'Navigate', action: 'Go' }],
  }),
  true,
)

assert.equal(
  isSettledPlanApprovalTurn({
    mode: 'iterate',
    userMessage: "c'est good",
    currentSteps: [],
  }),
  false,
)

console.log('discoverySiteIntent.planApproval: ok')
