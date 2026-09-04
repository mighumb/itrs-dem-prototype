/**
 * Runnable with: npx tsx api/_lib/exploreHashActivation.test.ts
 */
import assert from 'node:assert/strict'
import {
  destinationHasActivatableHash,
  fragmentLabelsFromHash,
  mergeExploreInventories,
} from './exploreHashActivation.js'

assert.deepEqual(fragmentLabelsFromHash('#use-cases'), [
  'use-cases',
  'use cases',
  'Use Cases',
])

assert.equal(destinationHasActivatableHash('https://example.com/page#use-cases'), true)
assert.equal(destinationHasActivatableHash('https://example.com/page'), false)

const baseline = {
  title: 'Education',
  heading: 'Boost your digital experience',
  links: [{ label: 'Book a demo', href: 'https://example.com/demo' }],
  buttons: ['Book a demo'],
  forms: [],
}

const overlay = {
  title: 'Education',
  heading: 'Use cases',
  links: [],
  buttons: ['Download the solution brief', 'Book a demo'],
  forms: [
    {
      action: null,
      fields: ['Email', 'Company'],
    },
  ],
}

const merged = mergeExploreInventories(baseline, overlay)
assert.equal(merged.buttons.includes('Download the solution brief'), true)
assert.equal(merged.buttons.includes('Book a demo'), true)
assert.equal(merged.forms[0]?.fields.join(','), 'Email,Company')

console.log('OK — explore hash activation helpers passed')
