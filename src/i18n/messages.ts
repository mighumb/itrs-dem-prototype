export type Locale = 'en' | 'fr'

export const messages = {
  en: {
    signIn: 'Sign in',
    logIn: 'Log in',
    createAccount: 'Create account',
    bookDemo: 'Book a demo',
    bookDemoBody: "See ITRS DEM in action with your team — we'll reach out within one business day.",
    home: 'Home',
    lightMode: 'Switch to light mode',
    darkMode: 'Switch to dark mode',
    goodMorning: 'Good morning',
    homeGreetingGuest: 'Good morning there,',
    homeSubtitle: 'what journey should we build today?',
    tryExample: 'Or try an example',
    sampleJourneys: 'Sample journeys to explore the product',
    placeholderIdle: 'Describe a journey or paste a URL...',
    placeholderReply: 'Or reply directly…',
    placeholderPlanning: 'Ask to change a step, or refine the plan…',
    placeholderBrainstorm: 'Continue brainstorming…',
    refineJourney: 'Refine the journey',
    chooseJourney: 'Choose a journey',
    somethingElse: 'Something else…',
    other: 'Other…',
    skip: 'Skip',
    dismiss: 'Dismiss',
    previousQuestion: 'Previous question',
    nextQuestion: 'Next question',
    readyToRun: 'Ready to run this user journey?',
    run: 'Run',
    configureJourney: 'Configure this journey',
    closeStack:
      'No problem — we can keep brainstorming in chat. When you have enough detail (site + goal), ask me to draft a plan.',
    name: 'Name',
    workEmail: 'Work email',
    company: 'Company',
    submit: 'Submit',
    requestDemo: 'Request demo',
    fullName: 'Full name',
    geminiDisclaimer: 'Gemini is an AI and can make mistakes.',
    fallbackMock: 'Offline fallback (mock)',
    stop: 'Stop',
    send: 'Send',
    workingInspect: 'Looking at the site…',
    workingResolve: 'Finding the official site…',
    workingDiagnose: 'Diagnosing monitoring need…',
    workingDraft: 'Drafting a reply…',
    workingThink: 'Thinking…',
    language: 'Language',
  },
  fr: {
    signIn: 'Connexion',
    logIn: 'Se connecter',
    createAccount: 'Créer un compte',
    bookDemo: 'Réserver une démo',
    bookDemoBody:
      'Découvrez ITRS DEM avec votre équipe — nous vous recontactons sous un jour ouvré.',
    home: 'Accueil',
    lightMode: 'Passer en mode clair',
    darkMode: 'Passer en mode sombre',
    goodMorning: 'Bonjour',
    homeGreetingGuest: 'Bonjour,',
    homeSubtitle: 'quel parcours construisons-nous aujourd’hui ?',
    tryExample: 'Ou essayez un exemple',
    sampleJourneys: 'Parcours d’exemple pour explorer le produit',
    placeholderIdle: 'Décrivez un parcours ou collez une URL…',
    placeholderReply: 'Ou répondez directement…',
    placeholderPlanning: 'Demandez à modifier une étape, ou affinez le plan…',
    placeholderBrainstorm: 'Continuez le brainstorm…',
    refineJourney: 'Affiner le parcours',
    chooseJourney: 'Choisir un parcours',
    somethingElse: 'Autre chose…',
    other: 'Autre…',
    skip: 'Passer',
    dismiss: 'Fermer',
    previousQuestion: 'Question précédente',
    nextQuestion: 'Question suivante',
    readyToRun: 'Prêt à lancer ce parcours utilisateur ?',
    run: 'Lancer',
    configureJourney: 'Configurer le parcours',
    closeStack:
      'Pas de souci — on peut continuer à brainstormer dans le chat. Quand tu auras assez de détails (site + objectif), demande-moi de préparer un plan.',
    name: 'Nom',
    workEmail: 'Email professionnel',
    company: 'Entreprise',
    submit: 'Envoyer',
    requestDemo: 'Demander une démo',
    fullName: 'Nom complet',
    geminiDisclaimer: 'Gemini est une IA et peut faire des erreurs.',
    fallbackMock: 'Mode secours (mock)',
    stop: 'Arrêter',
    send: 'Envoyer',
    workingInspect: 'Je regarde le site…',
    workingResolve: 'Je cherche le site officiel…',
    workingDiagnose: 'Je diagnostique le besoin de monitoring…',
    workingDraft: 'Je prépare une réponse…',
    workingThink: 'Réflexion…',
    language: 'Langue',
  },
} as const

export type MessageKey = keyof typeof messages.en

export function detectLocale(text: string): Locale | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  // Accented characters or multiple French function-words → French.
  const frenchHits = trimmed.match(
    /\b(je|tu|nous|vous|mon|ma|mes|des|pour|avec|dans|quel|quelle|parcours|monitorer|surveiller|recommande|recommandes|souhaite|veux|voudrais|aide|faire)\b/gi,
  )
  if (/[àâäéèêëïîôùûüçœæ]/i.test(trimmed) || (frenchHits && frenchHits.length >= 1)) {
    return 'fr'
  }
  if (/\b(the|what|which|journey|monitor|please|recommend|should|website)\b/i.test(trimmed)) {
    return 'en'
  }
  return null
}

export function t(locale: Locale, key: MessageKey): string {
  return messages[locale][key] ?? messages.en[key]
}
