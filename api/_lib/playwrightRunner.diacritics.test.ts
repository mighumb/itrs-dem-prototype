/**
 * Runnable with: npx tsx api/_lib/playwrightRunner.diacritics.test.ts
 */
import assert from 'node:assert/strict'
import {
  alreadyOnClickTargetPage,
  diacriticInsensitiveRegExp,
  foldDiacritics,
  isSearchSubmitClickLabel,
  isSearchTypeStep,
  significantVerifyTokens,
} from './playwrightRunner.js'

assert.equal(foldDiacritics('Zinédine'), 'Zinedine')
assert.equal(foldDiacritics('Palmarès'), 'Palmares')
assert.equal(foldDiacritics('entraîneur').toLowerCase(), 'entraineur')

assert.match('Zinédine Zidane', diacriticInsensitiveRegExp('Zinedine'))
assert.match('Zinedine Zidane', diacriticInsensitiveRegExp('Zinédine'))
assert.match('Palmarès', diacriticInsensitiveRegExp('Palmares'))
assert.doesNotMatch('Luca Zidane', diacriticInsensitiveRegExp('Mbappé'))

assert.equal(
  isSearchTypeStep({
    id: '2',
    label: 'Saisir « Zinedine Zidane » dans le champ de recherche',
    action: 'Type',
  }),
  true,
)

assert.equal(isSearchSubmitClickLabel('Cliquer sur le bouton Rechercher'), true)
assert.equal(isSearchSubmitClickLabel('Cliquer sur Zinédine Zidane'), false)

assert.equal(
  alreadyOnClickTargetPage(
    'https://fr.wikipedia.org/wiki/Zin%C3%A9dine_Zidane',
    'Zinédine Zidane — Wikipédia',
    'Zinedine Zidane',
  ),
  true,
)
assert.equal(
  alreadyOnClickTargetPage(
    'https://fr.wikipedia.org/wiki/Wikipédia:Accueil_principal',
    "Wikipédia, l'encyclopédie libre",
    'Zinedine Zidane',
  ),
  false,
)

assert.deepEqual(significantVerifyTokens("Palmarès d'entraîneur"), ['palmares', 'entraineur'])

console.log('OK — playwrightRunner diacritics / search click cases passed')
