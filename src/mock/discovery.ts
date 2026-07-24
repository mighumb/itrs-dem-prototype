import { isCuratedHomeExample, resolveJourneyTemplate } from './data'
import type { JourneyTemplate } from '../types'

export type DiscoveryPhase = 'idle' | 'questionnaire' | 'proposals' | 'planning' | 'conversation'

export interface DiscoveryQuestion {
  id: string
  prompt: string
  options: string[]
}

export interface JourneyProposal {
  id: string
  title: string
  description: string
  prompt: string
}

export interface DiscoveryPlan {
  title: string
  summary: string
  steps: { label: string; action: string }[]
  prompt: string
}

export interface DiscoveryContext {
  seed: string
  url: string | null
  answers: Record<string, string>
  selectedProposalId: string | null
  selectedProposal: JourneyProposal | null
  /** Optional live page evidence for future real site analysis. */
  pageSnapshot?: string | null
}

function extractUrl(text: string): string | null {
  const withProtocol = text.match(/https?:\/\/[^\s<>"']+/i)
  if (withProtocol) {
    return withProtocol[0].replace(/[.,);]+$/g, '')
  }

  const bare = text.match(
    /(?:^|[\s([])((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"'\]\)]*)?)/i,
  )
  if (!bare?.[1]) return null
  const hostPath = bare[1].replace(/[.,);]+$/g, '')
  if (hostPath.includes('@')) return null
  if (!/\.[a-z]{2,}(?:\/|$)/i.test(hostPath)) return null
  return `https://${hostPath}`
}

function siteLabelFromCtx(ctx: DiscoveryContext, locale: 'en' | 'fr' = 'en'): string {
  if (ctx.url) {
    try {
      return new URL(ctx.url).hostname.replace(/^www\./, '')
    } catch {
      return ctx.url
    }
  }
  const seedHost = ctx.seed.match(/\b([a-z0-9-]+\.[a-z]{2,})(?:\/|\b)/i)
  if (seedHost) return seedHost[1].replace(/^www\./, '')
  return locale === 'fr' ? 'ce site' : 'this site'
}

/** Precise enough to skip brainstorm and go straight to planning (curated samples / multi-step prompts). */
export function isPrecisePrompt(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  if (isCuratedHomeExample(trimmed)) {
    return true
  }

  const lower = trimmed.toLowerCase()

  if (
    /[?]/.test(trimmed) ||
    /\b(recommand|recommend|suggest|quel parcours|which journey|what (should|journey)|aide[- ]moi|help me)\b/i.test(
      lower,
    )
  ) {
    return false
  }

  const url = extractUrl(trimmed)
  const urlOnly = Boolean(url && trimmed.replace(url, '').trim().length < 8)
  if (urlOnly) return false

  const actionSignals = [
    /\bsearch\b/,
    /\bselect\b/,
    /\bverify\b/,
    /\bclick\b/,
    /\bpersonalize\b/,
    /\bchoose\b/,
    /\bopen\b/,
    /\badd to bag\b/,
    /\bcheckout\b/,
    /\brecherche\b/,
    /\bsélectionne/,
    /\bclique\b/,
  ]
  const signalCount = actionSignals.filter((re) => re.test(lower)).length
  return signalCount >= 2 && trimmed.length > 80
}

export function hasExploitableContext(text: string, ctx: DiscoveryContext | null): boolean {
  if (isPrecisePrompt(text)) return true
  if (!ctx) return false

  const combined = `${ctx.seed} ${Object.values(ctx.answers).join(' ')} ${text}`.toLowerCase()
  const hasSite =
    Boolean(ctx.url) ||
    /\b(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}|site|website|app)\b/.test(combined)
  const hasIntent =
    Object.keys(ctx.answers).length > 0 ||
    Boolean(ctx.selectedProposal) ||
    /\b(search|checkout|book|login|signup|monitor|parcours|surveiller|acheter|réserver)\b/.test(
      combined,
    )

  return hasSite && hasIntent
}

export function createDiscoveryContext(seed: string): DiscoveryContext {
  return {
    seed,
    url: extractUrl(seed),
    answers: {},
    selectedProposalId: null,
    selectedProposal: null,
    pageSnapshot: null,
  }
}

/** Generic clarification questions — no brand/sector cheat-sheet. */
export function buildDiscoveryQuestions(
  ctx: DiscoveryContext,
  locale: 'en' | 'fr' = 'en',
): DiscoveryQuestion[] {
  const siteLabel = siteLabelFromCtx(ctx, locale)
  if (locale === 'fr') {
    return [
      {
        id: 'goal',
        prompt: `Qu’est-ce qui compte le plus sur ${siteLabel} ?`,
        options: [
          'Parcours critique checkout / réservation',
          'Recherche et trouver un résultat',
          'Connexion / accès compte',
        ],
      },
      {
        id: 'depth',
        prompt: 'Jusqu’où le parcours doit-il aller ?',
        options: [
          'Happy path de bout en bout',
          'Landing + interaction clé',
          'Disponibilité de page seulement',
        ],
      },
      {
        id: 'risk',
        prompt: 'Quel risque surveiller ?',
        options: [
          'Pages lentes',
          'CTA / formulaires cassés',
          'Pas sûr — propose quelque chose',
        ],
      },
    ]
  }
  return [
    {
      id: 'goal',
      prompt: `What matters most on ${siteLabel}?`,
      options: [
        'Critical checkout / booking path',
        'Search and find a result',
        'Login / account access',
      ],
    },
    {
      id: 'depth',
      prompt: 'How far should the journey go?',
      options: [
        'Happy path end-to-end',
        'Landing + key interaction',
        'Page availability only',
      ],
    },
    {
      id: 'risk',
      prompt: 'Any risk to watch?',
      options: [
        'Slow page loads',
        'Broken CTAs / forms',
        'Not sure yet — suggest something',
      ],
    },
  ]
}

/** Generic journey proposals derived from URL/seed/answers — not sector templates. */
export function buildJourneyProposals(
  ctx: DiscoveryContext,
  locale: 'en' | 'fr' = 'en',
): JourneyProposal[] {
  const url = ctx.url ?? (locale === 'fr' ? 'le site' : 'the site')
  const host = siteLabelFromCtx(ctx, locale)
  const goal = `${ctx.answers.goal ?? ''} ${ctx.seed}`.toLowerCase()
  const depth = ctx.answers.depth ?? ''
  const risk = ctx.answers.risk ?? ''

  const focus = /login|account|compte|connexion/.test(goal)
    ? 'login'
    : /search|recherche|find|trouver/.test(goal)
      ? 'search'
      : 'checkout'

  const riskNote =
    risk && !/not sure|pas s[uû]r/i.test(risk)
      ? locale === 'fr'
        ? ` (surveiller : ${risk})`
        : ` (watch: ${risk})`
      : ''

  if (locale === 'fr') {
    const primary =
      focus === 'search'
        ? {
            id: 'primary-search',
            title: `Recommandé — Recherche sur ${host}`,
            description: `Chercher et vérifier les résultats${riskNote}.`,
            prompt: `Ouvre ${url} et lance un parcours de recherche (paramètres à confirmer avec l’utilisateur).`,
          }
        : focus === 'login'
          ? {
              id: 'primary-login',
              title: `Recommandé — Connexion sur ${host}`,
              description: `Accès compte / entrée de connexion${depth ? ` · ${depth}` : ''}${riskNote}.`,
              prompt: `Ouvre ${url} et exerce le parcours de connexion ou d’accès compte (paramètres à confirmer avec l’utilisateur).`,
            }
          : {
              id: 'primary-checkout',
              title: `Recommandé — Parcours critique sur ${host}`,
              description: `Happy path checkout / réservation${depth ? ` · ${depth}` : ''}${riskNote}.`,
              prompt: `Ouvre ${url} et parcours le chemin d’achat ou de réservation principal (paramètres à confirmer avec l’utilisateur).`,
            }

    return [
      primary,
      {
        id: 'alt-availability',
        title: `Disponibilité ${host}`,
        description: `Contrôle léger : la homepage charge et la navigation principale est utilisable.`,
        prompt: `Ouvre ${url}, attends le chargement de la homepage, et vérifie que la navigation principale est visible.`,
      },
      {
        id: 'alt-secondary',
        title:
          focus === 'search'
            ? `Checkout / réservation sur ${host}`
            : focus === 'login'
              ? `Recherche sur ${host}`
              : `Connexion / compte sur ${host}`,
        description: 'Parcours alternatif si le premier choix n’est pas le bon focus.',
        prompt:
          focus === 'search'
            ? `Ouvre ${url} et parcours le chemin d’achat ou de réservation principal (paramètres à confirmer avec l’utilisateur).`
            : focus === 'login'
              ? `Ouvre ${url} et lance un parcours de recherche (paramètres à confirmer avec l’utilisateur).`
              : `Ouvre ${url} et exerce le parcours de connexion ou d’accès compte (paramètres à confirmer avec l’utilisateur).`,
      },
    ]
  }

  const primary =
    focus === 'search'
      ? {
          id: 'primary-search',
          title: `Recommended — Search on ${host}`,
          description: `Search and verify results${riskNote}.`,
          prompt: `Open ${url} and run a search journey (parameters to confirm with the user).`,
        }
      : focus === 'login'
        ? {
            id: 'primary-login',
            title: `Recommended — Login on ${host}`,
            description: `Account access / sign-in entry${depth ? ` · ${depth}` : ''}${riskNote}.`,
            prompt: `Open ${url} and exercise the login or account entry flow (parameters to confirm with the user).`,
          }
        : {
            id: 'primary-checkout',
            title: `Recommended — Critical path on ${host}`,
            description: `Checkout / booking happy path${depth ? ` · ${depth}` : ''}${riskNote}.`,
            prompt: `Open ${url} and run the main purchase or booking path (parameters to confirm with the user).`,
          }

  return [
    primary,
    {
      id: 'alt-availability',
      title: `${host} availability`,
      description: `Lighter check: homepage loads and main navigation is usable.`,
      prompt: `Open ${url}, wait for the homepage to load, and verify the main navigation is visible.`,
    },
    {
      id: 'alt-secondary',
      title:
        focus === 'search'
          ? `Checkout / booking on ${host}`
          : focus === 'login'
            ? `Search on ${host}`
            : `Login / account on ${host}`,
      description: 'Alternative priority journey if the first pick is not the right focus.',
      prompt:
        focus === 'search'
          ? `Open ${url} and run the main purchase or booking path (parameters to confirm with the user).`
          : focus === 'login'
            ? `Open ${url} and run a search journey (parameters to confirm with the user).`
            : `Open ${url} and exercise the login or account entry flow (parameters to confirm with the user).`,
    },
  ]
}

/** Parameter questions after a journey type is chosen — suggestions only, not invented facts. */
export function buildConfigureQuestions(
  _ctx: DiscoveryContext,
  proposal: JourneyProposal,
  locale: 'en' | 'fr' = 'en',
): DiscoveryQuestion[] {
  const title = `${proposal.title} ${proposal.description} ${proposal.prompt}`.toLowerCase()

  if (/search|recherche|flight|train|hotel|booking|vol|billet/.test(title)) {
    if (locale === 'fr') {
      return [
        {
          id: 'param-query',
          prompt: 'Que doit-on rechercher ? (choisis une suggestion ou réponds dans le chat)',
          options: [
            'Une requête typique (Suggéré)',
            'Je préciserai dans le chat',
            'Le premier résultat disponible convient',
          ],
        },
        {
          id: 'param-when',
          prompt: 'Contrainte de date / timing ?',
          options: [
            'Flexible / prochain disponible (Suggéré)',
            'Je préciserai les dates',
            'Non applicable',
          ],
        },
        {
          id: 'param-depth',
          prompt: 'Où le parcours doit-il s’arrêter ?',
          options: [
            'Jusqu’à la page résultat / sélection clé (Suggéré)',
            'Résultats de recherche seulement',
            'Une étape plus loin dans le tunnel',
          ],
        },
      ]
    }
    return [
      {
        id: 'param-query',
        prompt: 'What should we search for? (pick a suggestion or answer in chat)',
        options: [
          'A typical primary query (Suggested)',
          'I will specify in chat',
          'First available result is fine',
        ],
      },
      {
        id: 'param-when',
        prompt: 'Any date / timing constraint?',
        options: [
          'Flexible / next available (Suggested)',
          'I will specify dates',
          'Not applicable',
        ],
      },
      {
        id: 'param-depth',
        prompt: 'Where should the journey stop?',
        options: [
          'Until the key result / selection page (Suggested)',
          'Search results only',
          'One step further into the funnel',
        ],
      },
    ]
  }

  if (/login|account|compte|connexion|sign-?in/.test(title)) {
    if (locale === 'fr') {
      return [
        {
          id: 'param-entry',
          prompt: 'Quel point d’entrée ?',
          options: [
            'CTA principal connexion / compte (Suggéré)',
            'Je décrirai l’entrée',
            'Inscription plutôt que connexion',
          ],
        },
        {
          id: 'param-depth',
          prompt: 'Où s’arrêter ?',
          options: [
            'Formulaire de connexion visible (Suggéré)',
            'Après un message d’échec de validation',
            'Homepage + ouvrir le menu compte seulement',
          ],
        },
      ]
    }
    return [
      {
        id: 'param-entry',
        prompt: 'Which entry point?',
        options: [
          'Main login / account CTA (Suggested)',
          'I will describe the entry',
          'Signup instead of login',
        ],
      },
      {
        id: 'param-depth',
        prompt: 'Where should we stop?',
        options: [
          'Sign-in form visible (Suggested)',
          'After a failed validation message',
          'Homepage + open account menu only',
        ],
      },
    ]
  }

  if (locale === 'fr') {
    return [
      {
        id: 'param-goal',
        prompt: 'Que doit réussir ce parcours, concrètement ?',
        options: [
          'Atteindre la page clé du tunnel (Suggéré)',
          'Vérifier que la homepage répond',
          'Je décrirai mon cas dans le chat',
        ],
      },
      {
        id: 'param-detail',
        prompt: 'Une valeur précise à utiliser (ville, produit, compte…) ?',
        options: [
          'Utiliser une suggestion raisonnable (Suggéré)',
          'Je préciserai dans le chat',
          'Pas besoin — garder générique',
        ],
      },
    ]
  }

  return [
    {
      id: 'param-goal',
      prompt: 'What must this journey succeed at, concretely?',
      options: [
        'Reach the key funnel page (Suggested)',
        'Verify the homepage responds',
        'I will describe my case in chat',
      ],
    },
    {
      id: 'param-detail',
      prompt: 'Any specific value to use (city, product, account…)?',
      options: [
        'Use a reasonable suggestion (Suggested)',
        'I will specify in chat',
        'No need — keep it generic',
      ],
    },
  ]
}

export function buildPlanFromPrompt(prompt: string): DiscoveryPlan {
  const template = resolveJourneyTemplate(prompt)
  return planFromTemplate(template, prompt)
}

export function buildPlanFromProposal(proposal: JourneyProposal): DiscoveryPlan {
  return buildPlanFromPrompt(proposal.prompt)
}

function planFromTemplate(template: JourneyTemplate, prompt: string): DiscoveryPlan {
  return {
    title: template.name,
    summary: `Here's the journey I propose for **${template.name}**. Review the steps — we can refine in chat, or hit **Run** when you're ready.`,
    steps: template.steps.map((step) => ({
      label: step.label,
      action: step.action,
    })),
    prompt,
  }
}

export function formatPlanMessage(plan: DiscoveryPlan): string {
  const lines = plan.steps.map(
    (step, index) => `${index + 1}. **${step.action}** — ${step.label}`,
  )
  return `${plan.summary}\n\n${lines.join('\n')}`
}

export function agentNeedsMoreContextMessage(
  text: string,
  locale: 'en' | 'fr' = 'en',
): string {
  const lower = text.toLowerCase()
  if (locale === 'fr') {
    if (/\bcheckout\b|\bcart\b|\bpayment\b|\bpanier\b/.test(lower)) {
      return 'Je peux préparer un parcours checkout — il me faut un peu plus de contexte. **Quel site ou URL ?** Et où s’arrêter (ex. ajout panier, page paiement) ?'
    }
    if (/\bhotel\b|\bbook\b|\br[eé]serv/.test(lower)) {
      return 'Je peux planifier un parcours de réservation. **Quel site**, quelle intention, et jusqu’où aller ?'
    }
    return 'Il me manque encore du contexte pour un parcours fiable. Partage une **URL** ou décris le site, l’objectif, et où le parcours doit s’arrêter — ou utilise le formulaire flottant.'
  }
  if (/\bcheckout\b|\bcart\b|\bpayment\b|\bpanier\b/.test(lower)) {
    return "I can draft a checkout journey — but I need a bit more context. **Which site or URL?** And where should we stop (e.g. add to bag, payment page)?"
  }
  if (/\bhotel\b|\bbook\b|\br[eé]serv/.test(lower)) {
    return 'I can plan a booking journey. **Which site**, what destination/intent, and how far should we go?'
  }
  return "I don't have enough context yet for a reliable journey. Share a **URL** or describe the site, the goal, and where the journey should end — or use the questions above."
}

export function classifyUserEntry(text: string): 'precise' | 'vague' {
  return isPrecisePrompt(text) ? 'precise' : 'vague'
}
