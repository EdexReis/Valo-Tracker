/** One season entry of Riot's MMR response (only the fields used here). */
export interface SeasonEntry {
  CompetitiveTier?: number
  RankedRating?: number
  /** wins per tier reached during the act, keyed by tier number: the highest key is the act's peak */
  WinsByTier?: Record<string, number> | null
}

export interface RankAnalysis {
  currentTier: number
  currentRR: number
  peakTier: number
  /** the act the peak was reached in; the most recent one when several share it */
  peakSeasonId: string | null
  /** finished acts with a rank, newest first */
  past: Array<{ seasonId: string; tier: number }>
}

/**
 * Current rank, peak rank (with its season) and the last finished acts, from the per-season MMR data.
 * `order` gives a sortable value (e.g. the act's start time) so "newest" is well defined.
 */
export function analyzeSeasons(
  seasons: Record<string, SeasonEntry> | null | undefined,
  activeSeasonId: string | null,
  order: (seasonId: string) => number,
  pastCount = 3
): RankAnalysis {
  const entries = Object.entries(seasons ?? {})
  const active = activeSeasonId ? seasons?.[activeSeasonId] : undefined
  const currentTier = active?.CompetitiveTier ?? 0
  const currentRR = currentTier > 0 ? (active?.RankedRating ?? 0) : 0

  const seasonPeak = (s: SeasonEntry | undefined): number =>
    Math.max(s?.CompetitiveTier ?? 0, ...Object.keys(s?.WinsByTier ?? {}).map(Number).filter(Number.isFinite))

  let peakTier = 0
  let peakSeasonId: string | null = null
  for (const [id, s] of entries) {
    const p = seasonPeak(s)
    if (p > peakTier || (p > 0 && p === peakTier && peakSeasonId !== null && order(id) > order(peakSeasonId))) {
      peakTier = p
      peakSeasonId = id
    }
  }
  if (currentTier > peakTier) {
    peakTier = currentTier
    peakSeasonId = activeSeasonId
  }

  const past = entries
    .filter(([id, s]) => id !== activeSeasonId && (s?.CompetitiveTier ?? 0) > 0)
    .sort((a, b) => order(b[0]) - order(a[0]))
    .slice(0, pastCount)
    .map(([seasonId, s]) => ({ seasonId, tier: s.CompetitiveTier as number }))

  return { currentTier, currentRR, peakTier, peakSeasonId, past }
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 }

/** "EPISODE 9 ACT II" -> "E9 A2". Anything else is returned unchanged. */
export function shortSeasonName(name: string): string {
  const m = name.match(/EPISODE\s*(\d+)\s*ACT\s*(\d+|[IVX]+)/i)
  if (!m) return name
  const act = /^\d+$/.test(m[2]) ? m[2] : (ROMAN[m[2].toUpperCase()] ?? m[2])
  return `E${m[1]} A${act}`
}
