import { tf, type Locale } from '../i18n/messages'

export type RunFailureDiagnosisInput = {
  stepIndex: number
  stepLabel: string
  stageTitle?: string
  error?: string | null
  action?: string | null
}

export type RunFailureKind =
  | 'form_field_not_found'
  | 'element_not_found'
  | 'timeout'
  | 'navigation'
  | 'click_blocked'
  | 'unknown'

/** Classify a Playwright / runner error into a product-facing failure kind. */
export function classifyRunFailure(
  error: string | null | undefined,
  action?: string | null,
  label?: string | null,
): RunFailureKind {
  const err = (error ?? '').toLowerCase()
  const act = (action ?? '').toLowerCase()
  const lab = (label ?? '').toLowerCase()

  if (/could not find the form field|refusing to type into an unrelated/i.test(err)) {
    return 'form_field_not_found'
  }
  if (/could not find a search field/i.test(err)) {
    return 'form_field_not_found'
  }
  if (/no url to navigate|net::err/i.test(err)) {
    return 'navigation'
  }
  if (/timeout|timed out|waiting for/i.test(err)) {
    return 'timeout'
  }
  // Our runner throws this when no locator resolved — missing target, not "blocked".
  if (/could not click target for:/i.test(err)) {
    return 'element_not_found'
  }
  if (/not editable|disabled|intercepts pointer|obscured|covered|receiving events/i.test(err)) {
    return 'click_blocked'
  }
  if (
    /could not click|not visible|not attached|strict mode violation|resolved to \d+ elements/i.test(
      err,
    )
  ) {
    return 'element_not_found'
  }
  if (act === 'type' || /^(type|taper|tape|sais)/i.test(lab)) {
    if (/could not|not found|timeout/i.test(err) || !err) return 'form_field_not_found'
  }
  if (act === 'click' || /cliquer|click/i.test(lab)) {
    // Submit / download CTAs often fail because the form is still invalid.
    if (/télécharge|download|brochure|submit|envoyer|valider/i.test(lab)) {
      return 'click_blocked'
    }
    return 'element_not_found'
  }
  if (act === 'navigate') {
    return err ? 'navigation' : 'unknown'
  }
  return 'unknown'
}

/**
 * Build a failure message that reflects the real runner error — not a canned
 * “page may have changed” line for every incident.
 */
export function describeRunFailure(
  failed: RunFailureDiagnosisInput,
  locale: Locale,
): { kind: RunFailureKind; content: string } {
  const kind = classifyRunFailure(failed.error, failed.action, failed.stepLabel)
  const stage = failed.stageTitle?.trim()
  const where = stage
    ? tf(locale, 'runFailWhereStage', { stage, action: failed.stepLabel })
    : tf(locale, 'runFailWhereAction', {
        n: failed.stepIndex + 1,
        label: failed.stepLabel,
      })

  const diagnosisKey =
    kind === 'form_field_not_found'
      ? 'runFailDiagFormField'
      : kind === 'timeout'
        ? 'runFailDiagTimeout'
        : kind === 'navigation'
          ? 'runFailDiagNavigation'
          : kind === 'click_blocked'
            ? 'runFailDiagClickBlocked'
            : kind === 'element_not_found'
              ? 'runFailDiagElement'
              : 'runFailDiagUnknown'

  const suggestionKey =
    kind === 'form_field_not_found'
      ? 'runFailSuggestFormField'
      : kind === 'timeout'
        ? 'runFailSuggestTimeout'
        : kind === 'navigation'
          ? 'runFailSuggestNavigation'
          : kind === 'click_blocked'
            ? 'runFailSuggestClickBlocked'
            : kind === 'element_not_found'
              ? 'runFailSuggestElement'
              : 'runFailSuggestUnknown'

  let suggestion = tf(locale, suggestionKey, {})
  // Brochure / submit CTAs: missing click target often means the button never appeared
  // because the form stayed invalid — surface that hypothesis without the old canned line.
  if (
    kind === 'element_not_found' &&
    /télécharge|brochure|download|submit|envoyer/i.test(failed.stepLabel)
  ) {
    suggestion = `${suggestion}\n\n${tf(locale, 'runFailSuggestClickBlocked', {})}`
  }

  const detail =
    failed.error && failed.error.trim().length > 0
      ? `\n\n${tf(locale, 'runFailTechnicalDetail', { error: trimError(failed.error) })}`
      : ''

  const content = `${where}\n\n${tf(locale, diagnosisKey, {})}\n\n${suggestion}${detail}`
  return { kind, content }
}

function trimError(error: string): string {
  const oneLine = error.replace(/\s+/g, ' ').trim()
  return oneLine.length > 220 ? `${oneLine.slice(0, 217)}…` : oneLine
}
