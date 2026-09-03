/**
 * Runnable with: npx tsx api/_lib/playwrightRunner.highlight.test.ts
 */
import assert from 'node:assert/strict'
import { ACTION_HIGHLIGHT_COLOR } from './playwrightRunner.js'

assert.equal(
  ACTION_HIGHLIGHT_COLOR,
  '#0071e3',
  'action highlight must use the product primary blue (--color-accent)',
)

console.log('OK — playwrightRunner highlight color cases passed')
