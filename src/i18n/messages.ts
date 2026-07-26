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
    homeTitleBefore: 'Which',
    homeTitleAfter: 'do you want to monitor today?',
    tryExample: 'Or try an example',
    sampleJourneys: 'Start one of these journeys',
    placeholderIdle: 'Give a name or paste a URL…',
    placeholderReply: 'Or reply directly…',
    placeholderPlanning: 'Ask to change a step, or refine the plan…',
    placeholderBrainstorm: 'Continue brainstorming…',
    placeholderWorkspace: 'Ask or refine the journey…',
    refineJourney: 'Refine the journey',
    chooseJourney: 'Choose a journey',
    confirmSite: 'Confirm the site',
    clarifyRequest: 'Clarify your request',
    somethingElse: 'Something else…',
    other: 'Other…',
    skip: 'Skip',
    dismiss: 'Dismiss',
    previousQuestion: 'Previous question',
    nextQuestion: 'Next question',
    readyToRun: 'Ready to run this user journey?',
    run: 'Run',
    stop: 'Stop',
    send: 'Send',
    language: 'Language',
    menu: 'Menu',
    appearance: 'Appearance',
    settings: 'Settings',
    back: 'Back',
    configureJourney: 'Configure this journey',
    name: 'Name',
    workEmail: 'Work email',
    company: 'Company',
    submit: 'Submit',
    requestDemo: 'Request demo',
    fullName: 'Full name',
    agentThinking: 'Thinking…',

    // Workspace chrome
    panelAgent: 'Agent',
    panelSteps: 'Steps',
    panelBrowser: 'Browser',
    panelMonitoring: 'Monitoring',
    panelStepsCount: 'Steps ({count})',
    newJourney: 'New journey',
    running: 'Running…',
    starting: 'Starting…',
    stopRun: 'Stop run',
    runJourneyInBrowser: 'Run journey in browser',
    edit: 'Edit',
    done: 'Done',
    editSteps: 'Edit steps',
    doneEditing: 'Done editing',
    live: 'Live',
    takeControl: 'Take control',
    playwrightCapture: 'Playwright capture',
    browserPreview: 'Browser preview',
    browserPreviewHint: 'Run a journey to watch real Playwright screenshots step by step',
    browserScreenshotAlt: 'Browser screenshot',

    // Monitoring
    availability: 'Availability',
    totalTime: 'Total time',
    issues: 'Issues',
    closeMonitoring: 'Close monitoring',
    noExecutedSteps: 'No executed steps yet. Run the journey to populate monitoring.',
    newStepsAppear: 'New steps appear here after you run the journey.',
    signUpToUnlockMonitoring: 'to unlock full monitoring.',
    liveMonitoringActive: 'Live monitoring for this journey.',
    stepN: 'Step {n}',
    whatWeMeasured: 'What we measured',
    stepDuration: 'Step duration',
    stepDurationHint: 'Time to complete this action',
    readyForUser: 'Ready for user',
    readyForUserHint: 'Page responds to clicks & typing',
    mainContentVisible: 'Main content visible',
    mainContentVisibleHint: 'Key content appeared on screen',
    pageFullyLoaded: 'Page fully loaded',
    pageFullyLoadedHint: 'Everything finished loading',
    visualStability: 'Visual stability',
    visualStabilityHint: 'Did the page shift while loading?',
    stepFailureDetected: 'Step failure detected',
    stepsFailedInRun: '{count} step(s) did not complete successfully in this run.',
    zeroIssues: '0 issues',
    oneIssue: '1 issue',
    nIssues: '{count} issues',
    statusOk: 'OK',
    statusDegraded: 'Degraded',
    statusFailing: 'Failing',
    captionNavigate: 'Page loaded successfully',
    captionClick: 'Element clicked as expected',
    captionType: 'Text entered in the field',
    captionVerify: 'Check passed — element visible',
    captionDefault: 'Step completed',
    todayAt: 'Today at {time}',

    // Timeline / edit
    selectAllSteps: 'Select all steps',
    selectStep: 'Select step',
    dragToReorder: 'Drag to reorder',
    deleteStep: 'Delete step',
    openDetached: 'Open in detached window',
    closePanel: 'Close panel',
    dockBack: 'Dock back to workspace',
    restorePanel: 'Restore panel',
    dragToRestore: 'Drag into the workspace to restore',

    // System / run chat (workspace)
    journeyReady:
      'Journey ready — **{name}** ({count} steps). Use **Run** in Steps to replay, or **Edit** to adjust the flow.',
    suggestedSchedule: 'Suggested schedule:',
    scheduleOptionPrimary: 'Every 15 min, Paris + Frankfurt',
    scheduleCustomize: 'Customize',
    scheduleSkip: 'Skip for now',
    runCompleteAll: 'Run complete — all **{count} steps** executed successfully.',
    runComplete: 'Run complete — all steps executed successfully.',
    runStoppedAt:
      'Run stopped at step {n} — **{label}** could not complete. Remaining steps were not executed.\n\nThe page layout may have changed since this journey was recorded. I can update the locator and continue for you.',
    fixAndContinue: 'Fix and continue',
    stepFailedStopping: 'Step {n} failed — **{label}**. Stopping here.',
    stepDone: 'Step {n} done — {label}',
    replayingSteps:
      'Replaying **{count} steps** in Playwright — watch real screenshots sync with each action.',
    scheduleAcceptedUser: 'Every 15 min, Paris + Frankfurt',
    scheduleAcceptedAgent: 'Perfect. Create an account to start monitoring on this schedule.',
    scheduleCustomAgent: 'Perfect — **{summary}**. Create an account to activate monitoring.',
    skipMonitoringHint: 'No problem. Open **Monitoring** from the panel bar anytime to see a preview.',
    fixLocatorUpdated:
      'I updated **{label}** — the target moved on the page (`{from}` → `{to}`). Continuing from here.',
    fixLocatorRefreshed:
      'I refreshed the locator for **{label}** to match the current page. Continuing from here.',
    stillRunningBusy:
      "I'm still running the journey — we can refine it once the run finishes.",
    layoutStable: 'Stable',
    layoutMostlyStable: 'Mostly stable',
    layoutUnstable: 'Unstable',
    statusWorkingWell: 'Working well',
    statusNeedsAttention: 'Needs attention',
    statusNotWorking: 'Not working',
    insightStepFailing:
      'This step could not finish — the page may have changed since the journey was recorded.',
    insightStepDegraded:
      'This step took {duration} — slower than the {target} target for {action} actions.',
    previewCaptionFailing: 'Expected element was not found on the page',
    signUpLink: 'Sign up',
    detached: 'Detached',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    delete: 'Delete',
    deleteAll: 'Delete all',
    deleteCount: 'Delete ({count})',

    // Auth modal
    authWelcomeBack: 'Welcome back — pick up where you left off.',
    authSignupBody: 'Start monitoring your journeys for free.',
    password: 'Password',
    noAccountYet: "Don't have an account?",
    alreadyHaveAccount: 'Already have an account?',

    // Save modal
    startMonitoring: 'Start monitoring',
    saveYourJourney: 'Save your journey',
    saveActivateScheduleBody: 'Create a free account to activate monitoring on this schedule.',
    saveJourneyBody: 'Create a free account to save and monitor this journey continuously.',
    scheduleLabel: 'Schedule',
    createAccountStartMonitoring: 'Create account & start monitoring',
    createAccountAndSave: 'Create account & save',
    freePlanNote: 'No credit card required · 12 runs/day on free plan',

    // Schedule drawer
    scheduleWhen: 'When should this journey run?',
    frequency: 'Frequency',
    locations: 'Locations',
    activeLabel: 'Active',
    summary: 'Summary',
    freqEvery5Min: 'Every 5 minutes',
    freqEvery15Min: 'Every 15 minutes',
    freqEvery30Min: 'Every 30 minutes',
    freqEveryHour: 'Every hour',
    hours247: '24/7',
    hoursBusiness: 'Business hours only',
    hoursWeekdays: 'Weekdays only',
    locParis: 'Paris',
    locFrankfurt: 'Frankfurt',
    locLondon: 'London',
    locNewYork: 'New York',
    scheduleContinueActivate: 'Continue — create account to activate',
    scheduleNothingRunsUntilSignup: 'Monitoring starts after you sign up — nothing runs until then.',

    // Global assistant / shell
    assistant: 'Assistant',
    openAssistant: 'Open assistant',
    assistantTitle: 'Assistant — ask anything, navigate the app',
    assistantIntro: 'Ask me to navigate, open a view, or explain anything in ITRS DEM.',
    askAnything: 'Ask anything…',
    agentPromptNewJourney: 'Create a new journey',
    agentPromptFailing: 'Show failing journeys',
    agentPromptDashboard: 'Open Dashboard',
    dashboard: 'Dashboard',
    journeys: 'Journeys',
    phase2: 'Phase 2',

    // Steps editor
    stepLabel: 'Label',
    stepAction: 'Action',
    stepTarget: 'Target',
    stepTimeout: 'Timeout',
    technicalDetails: 'Technical details',
    addStep: '+ Add step',
    newStep: 'New step',
    stepsProgress: '{done} / {total} steps',
    actionNavigate: 'Navigate',
    actionClick: 'Click',
    actionType: 'Type',
    actionVerify: 'Verify',

    // Discovery / home agent chrome
    journeysSuggested: 'Here are the journeys I suggest — pick one in the form below.',
    prepareJourney: 'Prepare journey',
    assistantUnavailable:
      'The assistant is unavailable right now. Try again in a moment — I won’t invent an offline journey.',
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
    homeTitleBefore: 'Quel',
    homeTitleAfter: 'souhaitez-vous surveiller aujourd’hui ?',
    tryExample: 'Ou essayez un exemple',
    sampleJourneys: 'Lancez un de ces parcours',
    placeholderIdle: 'Donnez un nom ou collez une URL…',
    placeholderReply: 'Ou répondez directement…',
    placeholderPlanning: 'Demandez à modifier une étape, ou affinez le plan…',
    placeholderBrainstorm: 'Continuez le brainstorm…',
    placeholderWorkspace: 'Demandez ou affinez le parcours…',
    refineJourney: 'Affiner le parcours',
    chooseJourney: 'Choisir un parcours',
    confirmSite: 'Confirmer le site',
    clarifyRequest: 'Préciser ta demande',
    somethingElse: 'Autre chose…',
    other: 'Autre…',
    skip: 'Passer',
    dismiss: 'Fermer',
    previousQuestion: 'Question précédente',
    nextQuestion: 'Question suivante',
    readyToRun: 'Prêt à lancer ce parcours utilisateur ?',
    run: 'Lancer',
    stop: 'Arrêter',
    send: 'Envoyer',
    language: 'Langue',
    menu: 'Menu',
    appearance: 'Apparence',
    settings: 'Paramètres',
    back: 'Retour',
    configureJourney: 'Configurer le parcours',
    name: 'Nom',
    workEmail: 'Email professionnel',
    company: 'Entreprise',
    submit: 'Envoyer',
    requestDemo: 'Demander une démo',
    fullName: 'Nom complet',
    agentThinking: 'Réflexion en cours…',

    panelAgent: 'Agent',
    panelSteps: 'Étapes',
    panelBrowser: 'Navigateur',
    panelMonitoring: 'Monitoring',
    panelStepsCount: 'Étapes ({count})',
    newJourney: 'Nouveau parcours',
    running: 'En cours…',
    starting: 'Démarrage…',
    stopRun: 'Arrêter le run',
    runJourneyInBrowser: 'Lancer le parcours dans le navigateur',
    edit: 'Modifier',
    done: 'OK',
    editSteps: 'Modifier les étapes',
    doneEditing: 'Terminer la modification',
    live: 'Live',
    takeControl: 'Prendre le contrôle',
    playwrightCapture: 'Capture Playwright',
    browserPreview: 'Aperçu navigateur',
    browserPreviewHint:
      'Lance un parcours pour voir les captures Playwright étape par étape',
    browserScreenshotAlt: 'Capture d’écran navigateur',

    availability: 'Disponibilité',
    totalTime: 'Temps total',
    issues: 'Incidents',
    closeMonitoring: 'Fermer le monitoring',
    noExecutedSteps: 'Aucune étape exécutée. Lance le parcours pour alimenter le monitoring.',
    newStepsAppear: 'Les nouvelles étapes apparaissent ici après un run.',
    signUpToUnlockMonitoring: 'pour débloquer le monitoring complet.',
    liveMonitoringActive: 'Monitoring actif pour ce parcours.',
    stepN: 'Étape {n}',
    whatWeMeasured: 'Ce que nous avons mesuré',
    stepDuration: 'Durée de l’étape',
    stepDurationHint: 'Temps pour terminer cette action',
    readyForUser: 'Prêt pour l’utilisateur',
    readyForUserHint: 'La page répond aux clics et à la saisie',
    mainContentVisible: 'Contenu principal visible',
    mainContentVisibleHint: 'Le contenu clé est apparu à l’écran',
    pageFullyLoaded: 'Page entièrement chargée',
    pageFullyLoadedHint: 'Tout a fini de charger',
    visualStability: 'Stabilité visuelle',
    visualStabilityHint: 'La page a-t-elle bougé pendant le chargement ?',
    stepFailureDetected: 'Échec d’étape détecté',
    stepsFailedInRun: '{count} étape(s) n’ont pas abouti dans ce run.',
    zeroIssues: '0 incident',
    oneIssue: '1 incident',
    nIssues: '{count} incidents',
    statusOk: 'OK',
    statusDegraded: 'Dégradé',
    statusFailing: 'En échec',
    captionNavigate: 'Page chargée avec succès',
    captionClick: 'Élément cliqué comme prévu',
    captionType: 'Texte saisi dans le champ',
    captionVerify: 'Contrôle OK — élément visible',
    captionDefault: 'Étape terminée',
    todayAt: 'Aujourd’hui à {time}',

    selectAllSteps: 'Tout sélectionner',
    selectStep: 'Sélectionner l’étape',
    dragToReorder: 'Glisser pour réordonner',
    deleteStep: 'Supprimer l’étape',
    openDetached: 'Ouvrir dans une fenêtre détachée',
    closePanel: 'Fermer le panneau',
    dockBack: 'Réancrer dans l’espace de travail',
    restorePanel: 'Restaurer le panneau',
    dragToRestore: 'Glisser dans l’espace de travail pour restaurer',

    journeyReady:
      'Parcours prêt — **{name}** ({count} étapes). Utilise **Lancer** dans Étapes pour rejouer, ou **Modifier** pour ajuster le flux.',
    suggestedSchedule: 'Planification suggérée :',
    scheduleOptionPrimary: 'Toutes les 15 min, Paris + Francfort',
    scheduleCustomize: 'Personnaliser',
    scheduleSkip: 'Passer pour l’instant',
    runCompleteAll: 'Run terminé — les **{count} étapes** ont toutes réussi.',
    runComplete: 'Run terminé — toutes les étapes ont réussi.',
    runStoppedAt:
      'Run arrêté à l’étape {n} — **{label}** n’a pas pu aboutir. Les étapes suivantes n’ont pas été exécutées.\n\nLa page a peut‑être changé depuis l’enregistrement. Je peux mettre à jour le localisateur et continuer.',
    fixAndContinue: 'Corriger et continuer',
    stepFailedStopping: 'Étape {n} en échec — **{label}**. Arrêt ici.',
    stepDone: 'Étape {n} terminée — {label}',
    replayingSteps:
      'Rejeu de **{count} étapes** dans Playwright — les captures suivent chaque action.',
    scheduleAcceptedUser: 'Toutes les 15 min, Paris + Francfort',
    scheduleAcceptedAgent:
      'Parfait. Crée un compte pour démarrer le monitoring sur ce planning.',
    scheduleCustomAgent:
      'Parfait — **{summary}**. Crée un compte pour activer le monitoring.',
    skipMonitoringHint:
      'Pas de souci. Ouvre **Monitoring** depuis la barre de panneaux quand tu veux un aperçu.',
    fixLocatorUpdated:
      'J’ai mis à jour **{label}** — la cible a bougé sur la page (`{from}` → `{to}`). Je continue.',
    fixLocatorRefreshed:
      'J’ai rafraîchi le localisateur pour **{label}** afin de coller à la page actuelle. Je continue.',
    stillRunningBusy:
      'Je suis encore en train d’exécuter le parcours — on pourra l’affiner dès que le run est terminé.',
    layoutStable: 'Stable',
    layoutMostlyStable: 'Plutôt stable',
    layoutUnstable: 'Instable',
    statusWorkingWell: 'Fonctionne bien',
    statusNeedsAttention: 'À surveiller',
    statusNotWorking: 'Ne fonctionne pas',
    insightStepFailing:
      'Cette étape n’a pas pu aboutir — la page a peut‑être changé depuis l’enregistrement du parcours.',
    insightStepDegraded:
      'Cette étape a pris {duration} — plus lent que la cible de {target} pour les actions {action}.',
    previewCaptionFailing: 'Élément attendu introuvable sur la page',
    signUpLink: 'Créer un compte',
    detached: 'Détaché',
    fullscreen: 'Plein écran',
    exitFullscreen: 'Quitter le plein écran',
    delete: 'Supprimer',
    deleteAll: 'Tout supprimer',
    deleteCount: 'Supprimer ({count})',

    authWelcomeBack: 'Bon retour — reprenez là où vous vous êtes arrêté.',
    authSignupBody: 'Commencez à surveiller vos parcours gratuitement.',
    password: 'Mot de passe',
    noAccountYet: 'Pas encore de compte ?',
    alreadyHaveAccount: 'Vous avez déjà un compte ?',

    startMonitoring: 'Démarrer le monitoring',
    saveYourJourney: 'Enregistrer votre parcours',
    saveActivateScheduleBody:
      'Créez un compte gratuit pour activer le monitoring sur ce planning.',
    saveJourneyBody:
      'Créez un compte gratuit pour enregistrer et surveiller ce parcours en continu.',
    scheduleLabel: 'Planning',
    createAccountStartMonitoring: 'Créer un compte et démarrer le monitoring',
    createAccountAndSave: 'Créer un compte et enregistrer',
    freePlanNote: 'Sans carte bancaire · 12 runs/jour sur le plan gratuit',

    scheduleWhen: 'Quand ce parcours doit-il s’exécuter ?',
    frequency: 'Fréquence',
    locations: 'Emplacements',
    activeLabel: 'Actif',
    summary: 'Résumé',
    freqEvery5Min: 'Toutes les 5 minutes',
    freqEvery15Min: 'Toutes les 15 minutes',
    freqEvery30Min: 'Toutes les 30 minutes',
    freqEveryHour: 'Toutes les heures',
    hours247: '24/7',
    hoursBusiness: 'Heures ouvrées uniquement',
    hoursWeekdays: 'Jours ouvrés uniquement',
    locParis: 'Paris',
    locFrankfurt: 'Francfort',
    locLondon: 'Londres',
    locNewYork: 'New York',
    scheduleContinueActivate: 'Continuer — créer un compte pour activer',
    scheduleNothingRunsUntilSignup:
      'Le monitoring démarre après l’inscription — rien ne tourne avant.',

    assistant: 'Assistant',
    openAssistant: 'Ouvrir l’assistant',
    assistantTitle: 'Assistant — posez une question, naviguez dans l’app',
    assistantIntro:
      'Demandez-moi de naviguer, d’ouvrir une vue, ou d’expliquer quoi que ce soit dans ITRS DEM.',
    askAnything: 'Posez une question…',
    agentPromptNewJourney: 'Créer un nouveau parcours',
    agentPromptFailing: 'Voir les parcours en échec',
    agentPromptDashboard: 'Ouvrir le tableau de bord',
    dashboard: 'Tableau de bord',
    journeys: 'Parcours',
    phase2: 'Phase 2',

    stepLabel: 'Libellé',
    stepAction: 'Action',
    stepTarget: 'Cible',
    stepTimeout: 'Délai',
    technicalDetails: 'Détails techniques',
    addStep: '+ Ajouter une étape',
    newStep: 'Nouvelle étape',
    stepsProgress: '{done} / {total} étapes',
    actionNavigate: 'Naviguer',
    actionClick: 'Cliquer',
    actionType: 'Saisir',
    actionVerify: 'Vérifier',

    journeysSuggested: 'Voici les parcours que je propose — choisissez-en un dans le formulaire ci-dessous.',
    prepareJourney: 'Préparer le parcours',
    assistantUnavailable:
      'L’assistant est indisponible pour le moment. Réessaie dans un instant — je ne peux pas inventer un parcours hors ligne.',
  },
} as const

