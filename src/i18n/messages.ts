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
    sampleJourneys: 'Start one of these journeys to try it out',
    placeholderIdle: 'Give a name or paste a URL…',
    placeholderReply: 'Or reply directly…',
    placeholderPlanning: 'Ask to change a step, or refine the plan…',
    placeholderBrainstorm: 'Continue brainstorming…',
    composerNewlineHint: 'Tab + Enter for a new line',
    placeholderWorkspace: 'Ask or refine the journey…',
    refineJourney: 'Refine the journey',
    chooseJourney: 'Choose a journey',
    confirmSite: 'Confirm the site',
    clarifyRequest: 'Clarify your request',
    stepsWillAppear: 'Steps will appear here as the agent builds your journey.',
    openUrl: 'Open {url}',
    verifyPageLoaded: 'Verify page loaded',
    answerQ: 'Q',
    answerR: 'A',
    somethingElse: 'Something else…',
    other: 'Other…',
    skip: 'Skip',
    dismiss: 'Dismiss',
    continueNext: 'Next',
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
    agentTranslating: 'Translating the form…',
    agentEmptyReply:
      "I didn't get a clear reply — try rephrasing, or name a site or journey to monitor.",
    formRelocalizeFailed:
      "Couldn't translate the floating form — it's still in the previous language. You can keep answering or switch back.",
    answerYes: 'Yes',
    answerNo: 'No',
    initialNeedLabel: 'Initial request:',
    workTraceLabel: 'Behind the scenes',

    // Workspace chrome
    panelAgent: 'Agent',
    panelJourney: 'User journey',
    panelBrowser: 'Browser',
    panelMonitoring: 'Monitoring',
    panelJourneyCount: 'User journey ({count})',
    journeyRunOk: 'Journey completed successfully',
    journeyRunFailed: 'Journey failed',
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
    actionInProgress: 'Action in progress',
    takeControl: 'Take control',
    recording: 'Recording',
    extensionHint: 'Record in your Chrome when sites block the bot',
    extensionChecking: 'Looking for the Chrome extension…',
    extensionImporting: 'Importing recorded steps…',
    extensionMissingTitle: 'Install the Chrome extension (dev mode)',
    extensionInstallStep1: 'Open chrome://extensions',
    extensionInstallStep2: 'Enable Developer mode',
    extensionInstallStep3: 'Load unpacked → select the extension/ folder in this repo',
    extensionInstallStep4: 'Reload this page, then try again',
    extensionRetry: 'I installed it — retry',
    extensionReadyTitle: 'Take control with your browser',
    extensionReadyBody:
      'We open a Chrome tab with a red REC bar. Browse there (product, cart…). This panel shows a live mirror while that tab is focused.',
    extensionWillOpen: 'Will open:',
    extensionStart: 'Start recording',
    extensionRecordingTitle: 'Recording — use the Chrome tab with the red bar',
    extensionRecordingBody:
      'Interact in that tab (or tabs/windows opened from it). This panel mirrors the focused recording tab. Passwords are ignored.',
    extensionMirrorHint:
      'Focus the Chrome tab with the red REC bar to see the live view here, then keep browsing there.',
    extensionLiveView: 'Live view of recording tab',
    extensionFocusTab: 'Show / reopen recording tab',
    extensionStepCount: '{count} step(s) captured',
    extensionStopImport: 'Stop & import steps',
    extensionAbort: 'Discard',
    extensionStartFailed: 'Could not reach the extension. Is it enabled on this page?',
    extensionNoSteps: 'No steps recorded yet. Browse the site, then try again.',
    extensionImported: 'Imported {count} step(s) from your Chrome recording. You can edit or Run them.',
    downloadJsonFile: 'Download JSON file',
    jsonAttachmentHint: 'JSON · click to download',

    playwrightCapture: 'Playwright capture',
    browserPreview: 'Browser preview',
    browserPreviewHint: 'Run a journey to watch real Playwright screenshots step by step',
    browserScreenshotAlt: 'Browser screenshot',
    expandScreenshot: 'Enlarge screenshot',
    closeScreenshot: 'Close screenshot',
    previousScreenshot: 'Previous screenshot',
    nextScreenshot: 'Next screenshot',

    // Monitoring
    availability: 'Availability',
    totalTime: 'Total time',
    issues: 'Issues',
    closeMonitoring: 'Close monitoring',
    noExecutedSteps: 'No executed steps yet. Run the journey to populate monitoring.',
    newStepsAppear: 'New steps appear here after you run the journey.',
    signUpToUnlockMonitoring: 'to unlock full monitoring.',
    liveMonitoringActive: 'Live monitoring for this journey.',
    monitoringFromThisRun: 'Metrics from this Playwright run.',
    exportJourneyJson: 'Export journey JSON',
    exportRunReportJson: 'Export run report (JSON)',
    exportMenu: 'Export',
    monitoringSimulatedBanner: 'Simulated — no live metrics from Playwright.',
    monitoringPageUrl: 'Page URL',
    monitoringPageTitle: 'Page title',
    monitoringCapture: 'Capture',
    monitoringCaptureAlt: 'Capture for {label}',
    stepN: 'Action {n}',
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
    selectAllActions: 'Select all actions',
    selectAction: 'Select action',
    selectStage: 'Select stage',
    dragToReorder: 'Drag to reorder',
    deleteStep: 'Delete step',
    deleteAction: 'Delete action',
    deleteStage: 'Delete stage',
    addStage: '+ Add stage',
    addAction: '+ Add action',
    newStage: 'New stage',
    newAction: 'New action',
    stageN: 'Stage {n}',
    stageTitle: 'Stage title',
    stageEmpty: 'No actions',
    stageEmptyHint: 'Empty stage — add an action to run something here.',
    stageActionCount: '{count} action(s)',
    openDetached: 'Open in detached window',
    closePanel: 'Close panel',
    dockBack: 'Dock back to workspace',
    restorePanel: 'Restore panel',
    dragToRestore: 'Drag into the workspace to restore',

    // System / run chat (workspace)
    journeyReady:
      'Journey ready — **{name}** ({count} actions). Use **Run** in User journey to replay, or **Edit** to adjust stages and actions.',
    suggestedSchedule: 'Suggested schedule:',
    scheduleOptionPrimary: 'Every 15 min, Paris + Frankfurt',
    scheduleCustomize: 'Customize',
    scheduleSkip: 'Skip for now',
    runCompleteAll: 'Run complete — all **{count} actions** executed successfully.',
    runComplete: 'Run complete — all actions executed successfully.',
    runStoppedAt:
      'Run stopped at action {n} — **{label}** could not complete. Remaining actions were not executed.',
    runStoppedAtStageAction:
      'Run stopped at stage **{stage}** — action **{action}** could not complete. Remaining actions were not executed.',
    runFailWhereAction:
      'Run stopped at action {n} — **{label}**. Remaining actions were not executed.',
    runFailWhereStage:
      'Run stopped at stage **{stage}** — action **{action}**. Remaining actions were not executed.',
    runFailDiagFormField:
      'Likely cause: the value was not typed into the expected form field (wrong or missing field on the page).',
    runFailDiagElement:
      'Likely cause: the click/tap target was not found or not unique on the page at that moment.',
    runFailDiagTimeout:
      'Likely cause: the page or element took too long to become ready (timeout).',
    runFailDiagNavigation:
      'Likely cause: navigation to the target URL failed or was blocked.',
    runFailDiagClickBlocked:
      'Likely cause: the control was present but not clickable yet (disabled, covered, or form still invalid).',
    runFailDiagUnknown:
      'I could not map this to a single cause from the runner signal alone.',
    runFailSuggestFormField:
      'Next: check that each Type step names the field (Nom / Email / …) and that the field exists on the current page, then retry.',
    runFailSuggestElement:
      'Next: I can broaden the locator for this action and continue from here.',
    runFailSuggestTimeout:
      'Next: retry the run; if it keeps timing out, simplify the step or wait for a clearer page state.',
    runFailSuggestNavigation:
      'Next: verify the URL for this Navigate step, then retry.',
    runFailSuggestClickBlocked:
      'Next: confirm earlier form fields are valid so the button enables, then retry the click — I can also refresh the locator.',
    runFailSuggestUnknown:
      'Next: I can retry with a refreshed locator, or you can adjust the step in Edit.',
    runFailTechnicalDetail: 'Runner detail: `{error}`',
    fixAndContinue: 'Fix and continue',
    fixAndRetry: 'Adjust and retry',
    stepFailedStopping: 'Action {n} failed — **{label}**. Stopping here.',
    stepFailedAtStageAction: 'Failed at stage **{stage}** — action **{action}**. Stopping here.',
    stepDone: 'Action {n} done — {label}',
    replayingSteps:
      'Replaying **{count} actions** in the browser — watch real screenshots sync with each action.',
    scheduleAcceptedUser: 'Every 15 min, Paris + Frankfurt',
    scheduleAcceptedAgent: 'Perfect. Create an account to start monitoring on this schedule.',
    scheduleCustomAgent: 'Perfect — **{summary}**. Create an account to activate monitoring.',
    skipMonitoringHint: 'No problem. Open **Monitoring** from the panel bar anytime to see a preview.',
    fixLocatorUpdated:
      '**Automatic locator tweak** (not a full AI rewrite) — I updated **{label}** (`{from}` → `{to}`). Continuing from here.',
    fixLocatorRefreshed:
      '**Automatic locator tweak** — I refreshed the target for **{label}** to match the current page. Continuing from here.',
    stillRunningBusy:
      "I'm still running the journey — we can refine it once the run finishes.",
    chatQueuedWhileRunning:
      "Message saved — I'll answer as soon as the run finishes.",
    dryRunPartialWarning:
      '**Heads-up:** the browser dry-run flagged a fragile step (see Behind the scenes). You can still Run, but expect a possible hiccup.',
    planNotAppliedHint:
      '**Not applied yet** — the Steps panel is unchanged. Say “apply it” or “update the plan” when you want me to commit the change.',
    planAppliedFromPending:
      'Applied the pending plan to the Steps panel:',
    planStepsAdded: '**{delta} step(s) added** to the journey.',
    planStepsRemoved: '**{delta} step(s) removed** from the journey.',
    workspaceReadyToRun:
      'Journey is ready — review the steps, chat to refine, then press **Run** in User journey when you want a live Playwright replay.',
    workspacePlanPatchedIntro:
      'I updated the journey plan (form open before fills). Here are the steps in the conversation:',
    workspacePlanSyncIntro: 'Here is the journey plan as it will be replayed:',
    workspacePlanLocaleCleanIntro:
      'Good catch — I removed superfluous steps tied to the `/fr/` URL prefix. Here is the cleaned plan — you can Run:',
    workspacePlanFormPatchIntro:
      'I added the form-open click before the fill steps — here is the updated plan:',
    workspacePlanShowIntro: 'Here is the full plan, shown in the conversation:',
    extensionRecordingAgentNote:
      'Imported steps stay authoritative for Run — ask me to **apply** a change if you want the panel updated.',
    runnerMonitoringUnavailable:
      'No live metrics yet — the browser runner was unavailable for this attempt. Fix connectivity or retry Run.',
    globalAgentInputHint: 'Discovery chat lives on Home — use quick links below or open Home.',
    readyToRunSubtitle: 'Ready to run',
    layoutStable: 'Stable',
    layoutMostlyStable: 'Mostly stable',
    layoutUnstable: 'Unstable',
    statusWorkingWell: 'Working well',
    statusNeedsAttention: 'Needs attention',
    statusNotWorking: 'Not working',
    insightStepFailing:
      'This step could not finish — see the agent diagnosis for the likely cause.',
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
    stepsProgress: '{done} / {total} actions',
    actionNavigate: 'Navigate',
    actionClick: 'Click',
    actionType: 'Type',
    actionVerify: 'Verify',

    // Discovery / home agent chrome
    journeysSuggested: 'Here are the journeys I suggest — pick one in the form below.',
    prepareJourney: 'Prepare journey',
    assistantUnavailable:
      'The assistant is unavailable right now. Try again in a moment — I won’t invent an offline journey.',
    assistantQuotaExceeded:
      'The AI quota is temporarily exhausted. Wait a minute and try again.',
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
    sampleJourneys: 'Lancez un de ces parcours pour essayer',
    placeholderIdle: 'Donnez un nom ou collez une URL…',
    placeholderReply: 'Ou répondez directement…',
    placeholderPlanning: 'Demandez à modifier une étape, ou affinez le plan…',
    placeholderBrainstorm: 'Continuez le brainstorm…',
    composerNewlineHint: 'Tab + Entrée pour un retour à la ligne',
    placeholderWorkspace: 'Demandez ou affinez le parcours…',
    refineJourney: 'Affiner le parcours',
    chooseJourney: 'Choisir un parcours',
    confirmSite: 'Confirmer le site',
    clarifyRequest: 'Préciser votre demande',
    stepsWillAppear: 'Les étapes apparaîtront ici au fur et à mesure.',
    openUrl: 'Ouvrir {url}',
    verifyPageLoaded: 'Vérifier que la page est chargée',
    answerQ: 'Q',
    answerR: 'R',
    somethingElse: 'Autre chose…',
    other: 'Autre…',
    skip: 'Passer',
    dismiss: 'Fermer',
    continueNext: 'Suivant',
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
    agentTranslating: 'Traduction du formulaire…',
    agentEmptyReply:
      "Je n'ai pas de réponse claire — reformule, ou indique un site / un parcours à monitorer.",
    formRelocalizeFailed:
      "Impossible de traduire le formulaire — il reste dans la langue précédente. Tu peux continuer ou revenir à l'autre langue.",
    answerYes: 'Oui',
    answerNo: 'Non',
    initialNeedLabel: 'Besoin initial :',
    workTraceLabel: 'En coulisses',

    panelAgent: 'Agent',
    panelJourney: 'Parcours utilisateur',
    panelBrowser: 'Navigateur',
    panelMonitoring: 'Monitoring',
    panelJourneyCount: 'Parcours utilisateur ({count})',
    journeyRunOk: 'Parcours exécuté correctement',
    journeyRunFailed: 'Parcours en échec',
    newJourney: 'Nouveau parcours',
    running: 'En cours…',
    starting: 'Démarrage…',
    stopRun: 'Arrêter le run',
    runJourneyInBrowser: 'Lancer le parcours dans le navigateur',
    edit: 'Modifier',
    done: 'Terminer',
    editSteps: 'Modifier les étapes',
    doneEditing: 'Terminer la modification',
    live: 'Live',
    actionInProgress: 'Action en cours',
    takeControl: 'Prendre le contrôle',
    recording: 'Enregistrement',
    extensionHint: 'Enregistrez dans Chrome si le site bloque le bot',
    extensionChecking: 'Recherche de l’extension Chrome…',
    extensionImporting: 'Import des étapes enregistrées…',
    extensionMissingTitle: 'Installer l’extension Chrome (mode développeur)',
    extensionInstallStep1: 'Ouvrez chrome://extensions',
    extensionInstallStep2: 'Activez le mode Développeur',
    extensionInstallStep3: 'Chargez l’extension non empaquetée → dossier extension/ du repo',
    extensionInstallStep4: 'Rechargez cette page, puis réessayez',
    extensionRetry: 'C’est installé — réessayer',
    extensionReadyTitle: 'Prendre le contrôle avec votre navigateur',
    extensionReadyBody:
      'On ouvre un onglet Chrome avec une barre rouge REC. Naviguez là-bas (produit, panier…). Ce panneau affiche un miroir live tant que cet onglet est au premier plan.',
    extensionWillOpen: 'Ouverture :',
    extensionStart: 'Démarrer l’enregistrement',
    extensionRecordingTitle: 'Enregistrement — utilisez l’onglet Chrome avec la barre rouge',
    extensionRecordingBody:
      'Naviguez dans cet onglet (ou les onglets/fenêtres ouverts depuis celui-ci). Ce panneau reflète l’onglet d’enregistrement au premier plan. Les mots de passe sont ignorés.',
    extensionMirrorHint:
      'Mettez au premier plan l’onglet Chrome avec la barre REC rouge pour voir la vue live ici, puis continuez à naviguer là-bas.',
    extensionLiveView: 'Vue live de l’onglet d’enregistrement',
    extensionFocusTab: 'Afficher / rouvrir l’onglet',
    extensionStepCount: '{count} étape(s) capturée(s)',
    extensionStopImport: 'Arrêter et importer',
    extensionAbort: 'Abandonner',
    extensionStartFailed: 'Extension inaccessible. Est-elle activée sur cette page ?',
    extensionNoSteps: 'Aucune étape pour l’instant. Naviguez sur le site, puis réessayez.',
    extensionImported: '{count} étape(s) importée(s) depuis Chrome. Vous pouvez les modifier ou Lancer.',
    downloadJsonFile: 'Télécharger le fichier JSON',
    jsonAttachmentHint: 'JSON · cliquer pour télécharger',

    playwrightCapture: 'Capture Playwright',
    browserPreview: 'Aperçu navigateur',
    browserPreviewHint:
      'Lance un parcours pour voir les captures Playwright étape par étape',
    browserScreenshotAlt: 'Capture d’écran navigateur',
    expandScreenshot: 'Agrandir la capture',
    closeScreenshot: 'Fermer la capture',
    previousScreenshot: 'Capture précédente',
    nextScreenshot: 'Capture suivante',

    availability: 'Disponibilité',
    totalTime: 'Temps total',
    issues: 'Incidents',
    closeMonitoring: 'Fermer le monitoring',
    noExecutedSteps: 'Aucune étape exécutée. Lance le parcours pour alimenter le monitoring.',
    newStepsAppear: 'Les nouvelles étapes apparaissent ici après un run.',
    signUpToUnlockMonitoring: 'pour débloquer le monitoring complet.',
    liveMonitoringActive: 'Monitoring actif pour ce parcours.',
    monitoringFromThisRun: 'Métriques de ce run Playwright.',
    exportJourneyJson: 'Exporter le parcours (JSON)',
    exportRunReportJson: 'Exporter le rapport de run (JSON)',
    exportMenu: 'Exporter',
    monitoringSimulatedBanner: 'Simulé — pas de métriques live Playwright.',
    monitoringPageUrl: 'URL de la page',
    monitoringPageTitle: 'Titre de la page',
    monitoringCapture: 'Capture',
    monitoringCaptureAlt: 'Capture pour {label}',
    stepN: 'Action {n}',
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
    selectAllActions: 'Tout sélectionner',
    selectAction: 'Sélectionner l’action',
    selectStage: 'Sélectionner l’étape',
    dragToReorder: 'Glisser pour réordonner',
    deleteStep: 'Supprimer l’étape',
    deleteAction: 'Supprimer l’action',
    deleteStage: 'Supprimer l’étape',
    addStage: '+ Ajouter une étape',
    addAction: '+ Ajouter une action',
    newStage: 'Nouvelle étape',
    newAction: 'Nouvelle action',
    stageN: 'Étape {n}',
    stageTitle: 'Titre de l’étape',
    stageEmpty: 'Aucune action',
    stageEmptyHint: 'Étape vide — ajoute une action pour qu’il se passe quelque chose ici.',
    stageActionCount: '{count} action(s)',
    openDetached: 'Ouvrir dans une fenêtre détachée',
    closePanel: 'Fermer le panneau',
    dockBack: 'Réancrer dans l’espace de travail',
    restorePanel: 'Restaurer le panneau',
    dragToRestore: 'Glisser dans l’espace de travail pour restaurer',

    journeyReady:
      'Parcours prêt — **{name}** ({count} actions). Utilise **Lancer** dans Parcours utilisateur pour rejouer, ou **Modifier** pour ajuster les étapes et actions.',
    suggestedSchedule: 'Planification suggérée :',
    scheduleOptionPrimary: 'Toutes les 15 min, Paris + Francfort',
    scheduleCustomize: 'Personnaliser',
    scheduleSkip: 'Passer pour l’instant',
    runCompleteAll: 'Run terminé — les **{count} actions** ont toutes réussi.',
    runComplete: 'Run terminé — toutes les actions ont réussi.',
    runStoppedAt:
      'Run arrêté à l’action {n} — **{label}** n’a pas pu aboutir. Les actions suivantes n’ont pas été exécutées.',
    runStoppedAtStageAction:
      'Run arrêté à l’étape **{stage}** — action **{action}**. Les actions suivantes n’ont pas été exécutées.',
    runFailWhereAction:
      'Run arrêté à l’action {n} — **{label}**. Les actions suivantes n’ont pas été exécutées.',
    runFailWhereStage:
      'Run arrêté à l’étape **{stage}** — action **{action}**. Les actions suivantes n’ont pas été exécutées.',
    runFailDiagFormField:
      'Cause probable : la valeur n’a pas été saisie dans le bon champ du formulaire (champ introuvable ou mal ciblé).',
    runFailDiagElement:
      'Cause probable : la cible du clic n’a pas été trouvée (ou n’était pas unique) sur la page à cet instant.',
    runFailDiagTimeout:
      'Cause probable : la page ou l’élément a mis trop longtemps à être prêt (timeout).',
    runFailDiagNavigation:
      'Cause probable : la navigation vers l’URL cible a échoué ou a été bloquée.',
    runFailDiagClickBlocked:
      'Cause probable : le contrôle était là mais pas cliquable (désactivé, masqué, ou formulaire encore invalide).',
    runFailDiagUnknown:
      'Je n’ai pas pu ramener cet incident à une seule cause à partir du signal runner.',
    runFailSuggestFormField:
      'Suite : vérifier que chaque step Type nomme le champ (Nom / Email / …) et qu’il existe sur la page, puis relancer.',
    runFailSuggestElement:
      'Suite : je peux élargir le localisateur de cette action et reprendre ici.',
    runFailSuggestTimeout:
      'Suite : relancer le run ; si ça timeout encore, simplifier l’étape ou attendre un état de page plus clair.',
    runFailSuggestNavigation:
      'Suite : vérifier l’URL de cette étape Navigate, puis réessayer.',
    runFailSuggestClickBlocked:
      'Suite : confirmer que les champs précédents sont valides pour activer le bouton, puis réessayer le clic — je peux aussi rafraîchir le localisateur.',
    runFailSuggestUnknown:
      'Suite : je peux réessayer avec un localisateur rafraîchi, ou tu peux ajuster l’étape en Edit.',
    runFailTechnicalDetail: 'Détail runner : `{error}`',
    fixAndContinue: 'Corriger et continuer',
    fixAndRetry: 'Ajuster et réessayer',
    stepFailedStopping: 'Action {n} en échec — **{label}**. Arrêt ici.',
    stepFailedAtStageAction: 'Échec à l’étape **{stage}** — action **{action}**. Arrêt ici.',
    stepDone: 'Action {n} terminée — {label}',
    replayingSteps:
      'Rejeu de **{count} actions** dans le navigateur — les captures suivent chaque action.',
    scheduleAcceptedUser: 'Toutes les 15 min, Paris + Francfort',
    scheduleAcceptedAgent:
      'Parfait. Crée un compte pour démarrer le monitoring sur ce planning.',
    scheduleCustomAgent:
      'Parfait — **{summary}**. Crée un compte pour activer le monitoring.',
    skipMonitoringHint:
      'Pas de souci. Ouvre **Monitoring** depuis la barre de panneaux quand tu veux un aperçu.',
    fixLocatorUpdated:
      '**Ajustement automatique du localisateur** (pas une réécriture IA complète) — j’ai mis à jour **{label}** (`{from}` → `{to}`). Je continue.',
    fixLocatorRefreshed:
      '**Ajustement automatique du localisateur** — j’ai rafraîchi la cible pour **{label}** sur la page actuelle. Je continue.',
    stillRunningBusy:
      'Je suis encore en train d’exécuter le parcours — on pourra l’affiner dès que le run est terminé.',
    chatQueuedWhileRunning:
      'Message enregistré — je réponds dès que le run est terminé.',
    dryRunPartialWarning:
      '**Attention :** la répétition navigateur a signalé une étape fragile (voir En coulisses). Tu peux quand même Lancer, mais un accroc est possible.',
    planNotAppliedHint:
      '**Pas encore appliqué** — le panneau Étapes n’a pas changé. Dis « applique » ou « mets le plan à jour » pour valider.',
    planAppliedFromPending:
      'Plan en attente appliqué au panneau Étapes :',
    planStepsAdded: '**{delta} étape(s) ajoutée(s)** au parcours.',
    planStepsRemoved: '**{delta} étape(s) retirée(s)** du parcours.',
    workspaceReadyToRun:
      'Parcours prêt — relis les étapes, affine dans le chat, puis **Lancer** dans Parcours utilisateur pour un rejeu Playwright live.',
    workspacePlanPatchedIntro:
      'J’ai mis à jour le plan (ouverture du formulaire avant les saisies). Voici les étapes dans la conversation :',
    workspacePlanSyncIntro: 'Voici le plan du parcours tel qu’il sera rejoué :',
    workspacePlanLocaleCleanIntro:
      'Bien vu — j’ai retiré les étapes superflues liées au préfixe `/fr/` de l’URL. Voici le plan nettoyé — tu peux Lancer :',
    workspacePlanFormPatchIntro:
      'J’ai ajouté le clic d’ouverture du formulaire avant les saisies — voici le plan à jour :',
    workspacePlanShowIntro: 'Voici le plan complet, affiché dans la conversation :',
    extensionRecordingAgentNote:
      'Les étapes importées restent la référence pour Lancer — demande-moi d’**appliquer** si tu veux mettre à jour le panneau.',
    runnerMonitoringUnavailable:
      'Pas encore de métriques live — le runner navigateur était indisponible sur cette tentative. Vérifie la connectivité ou relance.',
    globalAgentInputHint:
      'Le chat Discovery est sur l’accueil — utilise les raccourcis ci-dessous ou ouvre l’accueil.',
    readyToRunSubtitle: 'Prêt à lancer',
    layoutStable: 'Stable',
    layoutMostlyStable: 'Plutôt stable',
    layoutUnstable: 'Instable',
    statusWorkingWell: 'Fonctionne bien',
    statusNeedsAttention: 'À surveiller',
    statusNotWorking: 'Ne fonctionne pas',
    insightStepFailing:
      'Cette étape n’a pas pu aboutir — voir le diagnostic agent pour la cause probable.',
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
    stepsProgress: '{done} / {total} actions',
    actionNavigate: 'Naviguer',
    actionClick: 'Cliquer',
    actionType: 'Saisir',
    actionVerify: 'Vérifier',

    journeysSuggested: 'Voici les parcours que je propose — choisissez-en un dans le formulaire ci-dessous.',
    prepareJourney: 'Préparer le parcours',
    assistantUnavailable:
      'L’assistant est indisponible pour le moment. Réessaie dans un instant — je ne peux pas inventer un parcours hors ligne.',
    assistantQuotaExceeded:
      'Quota IA temporairement épuisé. Attends une minute puis réessaie.',
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
