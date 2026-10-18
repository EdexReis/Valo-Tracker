import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import type { MatchSummary, RRPoint } from '@shared/types'

interface PerAccount {
  matches: MatchSummary[]
  rr: RRPoint[]
}

interface FileShape {
  accounts: Record<string, PerAccount>
  /** last signed-in account, so stats stay viewable while Valorant is closed */
  last: string | null
}

const MAX_MATCHES = 2000
const MAX_RR = 3000

/** Persists the player's matches and rank samples locally, one bucket per Riot account. */
export class HistoryStore {
  private file = path.join(app.getPath('userData'), 'history.json')
  private data: FileShape = { accounts: {}, last: null }

  constructor() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<FileShape>
      this.data = { accounts: parsed.accounts ?? {}, last: parsed.last ?? null }
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
    const head = ['Tarih', 'Harita', 'Mod', 'Ajan', 'Sonuc', 'Skor', 'K', 'D', 'A', 'ACS', 'ADR', 'HS%', 'FirstBlood', 'FirstDeath', 'VTS']
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