/** Canonical schedule option values (stored in JourneySchedule). */
export const SCHEDULE_FREQUENCIES = [
  'Every 5 minutes',
  'Every 15 minutes',
  'Every 30 minutes',
  'Every hour',
] as const

export const SCHEDULE_ACTIVE_HOURS = [
  '24/7',
  'Business hours only',
  'Weekdays only',
] as const

export const SCHEDULE_LOCATIONS = ['Paris', 'Frankfurt', 'London', 'New York'] as const

const SCHEDULE_VALUE_KEYS: Record<string, MessageKey> = {
  'Every 5 minutes': 'freqEvery5Min',
  'Every 15 minutes': 'freqEvery15Min',
  'Every 30 minutes': 'freqEvery30Min',
  'Every hour': 'freqEveryHour',
  '24/7': 'hours247',
  'Business hours only': 'hoursBusiness',
  'Weekdays only': 'hoursWeekdays',
  Paris: 'locParis',
  Frankfurt: 'locFrankfurt',
  London: 'locLondon',
  'New York': 'locNewYork',
}

export function localizeScheduleValue(locale: Locale, value: string): string {
  const key = SCHEDULE_VALUE_KEYS[value]
  return key ? messages[locale][key] : value
}

/** Rotating DEM target nouns for the homepage hero title. */
export const HOME_ROTATING_TARGETS: Record<Locale, readonly string[]> = {
  en: ['website', 'application', 'SaaS', 'API', 'portal'],
  fr: ['site web', 'application', 'SaaS', 'API', 'portail'],
}

export type MessageKey = keyof typeof messages.en

export function detectLocale(text: string): Locale | null {
  const trimmed = text.trim()
  if (!trimmed) return null
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

/** Replace `{name}` style placeholders in an i18n string. */
export function tf(
  locale: Locale,
  key: MessageKey,
  vars: Record<string, string | number>,
): string {
  let out = t(locale, key)
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}
