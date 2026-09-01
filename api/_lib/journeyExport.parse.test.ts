/**
 * Runnable with: npx tsx api/_lib/journeyExport.parse.test.ts
 */
import assert from 'node:assert/strict'
import {
  journeyExportToRecordedSteps,
  parseJourneyExportDocument,
} from '../../src/lib/journeyExport.js'

const sample = JSON.stringify({
  title: 'Palmarès',
  url: 'https://fr.wikipedia.org/wiki/Kylian_Mbapp%C3%A9',
  steps: [
    {
      n: 1,
      id: 'rec-1',
      action: 'Navigate',
      label: 'Navigate (load)',
      href: 'https://fr.wikipedia.org/wiki/Kylian_Mbapp%C3%A9',
      target: null,
      targetHint: null,
    },
    {
      n: 2,
      id: 'rec-2',
      action: 'Click',
      label: 'Click En sélection nationale',
      target: 'a',
      targetHint: 'En sélection nationale',
    },
  ],
})

const doc = parseJourneyExportDocument(sample)
assert.ok(doc, 'parses export JSON')
assert.equal(doc!.steps.length, 2)
assert.equal(journeyExportToRecordedSteps(doc!).length, 2)

const fenced = parseJourneyExportDocument(`\`\`\`json\n${sample}\n\`\`\``)
assert.ok(fenced, 'parses fenced JSON')

console.log('OK — journeyExport parse cases passed')
