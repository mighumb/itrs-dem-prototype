/**
 * Runnable with: npx tsx api/_lib/discoverySiteIntent.outcomeConflict.test.ts
 */
import assert from 'node:assert/strict'
import {
  extractJourneyOutcomeSignals,
  journeyOutcomesConflict,
  shouldInvalidateSettledPlan,
} from './discoverySiteIntent.js'

const downloadPlanSteps = [
  { action: 'Type', label: 'Saisir email' },
  {
    action: 'Click',
    label: 'Cliquer sur « Je télécharge la brochure »',
    targetHint: 'Je télécharge la brochure',
  },
]

// Alternate phrasings — not the stock HETIC sentence.
const pivots = [
  'Arrête le téléchargement, je veux juste tester les champs du formulaire',
  'Without download — only fill the form fields',
  'Plus besoin de soumettre, uniquement remplir les champs',
  "Stop the download step, I only need to validate inputs",
]

for (const pivot of pivots) {
  const signals = extractJourneyOutcomeSignals(pivot)
  assert.ok(
    signals.negative.includes('download') || signals.negative.includes('submit'),
    `expected rejected download/submit in ${JSON.stringify(signals)} for: ${pivot}`,
  )
  assert.ok(
    journeyOutcomesConflict('télécharger la brochure HETIC', pivot),
    `expected conflict with prior download seed for: ${pivot}`,
  )
  assert.equal(
    shouldInvalidateSettledPlan({
      latestMessage: pivot,
      seed: 'télécharger la brochure',
      planSteps: downloadPlanSteps,
    }),
    true,
    `settled download plan must invalidate for: ${pivot}`,
  )
}

// Benign negation unrelated to the settled plan should not force invalidation.
assert.equal(
  shouldInvalidateSettledPlan({
    latestMessage: 'pas besoin de connexion sur ce site',
    seed: 'télécharger la brochure',
    planSteps: downloadPlanSteps,
  }),
  false,
  'login negation alone should not invalidate a download-only plan',
)

console.log('OK — structural outcome conflict cases passed')
