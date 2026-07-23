import { HOME_EXAMPLES, resolveJourneyTemplate } from './data'
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
  domain: 'nike' | 'train' | 'hotel' | 'airline' | 'generic'
  answers: Record<string, string>
  selectedProposalId: string | null
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i)
  return match?.[0]?.replace(/[.,)]+$/, '') ?? null
}

function detectDomain(text: string): DiscoveryContext['domain'] {
  const lower = text.toLowerCase()
  if (lower.includes('nike') || lower.includes('jersey') || lower.includes('stadium')) return 'nike'
  if (
    lower.includes('trainline') ||
    lower.includes('thetrainline') ||
    lower.includes('train') ||
    (lower.includes('paris') && lower.includes('lyon'))
  ) {
    return 'train'
  }
  if (
    lower.includes('airfrance') ||
    lower.includes('air france') ||
    lower.includes('airline') ||
    lower.includes('compagnie aérienne') ||
    /\b(vol|flight|check-?in)\b/.test(lower)
  ) {
    return 'airline'
  }
  if (lower.includes('booking') || lower.includes('hotel') || lower.includes('barcelona')) {
    return 'hotel'
  }
  return 'generic'
}

/** Precise enough to skip brainstorm and go straight to planning. */
export function isPrecisePrompt(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  // Curated examples are the only one-click shortcut to a ready plan.
  if (HOME_EXAMPLES.some((example) => example.toLowerCase() === trimmed.toLowerCase())) {
    return true
  }

  const lower = trimmed.toLowerCase()

  // Questions / recommendations are brainstorming, never a ready journey.
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
  // Require real multi-step intent — length alone is not enough.
  return signalCount >= 2 && trimmed.length > 80
}

export function hasExploitableContext(text: string, ctx: DiscoveryContext | null): boolean {
  if (isPrecisePrompt(text)) return true
  if (!ctx) return false

  const combined = `${ctx.seed} ${Object.values(ctx.answers).join(' ')} ${text}`.toLowerCase()
  const hasSite =
    Boolean(ctx.url) ||
    ctx.domain !== 'generic' ||
    /\b(nike|trainline|booking|amazon|site|http)\b/.test(combined)
  const hasIntent =
    Object.keys(ctx.answers).length > 0 ||
    /\b(search|checkout|book|hotel|train|product|cart|login|signup|monitor)\b/.test(combined)

  return hasSite && hasIntent
}

export function createDiscoveryContext(seed: string): DiscoveryContext {
  return {
    seed,
    url: extractUrl(seed),
    domain: detectDomain(seed),
    answers: {},
    selectedProposalId: null,
  }
}

