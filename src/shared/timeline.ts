import { tr } from './i18n'

/** One of my kills or deaths in a finished match, timed from the start of the game. */
export interface TimelineEvent {
  type: 'kill' | 'death'
  /** 1-based */
  round: number
  gameTimeMs: number
  roundTimeMs: number
  /** finishing weapon (kills and deaths), already translated */
  weapon: string | null
  /** agent of the victim (kill) or of the killer (death) */
  other: string | null
  /** for kills: which kill of the round this was, and how many I made in that round */
  killIndex: number
  roundKills: number
}

export interface MatchTimeline {
  matchId: string
  mapName: string
  agentName: string
  startMillis: number
  events: TimelineEvent[]
}

export interface MarkerOptions {
  /** shifts every marker, e.g. when the recording started before or after the match */
  offsetSec: number
  /** clip starts this long before the event */
  preRollSec: number
  /** clip ends this long after the event */
  postRollSec: number
}

export interface Marker {
  time: string
  seconds: number
  clipStart: string
  clipEnd: string
  type: TimelineEvent['type']
  round: number
  label: string
  /** local wall-clock time of the event, to line it up with a recording's file time */
  clock: string
}

/** m:ss, or h:mm:ss from one hour on. Negative values clamp to 0. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function eventLabel(e: TimelineEvent): string {
  let base: string
  if (e.type === 'death') base = tr('Ölüm · R{round}', { round: e.round })
  else if (e.roundKills >= 5 && e.killIndex === 5) base = tr('ACE · R{round}', { round: e.round })
  else if (e.roundKills >= 2) base = tr('Kill {i}/{n} · R{round}', { i: e.killIndex, n: e.roundKills, round: e.round })
  else base = tr('Kill · R{round}', { round: e.round })
  const detail = [e.weapon, e.other].filter(Boolean).join(' · ')
  return detail ? `${base} · ${detail}` : base
}

const pad = (n: number): string => String(n).padStart(2, '0')
const localClock = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function buildMarkers(tl: MatchTimeline, opts: MarkerOptions): Marker[] {
  return [...tl.events]
    .sort((a, b) => a.gameTimeMs - b.gameTimeMs)
    .map((e) => {
      const seconds = Math.max(0, e.gameTimeMs / 1000 + opts.offsetSec)
      return {
        time: formatClock(seconds),
        seconds: Math.round(seconds * 10) / 10,
        clipStart: formatClock(seconds - opts.preRollSec),
        clipEnd: formatClock(seconds + opts.postRollSec),
        type: e.type,
        round: e.round,
        label: eventLabel(e),
        clock: localClock(tl.startMillis + e.gameTimeMs)
      }
    })
}

const csvCell = (v: string | number): string => `"${String(v).replace(/"/g, '""')}"`

export function markersToCsv(markers: Marker[]): string {
  const header = [tr('Zaman'), tr('Saniye'), tr('Tür'), tr('Raund'), tr('Etiket'), tr('Klip başlangıcı'), tr('Klip sonu'), tr('Saat')]
  const rows = markers.map((m) => [m.time, m.seconds, m.type, m.round, m.label, m.clipStart, m.clipEnd, m.clock].map(csvCell).join(','))
  return [header.map(csvCell).join(','), ...rows].join('\r\n')
}

/** "0:12 Label" lines (video chapters). The first chapter must start at 0:00, so a start line is added when needed. */
export function markersToChapters(markers: Marker[]): string {
  const lines = markers.map((m) => `${m.clipStart} ${m.label}`)
  if (!lines.length || !lines[0].startsWith('0:00')) lines.unshift(`0:00 ${tr('Maç başlangıcı')}`)
  return lines.join('\r\n')
}
