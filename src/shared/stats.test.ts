import { describe, expect, it } from 'vitest'
import type { MatchSummary } from './types'
import {
  bestAgentOnMap,
  buildWeeklyReport,
  coPlayerStats,
  computeBadges,
  groupStats,
  isoWeekKey,
  losingStreak,
  projectRank,
  totals,
  weaponStats
} from './stats'

const NOW = Date.UTC(2026, 9, 27, 12)
const HOUR = 3_600_000

function match(i: number, result: MatchSummary['result'], over: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: String(i),
    startMillis: NOW - i * HOUR,
    queue: 'Rekabetçi',
    queueId: 'competitive',
    mapName: i % 2 ? 'Ascent' : 'Bind',
    agentName: 'Jett',
    agentIcon: null,
    kills: 15,
    deaths: 12,
    assists: 3,
    result,
    roundsWon: 13,
    roundsLost: 9,
    rounds: 22,
    acs: 220,
    adr: 150,
    hsPercent: 28,
    firstBloods: 3,
    firstDeaths: 2,
    rrChange: result === 'win' ? 21 : -17,
    vts: { score: 620, grade: 'B' },
    ...over
  }
}

// newest first: every third match is a loss
const sample = Array.from({ length: 12 }, (_, i) => match(i, i % 3 === 0 ? 'loss' : 'win'))

describe('isoWeekKey', () => {
  it('handles year boundaries', () => {
    expect(isoWeekKey(new Date(2024, 11, 30))).toBe('2025-W01')
    expect(isoWeekKey(new Date(2021, 0, 3))).toBe('2020-W53')
  })
})

describe('totals and groups', () => {
  it('computes win rate and K/D', () => {
    const t = totals(sample)
    expect(t.games).toBe(12)
    expect(t.winRate).toBe(67)
    expect(t.kd).toBeCloseTo(1.25, 2)
  })

  it('ignores draws when computing win rate', () => {
    const t = totals([match(1, 'win'), match(2, 'draw')])
    expect(t.winRate).toBe(100)
  })

  it('groups by key', () => {
    const maps = groupStats(sample, (m) => m.mapName)
    expect(maps.map((g) => g.key).sort()).toEqual(['Ascent', 'Bind'])
    expect(maps.reduce((n, g) => n + g.games, 0)).toBe(12)
  })

  it('needs 3 games before recommending an agent', () => {
    const few = [match(1, 'win', { mapName: 'Ascent' }), match(3, 'win', { mapName: 'Ascent' })]
    expect(bestAgentOnMap(few, 'Ascent')).toBeNull()
    const enough = [...few, match(5, 'loss', { mapName: 'Ascent' })]
    expect(bestAgentOnMap(enough, 'Ascent')?.key).toBe('Jett')
  })
})

describe('losingStreak', () => {
  it('counts consecutive losses at the start only', () => {
    const list = [match(1, 'loss'), match(2, 'loss'), match(3, 'win'), match(4, 'loss')]
    expect(losingStreak(list)).toBe(2)
    expect(losingStreak([match(1, 'win'), match(2, 'loss')])).toBe(0)
  })
})

describe('weekly report', () => {
  it('summarizes the last 7 days', () => {
    const text = buildWeeklyReport(sample, NOW)
    expect(text).toContain('Maç: 12 (8G - 4M)')
    expect(text).toContain('RR değişimi: +100')
  })

  it('handles an empty week', () => {
    expect(buildWeeklyReport([], NOW)).toContain('oynamadın')
  })
})

describe('rank projection', () => {
  it('estimates matches to the next tier', () => {
    const p = projectRank(sample, 60)
    expect(p?.avgWin).toBe(21)
    expect(p?.avgLoss).toBe(-17)
    expect(p?.expectedPerMatch).toBeCloseTo(8.3, 1)
    expect(p?.matchesToNext).toBe(5)
  })

  it('returns null without enough data', () => {
    expect(projectRank(sample.slice(0, 3), 60)).toBeNull()
  })

  it('reports no ETA when the trend is negative', () => {
    const losing = Array.from({ length: 10 }, (_, i) => match(i, i % 4 === 0 ? 'win' : 'loss'))
    expect(projectRank(losing, 50)?.matchesToNext).toBeNull()
  })
})

describe('badges', () => {
  it('unlocks ace and S grade from match data', () => {
    const ace = match(1, 'win', { vts: { score: 850, grade: 'S', multiKills: { k3: 0, k4: 0, k5: 1 } } })
    const keys = computeBadges([ace]).filter((b) => b.unlocked).map((b) => b.key)
    expect(keys).toEqual(expect.arrayContaining(['s', 'ace']))
  })

  it('detects a 5-win streak', () => {
    const wins = Array.from({ length: 5 }, (_, i) => match(i, 'win'))
    expect(computeBadges(wins).find((b) => b.key === 'streak')?.unlocked).toBe(true)
  })
})

describe('weaponStats', () => {
  it('adds up kills and deaths per weapon and ignores matches without data', () => {
    const list = [
      match(1, 'win', { weaponKills: { vandal: 10, ability: 2 }, weaponDeaths: { vandal: 4 } }),
      match(2, 'win', { weaponKills: { vandal: 6, phantom: 4 }, weaponDeaths: { phantom: 5 } }),
      match(3, 'win') // synced before weapon tracking: no data
    ]
    const rows = weaponStats(list)
    expect(rows[0]).toMatchObject({ key: 'vandal', kills: 16, deaths: 4 })
    expect(rows.find((r) => r.key === 'phantom')).toMatchObject({ kills: 4, deaths: 5 })
    // 16 of 22 kills, over the 2 matches that have data
    expect(rows[0].share).toBe(73)
    expect(rows[0].killsPerMatch).toBe(8)
  })

  it('returns nothing when no match has weapon data', () => {
    expect(weaponStats([match(1, 'win')])).toEqual([])
  })
})

describe('coPlayerStats', () => {
  const list = [
    match(1, 'win', { vts: { score: 700, grade: 'A' } }),
    match(2, 'loss', { vts: { score: 500, grade: 'B' } }),
    match(3, 'win', { vts: { score: 600, grade: 'B' } }),
    match(4, 'draw'),
    match(5, 'win') // no teammate record for this match
  ]
  const mates = { '1': ['duo', 'a'], '2': ['duo'], '3': ['duo', 'b'], '4': ['duo'] }

  it('groups teammates and counts wins, losses and my average VTS', () => {
    const rows = coPlayerStats(list, mates)
    expect(rows).toHaveLength(1) // a and b were seen once: below the minimum
    expect(rows[0]).toMatchObject({ puuid: 'duo', games: 3, wins: 2, losses: 1, winRate: 67, avgVts: 600 })
  })

  it('ignores draws and matches without a record', () => {
    expect(coPlayerStats(list, mates, 1).find((r) => r.puuid === 'duo')?.games).toBe(3)
  })

  it('sorts by games together', () => {
    const rows = coPlayerStats(list, mates, 1)
    expect(rows[0].puuid).toBe('duo')
    expect(rows.map((r) => r.games)).toEqual([3, 1, 1])
  })
})
