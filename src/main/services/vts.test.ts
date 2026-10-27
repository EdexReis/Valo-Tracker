import { describe, expect, it } from 'vitest'
import { computeVTS, openingDuels, vtsGrade } from './vts'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('vtsGrade', () => {
  it('uses the documented thresholds', () => {
    expect(vtsGrade(850)).toBe('S')
    expect(vtsGrade(800)).toBe('S')
    expect(vtsGrade(700)).toBe('A')
    expect(vtsGrade(520)).toBe('B')
    expect(vtsGrade(400)).toBe('C')
    expect(vtsGrade(120)).toBe('D')
  })
})

/** Tiny deterministic generator so the calibration test is repeatable. */
function rng(seed: number): () => number {
  let s = seed
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
}

/** A synthetic 24-round 5v5 where `skill` shifts both the player's kills and survival. */
function syntheticMatch(skill: number, seed: number): any {
  const r = rng(seed)
  const me = 'me'
  const mates = ['m1', 'm2', 'm3', 'm4']
  const enemies = ['e1', 'e2', 'e3', 'e4', 'e5']
  const rounds = 24
  const kills: any[] = []
  const roundResults: any[] = []
  let k = 0
  let d = 0
  let a = 0
  let won = 0
  for (let round = 0; round < rounds; round++) {
    let aliveA = [me, ...mates]
    let aliveB = [...enemies]
    let t = 8000
    while (aliveA.length && aliveB.length) {
      t += 4000 + r() * 8000
      const aWins = r() < 0.5 + (skill - 1) * 0.05
      const killerPool = aWins ? aliveA : aliveB
      const victimPool = aWins ? aliveB : aliveA
      const pick = (pool: string[], weight: (p: string) => number): string => {
        const ws = pool.map(weight)
        let x = r() * ws.reduce((p, q) => p + q, 0)
        for (let i = 0; i < pool.length; i++) {
          x -= ws[i]
          if (x <= 0) return pool[i]
        }
        return pool[0]
      }
      const killer = pick(killerPool, (p) => (p === me ? skill : 1))
      const victim = pick(victimPool, (p) => (p === me ? 1 / skill : 1))
      const assistants = !aWins || r() > 0.3 ? [] : [{ assistantSubject: aliveA[Math.floor(r() * aliveA.length)] }]
      kills.push({ round, roundTime: t, killer, victim, assistants })
      if (killer === me) k++
      if (victim === me) d++
      if (assistants[0]?.assistantSubject === me) a++
      aliveA = aliveA.filter((p) => p !== victim)
      aliveB = aliveB.filter((p) => p !== victim)
    }
    if (aliveA.length) won++
    roundResults.push({
      roundNum: round,
      winningTeam: aliveA.length ? 'Blue' : 'Red',
      playerStats: [{ subject: me, damage: [{ damage: 120 * skill + r() * 30 }] }]
    })
  }
  return {
    players: [
      { subject: me, teamId: 'Blue', competitiveTier: 14, stats: { kills: k, deaths: d, assists: a, score: Math.round(rounds * 210 * skill), roundsPlayed: rounds } },
      ...mates.map((m) => ({ subject: m, teamId: 'Blue', competitiveTier: 14, stats: {} })),
      ...enemies.map((e) => ({ subject: e, teamId: 'Red', competitiveTier: 14, stats: {} }))
    ],
    kills,
    roundResults,
    teams: [
      { teamId: 'Blue', roundsWon: won },
      { teamId: 'Red', roundsWon: rounds - won }
    ],
    matchInfo: { queueID: 'competitive' }
  }
}

