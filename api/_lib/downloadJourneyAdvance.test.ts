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

// Sibling /request-a-demo form must NOT derail into a lead-form proxy.
const exploreWithDemoForm: SiteExploreResult = {
  ...itrsExplore,
  pagesVisited: 3,
  pages: [
    ...itrsExplore.pages!,
    {
      url: 'https://www.itrsgroup.com/request-a-demo',
      title: 'Request a demo',
      heading: 'Book a demo',
      links: [],
      buttons: ['Submit'],
      forms: [
        {
          action: '/request-a-demo',
          fields: ['First name', 'Last name', 'Email', 'Company', 'Phone'],
        },
      ],
    },
  ],
}

const demoProxy = finalizeExplicitDownloadJourney({
  parsed: {
    message:
      "To simulate downloading the solution brief, I'll prepare a journey that fills out a standard lead form. Please provide the details you'd like to use for the form.",
    readyForPlan: false,
    questions: [
      {
        id: 'lead-form',
        prompt: 'What details should we use for the lead form?',
        options: ['First name', 'Email', 'Company'],
      },
    ],
    workTrace: [
      "Using the 'Book a Demo' form fields on /request-a-demo as a proxy",
      "No specific 'solution brief' download form was found",
    ],
  },
  stated,
  explore: exploreWithDemoForm,
  destinationUrl: itrsExplore.url,
  userMessage: stated,
  preferredLanguage: 'en',
})

assert.equal(demoProxy.readyForPlan, true)
assert.equal(demoProxy.questions, null)
assert.match(String(demoProxy.message), /direct click|no form/i)
const demoSteps = (demoProxy.plan as { steps: Array<{ action: string }> }).steps
assert.equal(demoSteps.filter((s) => s.action === 'Type').length, 0)
assert.equal(demoSteps.length, 3)

console.log('OK — download journey advance cases passed')
