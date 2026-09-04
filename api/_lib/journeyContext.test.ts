/**
 * Runnable with: npx tsx api/_lib/journeyContext.test.ts
 */
import assert from 'node:assert/strict'
import { resolveJourneyContext, classifyPageArchetype } from './journeyContext.js'
import { bestCtaForOutcome, rankCtasForOutcome } from './ctaRanking.js'
import { validatePlanAgainstContext } from './planContextValidator.js'
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
      links: [{ label: 'Book a demo', href: 'https://www.itrsgroup.com/request-a-demo' }],
      buttons: ['Book a demo', 'Download the solution brief'],
      forms: [],
    },
  ],
}

const stated =
  'https://www.itrsgroup.com/solutions/observability-education#use-cases Download the solution brief'

const ranked = rankCtasForOutcome(itrsExplore, 'download', stated, itrsExplore.url)
assert.equal(ranked[0]?.label, 'Download the solution brief')
assert.equal(ranked[0]?.role, 'download')
assert.notEqual(ranked.find((c) => c.label === 'Book a demo')?.role, 'download')

const ctx = resolveJourneyContext({
  statedIntent: stated,
  contextUrl: itrsExplore.url,
  explore: itrsExplore,
  preferredLanguage: 'en',
})
assert.ok(ctx)
assert.equal(ctx!.outcome, 'download')
assert.equal(ctx!.pageArchetype, 'direct_download')
assert.equal(ctx!.highConfidence, true)
assert.equal(ctx!.primaryCta?.label, 'Download the solution brief')
assert.equal(ctx!.hasFormEvidence, false)

assert.equal(
  classifyPageArchetype({
    explore: itrsExplore,
    destinationUrl: itrsExplore.url,
    outcome: 'download',
    statedIntent: stated,
  }),
  'direct_download',
)

const badPlan = [
  { action: 'Navigate', label: 'Open the homepage' },
  { action: 'Click', label: 'Click the Solutions control', targetHint: 'Solutions' },
  { action: 'Click', label: 'Open the use-cases section', targetHint: 'use-cases' },
  { action: 'Verify', label: 'Verify the use-cases section', targetHint: 'use-cases' },
]

const validated = validatePlanAgainstContext(badPlan, ctx, itrsExplore)
assert.equal(validated.rewritten, true)
assert.equal(validated.steps.length, 3)
assert.match(validated.steps[1]!.label, /Download the solution brief/i)
assert.equal(validated.steps.filter((s) => s.action === 'Type').length, 0)

assert.equal(
  bestCtaForOutcome(itrsExplore, 'download', stated, itrsExplore.url)?.label,
  'Download the solution brief',
)

console.log('OK — journey context + CTA ranking cases passed')
