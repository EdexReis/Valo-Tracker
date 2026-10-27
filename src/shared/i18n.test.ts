import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { en } from './i18n.en'
import { getLanguage, locale, setLanguage, tr } from './i18n'
import { REGION_OPTIONS } from './options'

const SRC = resolve(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name) && !/i18n/.test(e.name) ? [p] : []
  })
}

/** String literals passed as the first argument of tr(...), looking through ?: and parentheses. */
function literalsOf(node: ts.Expression): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text]
  if (ts.isParenthesizedExpression(node)) return literalsOf(node.expression)
  if (ts.isConditionalExpression(node)) return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)]
  return []
}

function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  for (const file of sourceFiles(SRC)) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr' && n.arguments[0]) {
        for (const k of literalsOf(n.arguments[0])) keys.set(k, file.slice(SRC.length + 1))
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return keys
}

/** Texts that reach tr() through a variable (module-level labels), so the scan above cannot see them. */
const DYNAMIC_KEYS = [
  // tab labels
  'Canlı Maç', 'İstatistik', 'Kariyer / Geçmiş', 'Koleksiyon', 'Nişangah' + 'lar', 'AI Koç', 'Mağaza', 'Ayarlar', 'Günlük',
  // result labels, stored queue names, VTS component labels
  'Galibiyet', 'Mağlubiyet', 'Berabere', 'Rekabetçi', 'Derecesiz', 'Özel',
  'Çatışma skoru (ACS / beklenen)', 'Raund hasarı (ADR)', 'Açılış düelloları (ilk kan / ilk ölüm)', 'Multikill / clutch', 'Destek (asist)', 'Raund galibiyeti',
  // weapon buckets, constants used at call time
  'Yetenek', 'Düşme', 'Diğer',
  '🚨 VALORANT: Maç bulundu! Hemen bilgisayar başına dön!', '✅ Valo Tracker: Telegram bağlantısı çalışıyor.',
  'AI Koç sunucusuna (LM Studio / Ollama) ulaşılamadı. Lütfen yerel sunucuyu başlatın.',
  ...REGION_OPTIONS.map((o) => o.label)
]

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

afterEach(() => setLanguage('tr'))

describe('translation coverage', () => {
  const keys = usedKeys()

  it('finds the translation calls it is meant to check', () => {
    expect(keys.size).toBeGreaterThan(200)
  })

  it('has an English text for every tr("...") key', () => {
    const missing = [...keys].filter(([k]) => !(k in en)).map(([k, f]) => `${f}: ${k.slice(0, 70)}`)
    expect(missing).toEqual([])
  })

  it('has an English text for every label that is translated through a variable', () => {
    expect(DYNAMIC_KEYS.filter((k) => !(k in en))).toEqual([])
  })

  it('keeps the same {placeholders} in both languages', () => {
    const bad = Object.entries(en)
      .filter(([k, v]) => placeholders(k).join() !== placeholders(v).join())
      .map(([k]) => k.slice(0, 70))
    expect(bad).toEqual([])
  })
})

describe('tr()', () => {
  it('returns the Turkish key as is and fills placeholders', () => {
    expect(tr('Oyuncu {n}', { n: 3 })).toBe('Oyuncu 3')
  })

  it('translates and fills placeholders in English', () => {
    setLanguage('en')
    expect(getLanguage()).toBe('en')
    expect(tr('Oyuncu {n}', { n: 3 })).toBe('Player 3')
    expect(locale()).toBe('en-US')
  })

  it('falls back to the key when there is no translation', () => {
    setLanguage('en')
    expect(tr('Bu metin sözlükte yok')).toBe('Bu metin sözlükte yok')
  })
})
