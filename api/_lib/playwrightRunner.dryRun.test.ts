/**
 * Runnable with: npx tsx api/_lib/playwrightRunner.dryRun.test.ts
 */
import assert from 'node:assert/strict'
import { isScreenshotOnlyDryRunError } from './playwrightRunner.js'

assert.equal(isScreenshotOnlyDryRunError('page.screenshot: Protocol error (Page.captureScreenshot)'), true)
assert.equal(isScreenshotOnlyDryRunError('Unable to capture screenshot'), true)
assert.equal(isScreenshotOnlyDryRunError('Could not click target for: Download'), false)
assert.equal(isScreenshotOnlyDryRunError(null), false)

console.log('OK — screenshot-only dry-run detection passed')
