import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  detectLocale,
  t as translate,
  type Locale,
  type MessageKey,
} from '../i18n/messages'

const STORAGE_KEY = 'itrs-dem-locale'

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  adaptToText: (text: string) => Locale
  t: (key: MessageKey) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function readStoredLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'fr' || value === 'en') return value
  } catch {
    // ignore
  }
  return 'en'
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale())

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next
    }
  }, [])

  const adaptToText = useCallback(
    (text: string) => {
      const detected = detectLocale(text)
      if (detected && detected !== locale) {
        setLocale(detected)
        return detected
      }
      return detected ?? locale
    },
    [locale, setLocale],
  )

  const t = useCallback((key: MessageKey) => translate(locale, key), [locale])

  const value = useMemo(
    () => ({ locale, setLocale, adaptToText, t }),
    [locale, setLocale, adaptToText, t],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
