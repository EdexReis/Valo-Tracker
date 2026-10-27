import { describe, expect, it } from 'vitest'
import { buildMarkers, eventLabel, formatClock, markersToChapters, markersToCsv, type MatchTimeline, type TimelineEvent } from './timeline'

const ev = (over: Partial<TimelineEvent>): TimelineEvent => ({
  type: 'kill',
  round: 3,
  gameTimeMs: 125_000,
  roundTimeMs: 20_000,
  weapon: 'Vandal',
  other: 'Sage',
  killIndex: 1,
  roundKills: 1,
  ...over
})

const timeline = (events: TimelineEvent[]): MatchTimeline => ({ matchId: 'm', mapName: 'Ascent', agentName: 'Jett', startMillis: Date.UTC(2026, 9, 27, 12), events })
const OPTS = { offsetSec: 0, preRollSec: 5, postRollSec: 3 }

describe('formatClock', () => {
  it('formats minutes and hours', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65.9)).toBe('1:05')
    expect(formatClock(3725)).toBe('1:02:05')
  })

  it('clamps negative values', () => {
    expect(formatClock(-12)).toBe('0:00')
  })
})

describe('eventLabel', () => {
  it('names single kills, multikills, aces and deaths', () => {
    expect(eventLabel(ev({}))).toBe('Kill · R3 · Vandal · Sage')
    expect(eventLabel(ev({ killIndex: 2, roundKills: 3 }))).toBe('Kill 2/3 · R3 · Vandal · Sage')
    expect(eventLabel(ev({ killIndex: 5, roundKills: 5 }))).toBe('ACE · R3 · Vandal · Sage')
    expect(eventLabel(ev({ type: 'death', weapon: null, other: 'Phantom' }))).toBe('Ölüm · R3 · Phantom')
  })
})

describe('buildMarkers', () => {
  it('sorts events and applies the shift and the pre/post roll', () => {
    const markers = buildMarkers(timeline([ev({ gameTimeMs: 200_000 }), ev({ gameTimeMs: 100_000 })]), { offsetSec: 10, preRollSec: 5, postRollSec: 3 })
    expect(markers.map((m) => m.time)).toEqual(['1:50', '3:30'])
    expect(markers[0].clipStart).toBe('1:45')
    expect(markers[0].clipEnd).toBe('1:53')
  })

  it('never produces a negative time', () => {
    const [m] = buildMarkers(timeline([ev({ gameTimeMs: 2000 })]), { offsetSec: -30, preRollSec: 5, postRollSec: 3 })
    expect(m.time).toBe('0:00')
    expect(m.clipStart).toBe('0:00')
  })
})

describe('exports', () => {
  const markers = buildMarkers(timeline([ev({ gameTimeMs: 125_000 }), ev({ type: 'death', gameTimeMs: 140_000, weapon: 'Say "hi", ok', other: null })]), OPTS)

  it('writes a CSV with a header and escaped cells', () => {
    const csv = markersToCsv(markers).split('\r\n')
    expect(csv).toHaveLength(3)
    expect(csv[0].split(',')).toHaveLength(8)
    expect(csv[2]).toContain('Say ""hi"", ok"')
  })

  it('starts the chapters at 0:00', () => {
    const lines = markersToChapters(markers).split('\r\n')
    expect(lines[0]).toBe('0:00 Maç başlangıcı')
    expect(lines[1]).toMatch(/^2:00 Kill/)
  })

  it('does not add a second 0:00 line', () => {
    const early = buildMarkers(timeline([ev({ gameTimeMs: 1000 })]), OPTS)
    expect(markersToChapters(early).split('\r\n')).toHaveLength(1)
  })
})
