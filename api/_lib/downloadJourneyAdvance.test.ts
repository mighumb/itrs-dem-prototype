/**
 * Runnable with: npx tsx api/_lib/downloadJourneyAdvance.test.ts
 */
import assert from 'node:assert/strict'
import { isDownloadStallText } from './downloadCtaGrounding.js'
import { finalizeExplicitDownloadJourney } from './downloadJourneyAdvance.js'
import type { SiteExploreResult } from './exploreSite.js'

assert.equal(
  isDownloadStallText(
    'To build the monitoring journey for downloading the solution brief, please provide the exact title of the document and the menu path to find it.',
  ),
  true,
)

assert.equal(
  isDownloadStallText('Quel est le titre exact du document et le chemin de navigation dans le menu ?'),
  true,
)

const itrsExplore: SiteExploreResult = {
  ok: true,
  url: 'https://www.itrsgroup.com/solutions/observability-education',
  reason: null,
  method: 'playwright',
  pagesVisited: 2,
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

const stated =
  'https://www.itrsgroup.com/solutions/observability-education#use-cases Download the solution brief'

const stalled = finalizeExplicitDownloadJourney({
  parsed: {
    message:
      'To build the monitoring journey for downloading the solution brief, please provide the exact title of the document and the menu path to find it.',
    readyForPlan: false,
    questions: [
      {
        id: 'download-path',
        prompt: 'What is the exact title of the document and the menu path?',
        options: [],
      },
    ],
  },
  stated,
  explore: itrsExplore,
  destinationUrl: itrsExplore.url,
  userMessage: stated,
  preferredLanguage: 'en',
})

assert.equal(stalled.readyForPlan, true)
assert.ok(stalled.plan && typeof stalled.plan === 'object')
const steps = (stalled.plan as { steps: Array<{ action: string; label: string }> }).steps
assert.equal(steps.length, 3)
assert.match(steps[1]!.label, /Download the solution brief/i)
assert.equal(stalled.questions, null)
assert.equal(isDownloadStallText(String(stalled.message)), false)

console.log('OK — download journey advance cases passed')
