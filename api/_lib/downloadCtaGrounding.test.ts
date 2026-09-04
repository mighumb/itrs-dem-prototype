/**
 * Runnable with: npx tsx api/_lib/downloadCtaGrounding.test.ts
 */
import assert from 'node:assert/strict'
import {
  applyDownloadCtaGrounding,
  findObservedDownloadCta,
  isDownloadMethodClarificationQuestion,
} from './downloadCtaGrounding.js'
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

const stated =
  'https://www.itrsgroup.com/solutions/observability-education#use-cases Download the solution brief'

const cta = findObservedDownloadCta(itrsExplore, stated, itrsExplore.url)
assert.ok(cta)
assert.match(cta!.label, /Download the solution brief/i)

assert.equal(
  isDownloadMethodClarificationQuestion({
    prompt: 'How is the solution brief usually downloaded?',
    options: [
      'By filling out a form on the site',
      "There's a direct link on another page",
      "I'm not sure, please suggest a path",
    ],
  }),
  true,
)

const grounded = applyDownloadCtaGrounding({
  stated,
  explore: itrsExplore,
  destinationUrl: itrsExplore.url,
  proposals: null,
  questions: [
    {
      id: 'download-method',
      prompt: 'How is the solution brief usually downloaded?',
      options: ['By filling out a form on the site'],
    },
  ],
  userMessage: stated,
  preferredLanguage: 'en',
})

assert.equal(grounded.questions, null)
assert.ok(Array.isArray(grounded.proposals) && grounded.proposals.length === 1)
assert.match(
  String((grounded.proposals as { title: string }[])[0]!.title),
  /Download the solution brief/i,
)

console.log('OK — download CTA grounding cases passed')
