/**
 * Runnable with: npx tsx api/_lib/playwrightRunner.searchStep.test.ts
 */
import assert from 'node:assert/strict'
import { isSearchTypeStep, searchQueryFromStep } from './playwrightRunner.js'

const wikiTypeStep = {
  id: '2',
  label: 'Saisir "Kylian Mbappé" dans le champ de recherche',
  action: 'Saisir',
}

assert.equal(isSearchTypeStep(wikiTypeStep), true, 'FR “champ de recherche” must count as search Type')
assert.equal(searchQueryFromStep(wikiTypeStep), 'Kylian Mbappé')

const submitClick = {
  id: '3',
  label: 'Cliquer sur le bouton Rechercher',
  action: 'Click',
}
assert.equal(isSearchTypeStep(submitClick), false, 'submit click is not a Type search')

const englishSearch = {
  id: '4',
  label: 'Search for "Mbappe" in the search field',
  action: 'Type',
}
assert.equal(isSearchTypeStep(englishSearch), true)
assert.equal(searchQueryFromStep(englishSearch), 'Mbappe')

console.log('OK — playwrightRunner search step cases passed')
