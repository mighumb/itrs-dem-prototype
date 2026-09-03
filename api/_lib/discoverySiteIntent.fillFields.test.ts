/**
 * Runnable with: npx tsx api/_lib/discoverySiteIntent.fillFields.test.ts
 */
import assert from 'node:assert/strict'
import {
  isFillFieldsWithoutSubmitAsk,
  resolveStatedJourneyIntent,
  summarizeStatedJourneyIntent,
} from './discoverySiteIntent.js'
import { ensureProposalsHonorStatedIntent } from './proposalIntentGuard.js'

const pivot =
  "Je ne veux pas télécharger le brochure, seulement tester les champs de saisie d'informations"

assert.equal(isFillFieldsWithoutSubmitAsk(pivot), true)
assert.match(
  summarizeStatedJourneyIntent(pivot) ?? '',
  /sans télécharger|without download/i,
)
assert.match(
  resolveStatedJourneyIntent(pivot, 'télécharger la brochure HETIC', 'fr') ?? '',
  /Remplir|tester|champs/i,
)
assert.doesNotMatch(
  resolveStatedJourneyIntent(pivot, 'télécharger la brochure HETIC', 'fr') ?? '',
  /^télécharger la brochure/i,
)

const guarded = ensureProposalsHonorStatedIntent(
  [
    {
      id: 'stale-download',
      title: 'Télécharger via Ressources',
      description: 'Depuis l’accueil, ouvrir Ressources et télécharger.',
      prompt: 'Télécharger le livre blanc',
    },
  ],
  resolveStatedJourneyIntent(pivot, 'télécharger la brochure', 'fr'),
  { preferredLanguage: 'fr', destinationUrl: 'https://www.hetic.net/brochure' },
)

assert.ok(guarded && guarded.length >= 1)
assert.equal(
  guarded!.some((p) => /t[eé]l[eé]charg|download/i.test(p.title)),
  false,
  'must not keep download proposals after fill-only pivot',
)
assert.match(guarded![0]!.title, /Remplir|champs|Fill|fields/i)

console.log('OK — fill-fields-without-submit intent cases passed')
