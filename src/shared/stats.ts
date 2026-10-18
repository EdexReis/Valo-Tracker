import type { MatchSummary } from './types'

export const RANKED_QUEUES = ['competitive', 'unrated']

export const isRankedLike = (m: MatchSummary): boolean => RANKED_QUEUES.includes(m.queueId)

export interface GroupStat {
  key: string
  icon: string | null
  games: number
  wins: number
  winRate: number // 0-100
  kd: number
  acs: number
  vts: number
}

const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const r2 = (n: number): number => Math.round(n * 100) / 100

/** Groups matches by `keyFn` and averages the main stats. */
export function groupStats(
  matches: MatchSummary[],
  keyFn: (m: MatchSummary) => string,
  iconFn?: (m: MatchSummary) => string | null
): GroupStat[] {
  const groups = new Map<string, MatchSummary[]>()
  for (const m of matches) {
    const k = keyFn(m)
    groups.set(k, [...(groups.get(k) ?? []), m])
  }
  return [...groups.entries()]
    .map(([key, ms]) => {
      const wins = ms.filter((m) => m.result === 'win').length
      const decided = ms.filter((m) => m.result !== 'draw').length
      return {
        key,
        icon: iconFn ? iconFn(ms[0]) : null,
        games: ms.length,
        wins,
        winRate: decided ? Math.round((wins / decided) * 100) : 0,
        kd: r2(ms.reduce((a, m) => a + m.kills, 0) / Math.max(1, ms.reduce((a, m) => a + m.deaths, 0))),
        acs: Math.round(avg(ms.map((m) => m.acs))),
        vts: Math.round(avg(ms.filter((m) => m.vts).map((m) => m.vts!.score)))
      }
    })
    .sort((a, b) => b.games - a.games)
}

export interface Totals {
  games: number
  winRate: number
  kd: number
  acs: number
  adr: number
  hsPercent: number
  vts: number
  firstBloodRate: number
  firstDeathRate: number
}

export function totals(matches: MatchSummary[]): Totals {
  const decided = matches.filter((m) => m.result !== 'draw').length
  const rounds = matches.reduce((a, m) => a + m.rounds, 0) || 1
  return {
    games: matches.length,
    winRate: decided ? Math.round((matches.filter((m) => m.result === 'win').length / decided) * 100) : 0,
    kd: r2(matches.reduce((a, m) => a + m.kills, 0) / Math.max(1, matches.reduce((a, m) => a + m.deaths, 0))),
    acs: Math.round(avg(matches.map((m) => m.acs))),
    adr: Math.round(avg(matches.map((m) => m.adr))),
    hsPercent: Math.round(avg(matches.map((m) => m.hsPercent))),
    vts: Math.round(avg(matches.filter((m) => m.vts).map((m) => m.vts!.score))),
    firstBloodRate: r2(matches.reduce((a, m) => a + m.firstBloods, 0) / rounds),
    firstDeathRate: r2(matches.reduce((a, m) => a + m.firstDeaths, 0) / rounds)
  }
}

/** Best agent on a map by win rate (min 3 games), using ranked-like matches only. */
export function bestAgentOnMap(matches: MatchSummary[], mapName: string): GroupStat | null {
  const onMap = matches.filter((m) => isRankedLike(m) && m.mapName === mapName)
  const agents = groupStats(onMap, (m) => m.agentName, (m) => m.agentIcon).filter((g) => g.games >= 3)
  agents.sort((a, b) => b.winRate - a.winRate || b.games - a.games)
  return agents[0] ?? null
}

/** Consecutive losses at the start of a newest-first list. */
export function losingStreak(newestFirst: MatchSummary[]): number {
  let n = 0
  for (const m of newestFirst) {
    if (m.result === 'loss') n++
    else if (m.result === 'win') break
  }
  return n
}

/** Compact summary of the last matches, used as AI-coach input. */
export function buildTrend(newestFirst: MatchSummary[]): Record<string, unknown> {
  const t = totals(newestFirst)
  return {
    matches: t.games,
    winRatePercent: t.winRate,
    kd: t.kd,
    acs: t.acs,
    adr: t.adr,
    headshotPercent: t.hsPercent,
    averageVTS: t.vts,
    firstBloodPerRound: t.firstBloodRate,
    firstDeathPerRound: t.firstDeathRate,
    currentLosingStreak: losingStreak(newestFirst),
    lastResults: newestFirst.slice(0, 10).map((m) => m.result),
    byAgent: groupStats(newestFirst, (m) => m.agentName).map(({ key, games, winRate, kd, acs }) => ({ agent: key, games, winRate, kd, acs })),
    byMap: groupStats(newestFirst, (m) => m.mapName).map(({ key, games, winRate, kd, acs }) => ({ map: key, games, winRate, kd, acs })),
    vtsOldestToNewest: [...newestFirst].reverse().map((m) => m.vts?.score ?? null)
  }
}
