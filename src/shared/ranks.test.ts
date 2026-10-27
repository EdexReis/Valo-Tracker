import { describe, expect, it } from 'vitest'
import { analyzeSeasons, shortSeasonName } from './ranks'

const order = (id: string): number => Number(id.replace('s', ''))

describe('analyzeSeasons', () => {
  it('reads the current rank from the active season', () => {
    const a = analyzeSeasons({ s3: { CompetitiveTier: 15, RankedRating: 40 } }, 's3', order)
    expect(a).toMatchObject({ currentTier: 15, currentRR: 40, peakTier: 15, peakSeasonId: 's3' })
  })

  it('finds a peak reached during an act even when it ended lower', () => {
    const a = analyzeSeasons(
      {
        s1: { CompetitiveTier: 12, WinsByTier: { '12': 9, '21': 2 } },
        s2: { CompetitiveTier: 13 },
        s3: { CompetitiveTier: 15, RankedRating: 10 }
      },
      's3',
      order
    )
    expect(a.peakTier).toBe(21)
    expect(a.peakSeasonId).toBe('s1')
    // the active act is not a "past" act; newest first
    expect(a.past).toEqual([
      { seasonId: 's2', tier: 13 },
      { seasonId: 's1', tier: 12 }
    ])
  })

  it('prefers the most recent act when the peak is tied', () => {
    const a = analyzeSeasons({ s1: { CompetitiveTier: 18 }, s2: { CompetitiveTier: 18 }, s3: { CompetitiveTier: 10 } }, 's3', order)
    expect(a.peakSeasonId).toBe('s2')
  })

  it('keeps only the last three finished acts', () => {
    const seasons = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`s${n}`, { CompetitiveTier: 10 + n }]))
    expect(analyzeSeasons(seasons, 's6', order).past.map((p) => p.seasonId)).toEqual(['s5', 's4', 's3'])
  })

  it('treats a player without data as unranked', () => {
    expect(analyzeSeasons(null, 's1', order)).toEqual({ currentTier: 0, currentRR: 0, peakTier: 0, peakSeasonId: null, past: [] })
  })
})

describe('shortSeasonName', () => {
  it('shortens episode and act names', () => {
    expect(shortSeasonName('EPISODE 9 ACT II')).toBe('E9 A2')
    expect(shortSeasonName('EPISODE 10 ACT 3')).toBe('E10 A3')
  })

  it('leaves other names alone', () => {
    expect(shortSeasonName('Something else')).toBe('Something else')
  })
})
