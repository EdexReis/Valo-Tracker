import type { MatchSummary } from './types'
import { tr } from './i18n'

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

// ---------------------------------------------------------------------------
// Weekly report, goals, badges and rank projection
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/** ISO week key such as 2026-W42, used to send the weekly report once per week. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Ranked/unrated matches of the last 7 days, newest first. */
export function lastWeek(matches: MatchSummary[], now = Date.now()): MatchSummary[] {
  return matches.filter((m) => isRankedLike(m) && m.startMillis >= now - 7 * DAY_MS)
}

export function buildWeeklyReport(allMatches: MatchSummary[], now = Date.now()): string {
  const ms = lastWeek(allMatches, now)
  if (!ms.length) return `${tr('📊 Haftalık Rapor')}\n${tr('Bu hafta Rekabetçi/Derecesiz maç oynamadın.')}`
  const t = totals(ms)
  const wins = ms.filter((m) => m.result === 'win').length
  const losses = ms.filter((m) => m.result === 'loss').length
  const rr = ms.reduce((n, m) => n + (m.rrChange ?? 0), 0)
  const agents = groupStats(ms, (m) => m.agentName).filter((g) => g.games >= 2)
  const maps = groupStats(ms, (m) => m.mapName).filter((g) => g.games >= 2)
  const bestAgent = [...agents].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0]
  const worstMap = [...maps].sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0]
  const lines = [
    tr('📊 Haftalık Rapor'),
    tr('Maç: {games} ({w}G - {l}M), kazanma %{rate}', { games: t.games, w: wins, l: losses, rate: t.winRate }),
    `K/D ${t.kd.toFixed(2)} · ACS ${t.acs} · ADR ${t.adr} · HS %${t.hsPercent} · VTS ${t.vts}`,
    tr('RR değişimi: {rr}', { rr: `${rr > 0 ? '+' : ''}${rr}` })
  ]
  if (bestAgent) lines.push(tr('En iyi ajan: {agent} (%{rate}, {n} maç)', { agent: bestAgent.key, rate: bestAgent.winRate, n: bestAgent.games }))
  if (worstMap && worstMap.winRate < 50) lines.push(tr('Zorlandığın harita: {map} (%{rate}, {n} maç)', { map: worstMap.key, rate: worstMap.winRate, n: worstMap.games }))
  return lines.join('\n')
}

export interface GoalTargets {
  weeklyMatches: number
  weeklyWins: number
  avgVts: number
  hsPercent: number
}

export interface GoalProgress {
  key: string
  label: string
  current: number
  target: number
  unit: string
  done: boolean
}

export function weeklyProgress(matches: MatchSummary[], goals: GoalTargets, now = Date.now()): GoalProgress[] {
  const ms = lastWeek(matches, now)
  const t = totals(ms)
  const wins = ms.filter((m) => m.result === 'win').length
  const mk = (key: string, label: string, current: number, target: number, unit: string): GoalProgress => ({
    key,
    label,
    current,
    target,
    unit,
    done: current >= target
  })
  return [
    mk('matches', tr('Haftalık maç'), ms.length, goals.weeklyMatches, tr('maç')),
    mk('wins', tr('Haftalık galibiyet'), wins, goals.weeklyWins, tr('galibiyet')),
    mk('vts', tr('Ortalama VTS'), t.vts, goals.avgVts, tr('puan')),
    mk('hs', tr('Kafa isabeti'), t.hsPercent, goals.hsPercent, '%')
  ]
}

export interface Badge {
  key: string
  label: string
  description: string
  unlocked: boolean
}

/** Achievements computed from the stored match history. */
export function computeBadges(matches: MatchSummary[]): Badge[] {
  const oldestFirst = [...matches].sort((a, b) => a.startMillis - b.startMillis)
  let bestWinStreak = 0
  let streak = 0
  let comeback = false
  let lossRun = 0
  for (const m of oldestFirst) {
    if (m.result === 'win') {
      streak++
      if (lossRun >= 3) comeback = true
      lossRun = 0
    } else if (m.result === 'loss') {
      bestWinStreak = Math.max(bestWinStreak, streak)
      streak = 0
      lossRun++
    }
  }
  bestWinStreak = Math.max(bestWinStreak, streak)
  const any = (f: (m: MatchSummary) => boolean): boolean => matches.some(f)
  return [
    { key: 's', label: tr('S Sınıfı'), description: tr('Bir maçta VTS 800 üstü'), unlocked: any((m) => (m.vts?.score ?? 0) >= 800) },
    { key: 'ace', label: tr('Ace'), description: tr('Bir raundda 5 kill'), unlocked: any((m) => (m.vts?.multiKills?.k5 ?? 0) > 0) },
    { key: 'clutch', label: tr('Clutch Ustası'), description: tr('Tek maçta 3 clutch'), unlocked: any((m) => (m.vts?.clutches ?? 0) >= 3) },
    { key: 'hs', label: tr('Kafa Avcısı'), description: tr('Bir maçta %40+ kafa isabeti'), unlocked: any((m) => m.hsPercent >= 40) },
    { key: 'streak', label: tr('Seri'), description: tr('5 maç üst üste galibiyet'), unlocked: bestWinStreak >= 5 },
    { key: 'comeback', label: tr('Tilt Kırıcı'), description: tr('3 kayıptan sonra galibiyet'), unlocked: comeback },
    { key: 'fb', label: tr('Açılış Ustası'), description: tr('Bir maçta 8+ ilk kan'), unlocked: any((m) => m.firstBloods >= 8) },
    { key: '100', label: tr('100 Maç'), description: tr('Kayıtlı 100 maç'), unlocked: matches.length >= 100 }
  ]
}

