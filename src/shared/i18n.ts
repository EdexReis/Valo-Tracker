import { en } from './i18n.en'

/**
 * Tiny translation layer. The Turkish text is the key, so the code stays readable and a missing English
 * entry simply falls back to Turkish. `{name}` placeholders are filled from `vars`.
 *
 * The language is a module-level setting (not React state): the renderer remounts its tree when it changes,
 * and the main process sets it whenever the user saves settings.
 */
export type Lang = 'tr' | 'en'

let current: Lang = 'tr'

export function setLanguage(lang: Lang): void {
  current = lang === 'en' ? 'en' : 'tr'
}

export function getLanguage(): Lang {
  return current
}

/** BCP 47 tag for date and number formatting. */
export function locale(): string {
  return current === 'en' ? 'en-US' : 'tr-TR'
}

export function tr(key: string, vars?: Record<string, string | number>): string {
  const text = current === 'en' ? (en[key] ?? key) : key
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text
}
