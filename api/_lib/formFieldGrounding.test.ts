/**
 * Runnable with: npx tsx api/_lib/formFieldGrounding.test.ts
 */
import assert from 'node:assert/strict'
import {
  fieldMatchesObserved,
  observedFormInventory,
  stripUnobservedFormSteps,
} from './formFieldGrounding.js'
import type { SiteExploreResult } from './exploreSite.js'

const brochureExplore: SiteExploreResult = {
  ok: true,
  url: 'https://www.hetic.net/brochure',
  reason: null,
  method: 'playwright',
  pagesVisited: 1,
  title: 'Brochure',
  snapshot: null,
  pages: [
    {
      url: 'https://www.hetic.net/brochure',
      title: 'Brochure',
      heading: 'Brochure',
      links: [],
      buttons: ['Je télécharge la brochure'],
      forms: [
        {
          action: null,
          fields: ['nom', 'prenom', 'email', 'galileo_phone_number', 'text'],
        },
      ],
    },
  ],
}

const inv = observedFormInventory(brochureExplore)
assert.ok(inv)
assert.equal(inv!.hasCheckbox, false)
assert.equal(fieldMatchesObserved('Email', inv!), true)
assert.equal(fieldMatchesObserved('Téléphone', inv!), true)

const polluted = [
  { action: 'Navigate', label: 'Naviguer vers la brochure' },
  { action: 'Type', label: 'Saisir « Dupont » dans Nom' },
  { action: 'Type', label: 'Saisir « miguel@example.com » dans Email' },
  { action: 'Click', label: 'Cocher la case d’acceptation RGPD' },
  { action: 'Verify', label: 'Vérifier que la case consentement est cochée' },
]

const cleaned = stripUnobservedFormSteps(polluted, brochureExplore)
assert.equal(
  cleaned.some((s) => /rgpd|consent|cocher/i.test(s.label)),
  false,
  'must drop invented checkbox/consent steps when explore has no checkbox',
)
assert.equal(
  cleaned.some((s) => /email/i.test(s.label)),
  true,
  'observed Type fields must survive',
)

const withInventedField = stripUnobservedFormSteps(
  [
    { action: 'Type', label: 'Saisir « Dupont » dans Nom' },
    { action: 'Type', label: 'Saisir « Acme » dans Société' },
  ],
  brochureExplore,
)
assert.equal(withInventedField.length, 1, 'drop Type into fields absent from explore inventory')

// No form evidence → do not strip (hypothesis mode).
const noFormExplore: SiteExploreResult = {
  ...brochureExplore,
  pages: [{ ...brochureExplore.pages[0]!, forms: [] }],
}
const unchanged = stripUnobservedFormSteps(polluted, noFormExplore)
assert.equal(unchanged.length, polluted.length)

// Checkbox present when explore reports one.
const withCheckboxExplore: SiteExploreResult = {
  ...brochureExplore,
  pages: [
    {
      ...brochureExplore.pages[0]!,
      forms: [{ action: null, fields: ['nom', 'email', 'checkbox'] }],
    },
  ],
}
const withCb = stripUnobservedFormSteps(polluted, withCheckboxExplore)
assert.equal(
  withCb.some((s) => /rgpd|consent|cocher/i.test(s.label)),
  true,
  'keep consent step when checkbox is in observed inventory',
)

console.log('OK — form field grounding cases passed')