export function buildDiscoveryQuestions(ctx: DiscoveryContext): DiscoveryQuestion[] {
  switch (ctx.domain) {
    case 'nike':
      return [
        {
          id: 'nike-goal',
          prompt: 'What should we monitor on Nike?',
          options: [
            'Product discovery → Add to bag',
            'Size & personalization flow',
            'Search and product page load',
          ],
        },
        {
          id: 'nike-product',
          prompt: 'Which product focus?',
          options: [
            'France 2026 Stadium Home jersey',
            'Any featured sneaker',
            'Whatever is in search results',
          ],
        },
        {
          id: 'nike-depth',
          prompt: 'How deep should the journey go?',
          options: ['Until Add to bag is visible', 'Through personalization', 'Homepage + search only'],
        },
      ]
    case 'train':
      return [
        {
          id: 'train-route',
          prompt: 'Which trip should we monitor?',
          options: [
            'Paris Gare de Lyon → Lyon Part-Dieu',
            'London → Paris',
            'A custom route I will describe',
          ],
        },
        {
          id: 'train-when',
          prompt: 'When should the outbound be?',
          options: ['Tomorrow morning', 'Next weekend', 'Anytime available'],
        },
        {
          id: 'train-goal',
          prompt: 'Where should the journey stop?',
          options: [
            'Passenger details form',
            'Ticket options selected',
            'Search results only',
          ],
        },
      ]
    case 'hotel':
      return [
        {
          id: 'hotel-city',
          prompt: 'Which destination?',
          options: ['Barcelona', 'Paris', 'Rome'],
        },
        {
          id: 'hotel-when',
          prompt: 'Which dates?',
          options: ['Next weekend', 'Next month', 'Flexible dates'],
        },
        {
          id: 'hotel-goal',
          prompt: 'What should we verify?',
          options: [
            'Room options are shown',
            'First hotel result opens',
            'Search results load',
          ],
        },
      ]
    case 'airline':
      return [
        {
          id: 'airline-goal',
          prompt: 'On peut démarrer avec le parcours le plus courant pour une compagnie aérienne — ça te va ?',
          options: [
            'Oui — recherche de vol → sélection (recommandé)',
            'Plutôt gestion de réservation / mon billet',
            'Plutôt enregistrement en ligne (check-in)',
          ],
        },
      ]
    default: {
      let siteLabel = 'this site'
      if (ctx.url) {
        try {
          siteLabel = new URL(ctx.url).hostname.replace(/^www\./, '')
        } catch {
          siteLabel = ctx.url
        }
      }
      return [
        {
          id: 'generic-goal',
          prompt: `What matters most on ${siteLabel}?`,
          options: [
            'Critical user checkout / booking path',
            'Search and find a result',
            'Login / account access',
          ],
        },
        {
          id: 'generic-depth',
          prompt: 'How far should the journey go?',
          options: [
            'Happy path end-to-end',
            'Landing + key interaction',
            'Page availability only',
          ],
        },
        {
          id: 'generic-risk',
          prompt: 'Any risk to watch?',
          options: [
            'Slow page loads',
            'Broken CTAs / forms',
            'Not sure yet — suggest something',
          ],
        },
      ]
    }
  }
}

export function buildJourneyProposals(ctx: DiscoveryContext): JourneyProposal[] {
  switch (ctx.domain) {
    case 'nike':
      return buildNikeProposals(ctx)
    case 'train':
      return buildTrainProposals(ctx)
    case 'hotel':
      return buildHotelProposals(ctx)
    case 'airline':
      return buildAirlineProposals(ctx)
    default:
      return buildGenericProposals(ctx)
  }
}

function buildAirlineProposals(ctx: DiscoveryContext): JourneyProposal[] {
  const site = ctx.url ?? 'https://wwws.airfrance.fr'
  return [
    {
      id: 'airline-search-book',
      title: 'Recommandé — Recherche & sélection de vol',
      description:
        'Parcours DEM le plus fréquent pour une compagnie aérienne : recherche → résultats → sélection aller.',
      prompt: `Open ${site}, search a round-trip flight for 1 passenger (e.g. Paris CDG to Lyon or Nice, departing in about a week), review the results list, select an outbound flight option, and verify the passenger/details step is reachable without completing payment.`,
    },
    {
      id: 'airline-manage',
      title: 'Gérer une réservation',
      description: 'Accès “mes réservations” / retrouver un billet — souvent fragile (login + formulaires).',
      prompt: `Open ${site}, navigate to manage booking / my trips, attempt to retrieve a booking with sample references if a form is shown, and verify the manage-booking flow loads without completing login with real credentials.`,
    },
    {
      id: 'airline-checkin',
      title: 'Enregistrement en ligne',
      description: 'Check-in web : disponibilité de la page et entrée dans le tunnel.',
      prompt: `Open ${site}, open online check-in, and verify the check-in entry page (and any booking lookup form) loads successfully without completing a real check-in.`,
    },
  ]
}

