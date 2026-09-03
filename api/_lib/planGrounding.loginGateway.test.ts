/**
 * Runnable with: npx tsx api/_lib/planGrounding.loginGateway.test.ts
 */
import assert from 'node:assert/strict'
import {
  applyGroundingToPlan,
  ensureLoginGatewayBeforeCredentials,
  extractRejectedActionTargets,
  stripUserRejectedActionSteps,
  type GroundedPlanStep,
} from './planGrounding.js'

const brochureSteps: GroundedPlanStep[] = [
  { action: 'Navigate', label: 'Naviguer vers hetic.net' },
  { action: 'Click', label: 'Cliquer sur « Brochure »' },
  { action: 'Type', label: 'Saisir « Humberto » dans Nom' },
  { action: 'Type', label: 'Saisir « Miguel » dans Prénom' },
  { action: 'Type', label: 'Saisir « miguel@example.com » dans Email' },
  { action: 'Type', label: 'Saisir « 0618993126 » dans Téléphone' },
  { action: 'Verify', label: 'Vérifier le bouton « Je télécharge la brochure »' },
]

{
  const next = ensureLoginGatewayBeforeCredentials(brochureSteps, null)
  assert.equal(
    next.some((s) => /connexion|login/i.test(s.label)),
    false,
    'brochure/lead email Type must NOT inject a Connexion gateway',
  )
  assert.equal(next.length, brochureSteps.length)
}

{
  const loginSteps: GroundedPlanStep[] = [
    { action: 'Navigate', label: 'Naviguer vers eurecia.com' },
    { action: 'Type', label: 'Saisir « user@example.com » dans Email' },
    { action: 'Type', label: 'Saisir « secret » dans Mot de passe' },
  ]
  const next = ensureLoginGatewayBeforeCredentials(loginSteps, null)
  assert.equal(
    next.some((s) => /connexion|login/i.test(s.label)),
    true,
    'password Type without explore password field should inject login Click',
  )
}

{
  const rejected = extractRejectedActionTargets(
    "il n'y a pas besoin de cliquer sur connexion, uniquement directement sur Brochure",
  )
  assert.ok(
    rejected.some((r) => r.includes('connexion')),
    `expected connexion in ${JSON.stringify(rejected)}`,
  )

  const polluted: GroundedPlanStep[] = [
    { action: 'Navigate', label: 'Naviguer vers la page brochure' },
    {
      action: 'Click',
      label: 'Cliquer sur « Connexion » pour ouvrir le formulaire de connexion',
      targetHint: 'Connexion',
    },
    { action: 'Type', label: 'Saisir « Humberto » dans Nom' },
  ]
  const stripped = stripUserRejectedActionSteps(
    polluted,
    "il n'y a pas besoin de cliquer sur connexion, uniquement directement sur Brochure",
  )
  assert.equal(stripped.length, 2)
  assert.equal(
    stripped.some((s) => /connexion/i.test(s.label)),
    false,
    'explicit Connexion rejection must drop the Click step',
  )
}

{
  const pollutedPlan = {
    title: 'HETIC brochure',
    steps: [
      { action: 'Navigate', label: 'Naviguer vers la page de la brochure HETIC' },
      {
        action: 'Click',
        label: 'Cliquer sur « Connexion » pour ouvrir le formulaire de connexion',
        targetHint: 'Connexion',
      },
      { action: 'Type', label: 'Saisir « miguel@example.com » dans Email' },
      { action: 'Type', label: 'Saisir « Humberto » dans Nom' },
    ],
  }
  const { plan } = applyGroundingToPlan(
    pollutedPlan,
    null,
    'https://www.hetic.net/brochure',
    "il n'y a pas besoin de cliquer sur connexion, uniquement directement sur Brochure",
  )
  const steps = plan.steps as GroundedPlanStep[]
  assert.equal(
    steps.some((s) => /connexion/i.test(s.label)),
    false,
    'grounding must not keep/re-inject Connexion after user rejection',
  )
  assert.equal(
    steps.some((s) => /email/i.test(s.label)),
    true,
    'email Type on brochure must survive (not treated as login)',
  )
}

console.log('OK — planGrounding login gateway / rejected-step cases passed')
