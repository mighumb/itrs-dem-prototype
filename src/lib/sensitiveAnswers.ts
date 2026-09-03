import { t, type Locale } from '../i18n/messages'

const SENSITIVE_FIELD =
  /e-?mail|mail|téléphone|telephone|phone|prénom|prenom|first\s*name|nom\b|last\s*name|coordonn|mot\s*de\s*passe|password|passwd|pwd|secret|otp|identifiant|username|user\s*name|login|utilisateur|carte|card|cvv|cvc|pin\b/i

export function isSensitiveAnswerField(prompt: string, questionId?: string): boolean {
  if (questionId === 'site-confirm' || questionId === 'site-url') return false
  return SENSITIVE_FIELD.test(prompt)
}

export function maskSensitiveValue(value: string, prompt: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed

  if (/password|passwd|pwd|secret|otp|pin\b|cvv|cvc/i.test(prompt)) {
    return '••••••••'
  }

  if (/e-?mail|mail|identifiant|username|login|utilisateur/i.test(prompt)) {
    const at = trimmed.indexOf('@')
    if (at > 0) {
      const local = trimmed.slice(0, at)
      const domain = trimmed.slice(at)
      const maskedLocal =
        local.length <= 1 ? '•' : `${local[0]}${'•'.repeat(Math.min(6, local.length - 1))}`
      return `${maskedLocal}${domain}`
    }
    return '••••••••'
  }

  if (trimmed.length <= 2) return '••'
  return `${trimmed[0]}${'•'.repeat(Math.min(8, trimmed.length - 1))}`
}

export function displayAnswerValue(prompt: string, answer: string, questionId?: string): string {
  if (!isSensitiveAnswerField(prompt, questionId)) return answer
  return maskSensitiveValue(answer, prompt)
}

export function formatQuestionnaireChatBlock(
  prompt: string,
  answer: string,
  locale: Locale,
  questionId?: string,
): string {
  const display = displayAnswerValue(prompt, answer, questionId)
  return `${t(locale, 'answerQ')} : ${prompt}\n${t(locale, 'answerR')} : ${display}`
}

/** Redact secrets from questionnaire Q/R blocks before sending chat history to Gemini. */
export function redactSensitiveChatContent(content: string): string {
  return maskFreeformUserChatContent(content)
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split('\n')
      if (lines.length < 2) return block
      const promptLine = lines[0] ?? ''
      const answerLine = lines[1] ?? ''
      const promptMatch = promptLine.match(/^[QA]\s*:\s*(.+)$/i)
      const answerMatch = answerLine.match(/^[QA]\s*:\s*(.+)$/i)
      if (!promptMatch || !answerMatch) return block
      const prompt = promptMatch[1]!.trim()
      const answer = answerMatch[1]!.trim()
      if (!isSensitiveAnswerField(prompt)) return block
      const prefix = answerLine.match(/^[QA]\s*:/i)?.[0] ?? 'R :'
      return `${promptLine}\n${prefix} ${maskSensitiveValue(answer, prompt)}`
    })
    .join('\n\n')
}

/** Mask secrets typed in free-form chat (workspace) before display or API history. */
export function maskFreeformUserChatContent(content: string): string {
  let masked = content
  masked = masked.replace(
    /(password|mot de passe|mdp|pwd|secret|otp|pin)\s*[:=]\s*\S+/gi,
    (_, label) => `${label}: ••••••••`,
  )
  masked = masked.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (email) =>
    maskSensitiveValue(email, 'email'),
  )
  return masked
}

/**
 * Display-only redaction for plan step labels / agent bubbles.
 * Keeps stored runnable values intact — never use this as the Type value for Playwright.
 */
export function maskSensitiveDisplayText(content: string): string {
  return maskFreeformUserChatContent(content)
}