function buildNikeProposals(ctx: DiscoveryContext): JourneyProposal[] {
  const goal = ctx.answers['nike-goal'] ?? ''
  const product = ctx.answers['nike-product'] ?? 'France 2026 Stadium Home jersey'
  const depth = ctx.answers['nike-depth'] ?? ''

  const productLabel = product.includes('sneaker')
    ? 'a featured sneaker'
    : product.includes('Whatever')
      ? 'a product from search results'
      : 'France 2026 Stadium Home'

  // Depth answer defines where the primary journey stops.
  const stopAt: 'personalize' | 'add-to-bag' | 'pdp' = depth.includes('personalization')
    ? 'personalize'
    : depth.includes('Homepage') || goal.includes('Search and product')
      ? 'pdp'
      : 'add-to-bag'

  const primary =
    stopAt === 'personalize'
      ? {
          id: 'nike-primary',
          title: `${productLabel} → personalization`,
          description: `Matches your depth: go through personalization for ${productLabel} (search → size → personalize).`,
          prompt: `Go to https://www.nike.com, search for ${productLabel}, select size L, personalize with Miguel / 6, and verify the personalization is applied.`,
        }
      : stopAt === 'pdp'
        ? {
            id: 'nike-primary',
            title: `Search ${productLabel} → product page`,
            description: `Matches your depth: search ${productLabel} and verify the product page loads.`,
            prompt: `Go to https://www.nike.com, search for ${productLabel}, open the product, and verify the product page is shown.`,
          }
        : {
            id: 'nike-primary',
            title: `${productLabel} → Add to bag`,
            description: `Matches your depth: reach Add to bag for ${productLabel}.`,
            prompt: `Go to https://www.nike.com, search for ${productLabel}, select size L, and verify "Add to bag" is visible.`,
          }

  const variantDeeper =
    stopAt === 'personalize'
      ? {
          id: 'nike-variant-deeper',
          title: `${productLabel} → personalize → Add to bag`,
          description: 'Same flow, then continue one step further to verify Add to bag.',
          prompt: `Go to https://www.nike.com, search for ${productLabel}, select size L, personalize with Miguel / 6, and verify "Add to bag" is visible.`,
        }
      : stopAt === 'add-to-bag'
        ? {
            id: 'nike-variant-deeper',
            title: `${productLabel} with personalization`,
            description: 'Same goal, but go through personalization before Add to bag.',
            prompt: `Go to https://www.nike.com, search for ${productLabel}, select size L, personalize with Miguel / 6, and verify "Add to bag" is visible.`,
          }
        : {
            id: 'nike-variant-deeper',
            title: `${productLabel} → Add to bag`,
            description: 'Go deeper: from the product page through to Add to bag.',
            prompt: `Go to https://www.nike.com, search for ${productLabel}, select size L, and verify "Add to bag" is visible.`,
          }

  const variantLighter =
    stopAt === 'pdp'
      ? {
          id: 'nike-variant-lighter',
          title: `${productLabel} with personalization`,
          description: `Extend past the PDP: personalize ${productLabel}.`,
          prompt: `Go to https://www.nike.com, search for ${productLabel}, select size L, personalize with Miguel / 6, and verify the personalization is applied.`,
        }
      : {
          id: 'nike-variant-lighter',
          title: `Faster check — ${productLabel} PDP`,
          description: `Same product (${productLabel}), but stop once the product page loads.`,
          prompt: `Go to https://www.nike.com, search for ${productLabel}, open the product, and verify the product page is shown.`,
        }

  return [primary, variantLighter, variantDeeper]
}