export interface RankProjection {
  /** RR gained per win / lost per loss, averaged over recent competitive games */
  avgWin: number
  avgLoss: number
  winRate: number
  expectedPerMatch: number
  /** matches until the next tier, or null when the trend is not positive */
  matchesToNext: number | null
  sample: number
}

/** Estimates how many ranked matches are needed to reach the next tier at the current trend. */
export function projectRank(newestFirst: MatchSummary[], currentRR: number): RankProjection | null {
  const comp = newestFirst.filter((m) => m.queueId === 'competitive' && typeof m.rrChange === 'number').slice(0, 20)
  const wins = comp.filter((m) => (m.rrChange as number) > 0)
  const losses = comp.filter((m) => (m.rrChange as number) < 0)
  if (comp.length < 5 || !wins.length || !losses.length) return null
  const avgWin = wins.reduce((n, m) => n + (m.rrChange as number), 0) / wins.length
  const avgLoss = losses.reduce((n, m) => n + (m.rrChange as number), 0) / losses.length
  const winRate = wins.length / comp.length
  const expected = winRate * avgWin + (1 - winRate) * avgLoss
  return {
    avgWin: Math.round(avgWin),
    avgLoss: Math.round(avgLoss),
    winRate: Math.round(winRate * 100),
    expectedPerMatch: Math.round(expected * 10) / 10,
    matchesToNext: expected > 0 ? Math.ceil((100 - currentRR) / expected) : null,
    sample: comp.length
  }
}

export interface WeaponRow {
  /** weapon uuid, or ability / spike / fall / other */
  key: string
  kills: number
  deaths: number
  /** share of all kills, 0-100 */
  share: number
  killsPerMatch: number
}

/** Kills and deaths per finishing weapon across the given matches (only matches that carry weapon data). */
export function weaponStats(matches: MatchSummary[]): WeaponRow[] {
  const withData = matches.filter((m) => m.weaponKills || m.weaponDeaths)
  const kills = new Map<string, number>()
  const deaths = new Map<string, number>()
  for (const m of withData) {
    for (const [k, n] of Object.entries(m.weaponKills ?? {})) kills.set(k, (kills.get(k) ?? 0) + n)
    for (const [k, n] of Object.entries(m.weaponDeaths ?? {})) deaths.set(k, (deaths.get(k) ?? 0) + n)
  }
  const totalKills = [...kills.values()].reduce((a, b) => a + b, 0) || 1
  const games = withData.length || 1
  return [...new Set([...kills.keys(), ...deaths.keys()])]
    .map((key) => ({
      key,
      kills: kills.get(key) ?? 0,
      deaths: deaths.get(key) ?? 0,
      share: Math.round(((kills.get(key) ?? 0) / totalKills) * 100),
      killsPerMatch: Math.round(((kills.get(key) ?? 0) / games) * 10) / 10
    }))
    .sort((a, b) => b.kills - a.kills || b.deaths - a.deaths)
}

/**
 * Win rate with each teammate. `matesByMatch` maps a match id to the puuids of the teammates seen in it;
 * matches without an entry are skipped and draws do not count. Players seen in fewer than `minGames` are dropped.
 */
export function coPlayerStats(
  newestFirst: MatchSummary[],
  matesByMatch: Record<string, string[]>,
  minGames = 2
): Array<Omit<import('./types').CoPlayerRow, 'name'>> {
  const acc = new Map<string, { games: number; wins: number; losses: number; vts: number[] }>()
  for (const m of newestFirst) {
    const mates = matesByMatch[m.matchId]
    if (!mates || m.result === 'draw') continue
    for (const puuid of new Set(mates)) {
      const a = acc.get(puuid) ?? { games: 0, wins: 0, losses: 0, vts: [] }
      a.games++
      if (m.result === 'win') a.wins++
      else a.losses++
      if (m.vts) a.vts.push(m.vts.score)
      acc.set(puuid, a)
    }
  }
  return [...acc.entries()]
    .filter(([, a]) => a.games >= minGames)
    .map(([puuid, a]) => ({
      puuid,
      games: a.games,
      wins: a.wins,
      losses: a.losses,
      winRate: Math.round((a.wins / a.games) * 100),
      avgVts: Math.round(avg(a.vts))
    }))
    .sort((x, y) => y.games - x.games || y.winRate - x.winRate)
}
