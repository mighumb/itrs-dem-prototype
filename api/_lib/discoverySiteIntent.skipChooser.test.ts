/**
 * Runnable with: npx tsx api/_lib/discoverySiteIntent.skipChooser.test.ts
 */
import assert from 'node:assert/strict'
import {
  hasConcreteJourneyDetail,
  shouldSkipJourneyChooser,
  summarizeStatedJourneyIntent,
} from './discoverySiteIntent'

const MBAPPE =
  'je souhaite surveiller la page wikipedia de Kylian Mbappé son palmarès en sélection nationale'

const cases: Array<{ label: string; text: string; skip: boolean }> = [
  { label: 'Wikipedia Mbappé palmarès', text: MBAPPE, skip: true },
  { label: 'vague brand only', text: 'surveiller Amazon', skip: false },
  { label: 'vague monitor verb', text: 'je veux monitorer EasyJet', skip: false },
  {
    label: 'checkout journey',
    text: "acheter un produit sur le site Amazon jusqu'à la livraison",
    skip: true,
  },
  {
    label: 'brochure + deep URL',
    text: 'télécharger la brochure https://www.hetic.net/brochure',
    skip: true,
  },
  { label: 'deep URL only', text: 'https://www.hetic.net/brochure', skip: false },
  {
    label: 'asking for ideas',
    text: 'quel parcours me recommandes-tu pour Amazon ?',
    skip: false,
  },
  {
    label: 'wiki subject without section',
    text: 'surveiller la page wikipedia de Kylian Mbappé',
    skip: true,
  },
]

for (const { label, text, skip } of cases) {
  assert.equal(
    shouldSkipJourneyChooser(text),
    skip,
    `${label}: expected skip=${skip}, got ${shouldSkipJourneyChooser(text)} (stated=${summarizeStatedJourneyIntent(text)}, detail=${hasConcreteJourneyDetail(text)})`,
  )
}

console.log(`OK — ${cases.length} shouldSkipJourneyChooser cases passed`)