function buildTrainProposals(ctx: DiscoveryContext): JourneyProposal[] {
  const route = ctx.answers['train-route'] ?? 'Paris Gare de Lyon → Lyon Part-Dieu'
  const when = ctx.answers['train-when'] ?? 'Tomorrow morning'
  const goal = ctx.answers['train-goal'] ?? 'Passenger details form'

  const routeLabel = route.includes('London')
    ? 'London → Paris'
    : route.includes('custom')
      ? 'your route'
      : 'Paris Gare de Lyon → Lyon Part-Dieu'

  const whenLabel = when.includes('weekend')
    ? 'next weekend'
    : when.includes('Anytime')
      ? 'the next available departure'
      : 'tomorrow morning'

  // Goal answer defines where the primary journey stops.
  const stopAt: 'results' | 'tickets' | 'passenger' = goal.includes('Ticket options')
    ? 'tickets'
    : goal.includes('Search results')
      ? 'results'
      : 'passenger'

  const promptResults = `Go to https://www.thetrainline.com, search trains for ${routeLabel} ${whenLabel}, and verify results are shown.`
  const promptTickets = `Go to https://www.thetrainline.com, search ${routeLabel} ${whenLabel}, select a morning TGV, and verify ticket options are shown.`
  const promptPassenger = `Go to https://www.thetrainline.com, search for trains from ${routeLabel} ${whenLabel}, select a morning TGV, choose a Standard ticket, and verify you can enter passenger details.`

  const primary =
    stopAt === 'results'
      ? {
          id: 'train-primary',
          title: `${routeLabel} → search results`,
          description: `Matches your answers: ${whenLabel}, stop at search results.`,
          prompt: promptResults,
        }
      : stopAt === 'tickets'
        ? {
            id: 'train-primary',
            title: `${routeLabel} → ticket options`,
            description: `Matches your answers: ${whenLabel}, stop at ticket options.`,
            prompt: promptTickets,
          }
        : {
            id: 'train-primary',
            title: `${routeLabel} → passenger details`,
            description: `Matches your answers: ${whenLabel}, stop at passenger details.`,
            prompt: promptPassenger,
          }

  const variantLighter =
    stopAt === 'results'
      ? {
          id: 'train-variant-lighter',
          title: `${routeLabel} → ticket options`,
          description: 'Go one step further: select a train and verify ticket options.',
          prompt: promptTickets,
        }
      : stopAt === 'tickets'
        ? {
            id: 'train-variant-lighter',
            title: `${routeLabel} — results only`,
            description: `Same route and timing (${whenLabel}), but stop at search results.`,
            prompt: promptResults,
          }
        : {
            id: 'train-variant-lighter',
            title: `${routeLabel} → ticket options`,
            description: `Same route and timing, but stop earlier at ticket options.`,
            prompt: promptTickets,
          }

  const variantDeeper =
    stopAt === 'passenger'
      ? {
          id: 'train-variant-deeper',
          title: `${routeLabel} — results only`,
          description: `Lighter alternative on the same route (${whenLabel}): verify results only.`,
          prompt: promptResults,
        }
      : stopAt === 'tickets'
        ? {
            id: 'train-variant-deeper',
            title: `${routeLabel} → passenger details`,
            description: 'Continue further: choose Standard and reach passenger details.',
            prompt: promptPassenger,
          }
        : {
            id: 'train-variant-deeper',
            title: `${routeLabel} → passenger details`,
            description: 'Full booking path on the same route through passenger details.',
            prompt: promptPassenger,
          }

  return [primary, variantLighter, variantDeeper]
}

function buildHotelProposals(ctx: DiscoveryContext): JourneyProposal[] {
  const city = ctx.answers['hotel-city'] ?? 'Barcelona'
  const when = ctx.answers['hotel-when'] ?? 'Next weekend'
  const goal = ctx.answers['hotel-goal'] ?? 'Room options are shown'

  const whenLabel = when.includes('month')
    ? 'next month'
    : when.includes('Flexible')
      ? 'flexible dates'
      : 'next weekend'

  // Goal answer defines where the primary journey stops.
  const stopAt: 'results' | 'property' | 'rooms' = goal.includes('first hotel')
    ? 'property'
    : goal.includes('Search results')
      ? 'results'
      : 'rooms'

  const promptResults = `Go to https://www.booking.com, search for hotels in ${city} ${whenLabel}, and verify search results are shown.`
  const promptProperty = `Go to https://www.booking.com, search hotels in ${city} ${whenLabel}, open the first result, and verify the hotel page is shown.`
  const promptRooms = `Go to https://www.booking.com, search for hotels in ${city} ${whenLabel}, open the first result, and verify room options are shown.`

  const primary =
    stopAt === 'results'
      ? {
          id: 'hotel-primary',
          title: `${city} → search results`,
          description: `Matches your answers: ${city}, ${whenLabel}, stop at search results.`,
          prompt: promptResults,
        }
      : stopAt === 'property'
        ? {
            id: 'hotel-primary',
            title: `${city} → first hotel page`,
            description: `Matches your answers: ${city}, ${whenLabel}, open the first property.`,
            prompt: promptProperty,
          }
        : {
            id: 'hotel-primary',
            title: `${city} → room options`,
            description: `Matches your answers: ${city}, ${whenLabel}, verify room options.`,
            prompt: promptRooms,
          }

  const variantLighter =
    stopAt === 'results'
      ? {
          id: 'hotel-variant-lighter',
          title: `${city} → first hotel page`,
          description: 'Go one step further: open the first property.',
          prompt: promptProperty,
        }
      : stopAt === 'property'
        ? {
            id: 'hotel-variant-lighter',
            title: `${city} search results`,
            description: `Same destination and dates (${whenLabel}), but stop at listings.`,
            prompt: promptResults,
          }
        : {
            id: 'hotel-variant-lighter',
            title: `${city} → first hotel page`,
            description: `Same search, but stop earlier on the property page.`,
            prompt: promptProperty,
          }

  const variantDeeper =
    stopAt === 'rooms'
      ? {
          id: 'hotel-variant-deeper',
          title: `${city} search results`,
          description: `Lighter alternative: same ${city} / ${whenLabel}, listings only.`,
          prompt: promptResults,
        }
      : stopAt === 'property'
        ? {
            id: 'hotel-variant-deeper',
            title: `${city} → room options`,
            description: 'Continue further: verify available rooms on the property.',
            prompt: promptRooms,
          }
        : {
            id: 'hotel-variant-deeper',
            title: `${city} → room options`,
            description: 'Full path: open first property and verify room options.',
            prompt: promptRooms,
          }

  return [primary, variantLighter, variantDeeper]
}