const average = (skill: number): number => {
  const scores = Array.from({ length: 30 }, (_, i) => computeVTS(syntheticMatch(skill, i + 1), 'me', 'Initiator')!.score)
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

describe('computeVTS calibration', () => {
  it('rises with skill and puts an average player near 500', () => {
    const weak = average(0.6)
    const mid = average(1)
    const strong = average(1.4)
    const star = average(1.8)
    expect(weak).toBeLessThan(mid)
    expect(mid).toBeLessThan(strong)
    expect(strong).toBeLessThan(star)
    expect(mid).toBeGreaterThan(400)
    expect(mid).toBeLessThan(600)
    expect(weak).toBeLessThan(300)
    expect(strong).toBeGreaterThan(700)
  })

  it('always stays within 0-1000', () => {
    for (const skill of [0.1, 3]) {
      const s = computeVTS(syntheticMatch(skill, 7), 'me', 'Duelist')!.score
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1000)
    }
  })
})

/** 2v2 helper: me + m1 against e1 + e2. */
function tiny(kills: any[], winner: string): any {
  return {
    players: [
      { subject: 'me', teamId: 'Blue', stats: { kills: 2, deaths: 0, assists: 0, score: 400, roundsPlayed: 1 } },
      { subject: 'm1', teamId: 'Blue', stats: {} },
      { subject: 'e1', teamId: 'Red', stats: {} },
      { subject: 'e2', teamId: 'Red', stats: {} }
    ],
    kills,
    roundResults: [{ roundNum: 0, winningTeam: winner, playerStats: [] }],
    teams: [
      { teamId: 'Blue', roundsWon: winner === 'Blue' ? 1 : 0 },
      { teamId: 'Red', roundsWon: winner === 'Red' ? 1 : 0 }
    ],
    matchInfo: { queueID: 'unrated' }
  }
}

describe('computeVTS round logic', () => {
  it('detects a clutch: last alive against two, round won', () => {
    const d = tiny(
      [
        { round: 0, roundTime: 1000, killer: 'e1', victim: 'm1', assistants: [] },
        { round: 0, roundTime: 2000, killer: 'me', victim: 'e1', assistants: [] },
        { round: 0, roundTime: 3000, killer: 'me', victim: 'e2', assistants: [] }
      ],
      'Blue'
    )
    const v = computeVTS(d, 'me', 'Duelist')!
    expect(v.clutches).toBe(1)
    expect(v.kast).toBe(100)
  })

  it('counts a trade as KAST for a dead player', () => {
    const d = tiny(
      [
        { round: 0, roundTime: 1000, killer: 'e1', victim: 'me', assistants: [] },
        { round: 0, roundTime: 3000, killer: 'm1', victim: 'e1', assistants: [] }
      ],
      'Red'
    )
    expect(computeVTS(d, 'me', 'Initiator')!.kast).toBe(100)
  })

  it('does not count a late trade as KAST', () => {
    const d = tiny(
      [
        { round: 0, roundTime: 1000, killer: 'e1', victim: 'me', assistants: [] },
        { round: 0, roundTime: 9000, killer: 'm1', victim: 'e1', assistants: [] }
      ],
      'Red'
    )
    expect(computeVTS(d, 'me', 'Initiator')!.kast).toBe(0)
  })

  it('falls back gracefully without a kill list', () => {
    const d = tiny([], 'Blue')
    delete d.kills
    const v = computeVTS(d, 'me', 'Initiator')!
    expect(v.components?.find((c) => c.key === 'kast')?.value).toBe('veri yok')
  })

  it('returns null for a player who is not in the match', () => {
    expect(computeVTS(tiny([], 'Blue'), 'stranger', 'Duelist')).toBeNull()
  })
})

describe('openingDuels', () => {
  it('credits the earliest kill of each round', () => {
    const d = {
      kills: [
        { round: 0, roundTime: 5000, killer: 'e1', victim: 'm1' },
        { round: 0, roundTime: 2000, killer: 'me', victim: 'e2' },
        { round: 1, roundTime: 1000, killer: 'e1', victim: 'me' }
      ]
    }
    expect(openingDuels(d, 'me')).toEqual({ firstBloods: 1, firstDeaths: 1 })
  })
})
