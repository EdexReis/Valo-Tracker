import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import type { MatchSummary, RRPoint } from '@shared/types'
import { tr } from '@shared/i18n'

interface PerAccount {
  matches: MatchSummary[]
  rr: RRPoint[]
}

interface FileShape {
  accounts: Record<string, PerAccount>
  /** last signed-in account, so stats stay viewable while Valorant is closed */
  last: string | null
  /** ISO week of the last weekly report */
  reportWeek?: string
  /** account puuid -> matchId -> teammate puuids (streamer-mode players are never recorded) */
  mates?: Record<string, Record<string, string[]>>
}

const MAX_MATCHES = 2000
const MAX_RR = 3000

/** Persists the player's matches and rank samples locally, one bucket per Riot account. */
export class HistoryStore {
  private file = path.join(app.getPath('userData'), 'history.json')
  private data: FileShape = { accounts: {}, last: null, mates: {} }

  constructor() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<FileShape>
      this.data = { accounts: parsed.accounts ?? {}, last: parsed.last ?? null, reportWeek: parsed.reportWeek, mates: parsed.mates ?? {} }
    } catch {
      /* first run */
    }
  }

  private bucket(puuid: string): PerAccount {
    return (this.data.accounts[puuid] ??= { matches: [], rr: [] })
  }

  private save(): void {
    try {
      writeFileSync(this.file, JSON.stringify(this.data))
    } catch {
      /* non-fatal */
    }
  }

  get lastPuuid(): string | null {
    return this.data.last
  }

  get reportWeek(): string | undefined {
    return this.data.reportWeek
  }

  setReportWeek(week: string): void {
    this.data.reportWeek = week
    this.save()
  }

  /** Stores the RR gained or lost per match (matchId -> RR). */
  patchRR(puuid: string, changes: Map<string, number>): void {
    const b = this.bucket(puuid)
    let dirty = false
    for (const m of b.matches) {
      const c = changes.get(m.matchId)
      if (c !== undefined && m.rrChange !== c) {
        m.rrChange = c
        dirty = true
      }
    }
    if (dirty) this.save()
  }

  /** Merges rank samples (e.g. from Riot's competitive updates) into the RR timeline. */
  mergeRR(puuid: string, points: RRPoint[]): void {
    if (!points.length) return
    const b = this.bucket(puuid)
    const sorted = [...b.rr, ...points].sort((a, c) => a.t - c.t)
    const out: RRPoint[] = []
    for (const p of sorted) {
      const last = out[out.length - 1]
      if (last && last.tier === p.tier && last.rr === p.rr) continue
      out.push(p)
    }
    b.rr = out.slice(-MAX_RR)
    this.save()
  }

  setLast(puuid: string): void {
    if (this.data.last === puuid) return
    this.data.last = puuid
    this.save()
  }

  has(puuid: string, matchId: string): boolean {
    return this.bucket(puuid).matches.some((m) => m.matchId === matchId)
  }

  /** Newest first. */
  matches(puuid: string): MatchSummary[] {
    return [...this.bucket(puuid).matches].sort((a, b) => b.startMillis - a.startMillis)
  }

  /** Inserts new matches and replaces known ones. Returns how many were new. */
  upsert(puuid: string, list: MatchSummary[]): number {
    if (!list.length) return 0
    const b = this.bucket(puuid)
    const byId = new Map(b.matches.map((m) => [m.matchId, m]))
    let added = 0
    for (const m of list) {
      if (!byId.has(m.matchId)) added++
      byId.set(m.matchId, m)
    }
    b.matches = [...byId.values()].sort((a, c) => c.startMillis - a.startMillis).slice(0, MAX_MATCHES)
    this.save()
    return added
  }

  /** Remembers who was on my team in a match. The caller passes only players who are not hiding their identity. */
  recordMates(account: string, matchId: string, puuids: string[]): void {
    const byMatch = ((this.data.mates ??= {})[account] ??= {})
    const next = [...new Set(puuids)]
    if (JSON.stringify(byMatch[matchId]) === JSON.stringify(next)) return
    byMatch[matchId] = next
    const ids = Object.keys(byMatch)
    if (ids.length > 3000) for (const id of ids.slice(0, ids.length - 3000)) delete byMatch[id]
    this.save()
  }

  matesByMatch(account: string): Record<string, string[]> {
    return this.data.mates?.[account] ?? {}
  }

  rr(puuid: string): RRPoint[] {
    return this.bucket(puuid).rr
  }

  /** Records a rank sample; identical consecutive samples are skipped. */
  addRR(puuid: string, tier: number, rr: number): void {
    const b = this.bucket(puuid)
    const last = b.rr[b.rr.length - 1]
    if (last && last.tier === tier && last.rr === rr) return
    b.rr.push({ t: Date.now(), tier, rr })
    if (b.rr.length > MAX_RR) b.rr.shift()
    this.save()
  }

  toCsv(puuid: string): string {
    const head = [tr('Tarih'), tr('Harita'), tr('Mod'), tr('Ajan'), tr('Sonuc'), tr('Skor'), 'K', 'D', 'A', 'ACS', 'ADR', 'HS%', 'FirstBlood', 'FirstDeath', 'VTS']
    const rows = this.matches(puuid).map((m) =>
      [
        new Date(m.startMillis).toISOString(),
        m.mapName,
        m.queue,
        m.agentName,
        m.result,
        `${m.roundsWon}-${m.roundsLost}`,
        m.kills,
        m.deaths,
        m.assists,
        m.acs,
        m.adr,
        m.hsPercent,
        m.firstBloods,
        m.firstDeaths,
        m.vts?.score ?? ''
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    return [head.join(','), ...rows].join('\r\n')
  }
}