function buildGenericProposals(ctx: DiscoveryContext): JourneyProposal[] {
  const url = ctx.url ?? 'https://example.com'
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return 'the site'
    }
  })()

  const goal = ctx.answers['generic-goal'] ?? ''
  const depth = ctx.answers['generic-depth'] ?? ''
  const risk = ctx.answers['generic-risk'] ?? ''

  const focus = goal.includes('Search')
    ? 'search'
    : goal.includes('Login')
      ? 'login'
      : 'checkout'

  const primary =
    focus === 'search'
      ? {
          id: 'gen-primary',
          title: `Search path on ${host}`,
          description: `Matches your goal: search and find a result${risk ? ` (watch: ${risk})` : ''}.`,
          prompt: `Go to ${url}, search for a primary product or destination, and verify results are shown.`,
        }
      : focus === 'login'
        ? {
            id: 'gen-primary',
            title: `Login path on ${host}`,
            description: `Matches your goal: account access${depth ? `, depth: ${depth}` : ''}.`,
            prompt: `Go to ${url}, open the login or account flow, and verify the sign-in form is visible.`,
          }
        : {
            id: 'gen-primary',
            title: `Critical path on ${host}`,
            description: `Matches your goal: checkout / booking${depth ? ` (${depth})` : ''}.`,
            prompt: `Go to ${url}, complete the main purchase or booking flow, and verify the confirmation step is reachable.`,
          }

  return [
    primary,
    {
      id: 'gen-variant-light',
      title: `${host} availability`,
      description: `Lighter alternative: load ${host} and verify the homepage is interactive.`,
      prompt: `Go to ${url}, wait for the homepage to load, and verify the main navigation is visible.`,
    },
    {
      id: 'gen-variant-alt',
      title: focus === 'search' ? `Checkout path on ${host}` : `Search path on ${host}`,
      description:
        focus === 'search'
          ? 'Alternative: monitor the purchase / booking path instead.'
          : 'Alternative: monitor search and results instead.',
      prompt:
        focus === 'search'
          ? `Go to ${url}, complete the main purchase or booking flow, and verify the confirmation step is reachable.`
          : `Go to ${url}, search for a primary product or destination, and verify results are shown.`,
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

export function agentNeedsMoreContextMessage(text: string): string {
  const lower = text.toLowerCase()
  if (/\bcheckout\b|\bcart\b|\bpayment\b/.test(lower)) {
    return "I can draft a checkout journey — but I need a bit more context. **Which site or URL?** And for which product or flow should we stop (e.g. Add to bag, payment page)?"
  }
  if (/\bhotel\b|\bbook\b/.test(lower)) {
    return 'Happy to plan a booking journey. **Which site**, destination, and how far should we go (search results, property page, rooms)?'
  }
  return "I don't have enough context yet to generate a reliable journey. Share a **URL** or describe the site, the goal, and where the journey should end — or answer the questions above."
}

export function classifyUserEntry(text: string): 'precise' | 'vague' {
  return isPrecisePrompt(text) ? 'precise' : 'vague'
}
