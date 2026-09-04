/**
 * Runnable with: npx tsx api/_lib/downloadPlanGrounding.test.ts
 */
import assert from 'node:assert/strict'
import { applyGroundingToPlan, type GroundedPlanStep } from './planGrounding.js'
import {
  applyDownloadPlanGrounding,
  shouldApplyDownloadPlanGrounding,
  stripPostDownloadSectionSteps,
} from './downloadPlanGrounding.js'
import type { SiteExploreResult } from './exploreSite.js'

const itrsExplore: SiteExploreResult = {
  ok: true,
  url: 'https://www.itrsgroup.com/solutions/observability-education',
  reason: null,
  method: 'playwright',
  pagesVisited: 1,
  title: 'Education',
  snapshot: null,
  pages: [
    {
      url: 'https://www.itrsgroup.com/solutions/observability-education#use-cases',
      title: 'Education',
      heading: 'Boost your digital experience',
      links: [],
      buttons: ['Download the solution brief', 'Book a demo'],
      forms: [],
    },
  ],
}

const heticExplore: SiteExploreResult = {
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
          fields: ['Nom', 'Prénom', 'Email', 'Téléphone'],
        },
      ],
    },
  ],
}

const statedItsr =
  'https://www.itrsgroup.com/solutions/observability-education#use-cases Download the solution brief'

assert.equal(
  shouldApplyDownloadPlanGrounding(statedItsr, itrsExplore.url, itrsExplore),
  true,
)

const pollutedItsr: GroundedPlanStep[] = [
  { action: 'Navigate', label: 'Open the homepage', href: 'https://www.itrsgroup.com/' },
  {
    action: 'Type',
    label: 'Search for "observability education"',
    targetHint: 'observability education',
  },
  {
    action: 'Click',
    label: 'Open "observability education"',
    targetHint: 'observability education',
  },
  { action: 'Click', label: 'Click "Accept all" for cookies', targetHint: 'Accept all' },
  {
    action: 'Click',
    label: 'Click "Download Solution Brief" button',
    targetHint: 'Download Solution Brief',
  },
  { action: 'Click', label: 'Open the "use-cases" section', targetHint: 'use-cases' },
  { action: 'Verify', label: 'Verify the "use-cases" section', targetHint: 'use-cases' },
]

const itrsRewritten = applyDownloadPlanGrounding(
  pollutedItsr,
  itrsExplore,
  itrsExplore.url,
  statedItsr,
)

assert.equal(itrsRewritten.length, 3, `expected 3 steps, got ${itrsRewritten.length}`)
assert.match(itrsRewritten[0]!.label, /Open/i)
assert.equal(
  itrsRewritten[0]!.href,
  'https://www.itrsgroup.com/solutions/observability-education#use-cases',
)
assert.match(itrsRewritten[1]!.label, /Download the solution brief/i)
assert.match(itrsRewritten[2]!.label, /download confirmation/i)
assert.equal(
  itrsRewritten.some((s) => /homepage|search|cookie/i.test(s.label)),
  false,
  'detour/cookie noise must be removed',
)
assert.equal(itrsRewritten.filter((s) => s.action === 'Type').length, 0, 'no form Type steps when explore.forms is empty')
assert.equal(
  itrsRewritten.some((s) => /section.*use-cases|verify.*use-cases/i.test(s.label)),
  false,
  'post-download section steps must be removed',
)

{
  const stripped = stripPostDownloadSectionSteps(pollutedItsr)
  assert.equal(
    stripped.some((s) => /use-cases/i.test(s.label)),
    false,
    'post-download section steps must be stripped',
  )
  assert.equal(
    stripped.some((s) => /Download Solution Brief/i.test(s.label)),
    true,
    'download click must remain when only stripping post-download noise',
  )
}

const statedHetic = 'https://www.hetic.net/brochure télécharger la brochure'
const heticPlan = {
  title: 'HETIC brochure',
  steps: [
    { action: 'Navigate', label: 'Naviguer vers la page d’accueil', href: 'https://www.hetic.net/' },
    { action: 'Click', label: 'Cliquer sur « Brochure »', targetHint: 'Brochure' },
    { action: 'Type', label: 'Saisir une valeur dans Email', targetHint: 'Email' },
    { action: 'Verify', label: 'Vérifier que la page se charge correctement' },
  ],
}

const { plan: heticGrounded } = applyGroundingToPlan(
  heticPlan,
  heticExplore,
  'https://www.hetic.net/brochure',
  statedHetic,
)
const heticSteps = heticGrounded.steps as GroundedPlanStep[]

assert.equal(
  heticSteps.some((s) => /page d['’]?accueil|homepage/i.test(s.label)),
  false,
  'must not keep homepage detour when deep URL + download given',
)
assert.equal(
  heticSteps[0]!.href,
  'https://www.hetic.net/brochure',
  'first step must navigate directly to brochure URL',
)
assert.equal(
  heticSteps.some((s) => /Je télécharge la brochure/i.test(s.label)),
  true,
  'must click observed download CTA',
)
assert.equal(
  heticSteps.filter((s) => s.action === 'Type').length,
  4,
  'must include observed form fields before submit',
)
assert.match(
  heticSteps[heticSteps.length - 1]!.label,
  /téléchargement/i,
  'final verify must assert download success',
)

console.log('OK — download plan grounding cases passed')
