import type { VtsComponent, VtsGrade, VtsResult } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Bump when the formula changes: stored matches with an older version are recalculated. */
export const VTS_VERSION = 3

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const pts = (v: number): number => Math.round(clamp(v, 0, 100))

/** Typical ACS by role, so supports and controllers are not judged by duelist numbers. */
const ACS_BASE: Record<string, number> = { duelist: 230, initiator: 200, controller: 190, sentinel: 190 }

export function vtsGrade(score: number): VtsGrade {
  if (score >= 800) return 'S'
  if (score >= 650) return 'A'
  if (score >= 500) return 'B'
  if (score >= 350) return 'C'
  return 'D'
}

const assistantId = (a: any): string => (typeof a === 'string' ? a : (a?.assistantSubject ?? ''))

/** First blood / first death: the earliest kill of every round decides both. */
export function openingDuels(d: any, puuid: string): { firstBloods: number; firstDeaths: number } {
  const kills: Array<{ round: number; time: number; killer: string; victim: string }> = []
  if (Array.isArray(d.kills)) {
    for (const k of d.kills) kills.push({ round: k.round, time: k.roundTime ?? 0, killer: k.killer, victim: k.victim })
  } else {
    for (const r of d.roundResults ?? [])
      for (const ps of r.playerStats ?? [])
        for (const k of ps.kills ?? [])
          kills.push({ round: r.roundNum, time: k.timeSinceRoundStartMillis ?? 0, killer: k.killer, victim: k.victim })
  }
  const first = new Map<number, (typeof kills)[number]>()
  for (const k of kills) {
    const cur = first.get(k.round)
    if (!cur || k.time < cur.time) first.set(k.round, k)
  }
  let firstBloods = 0
  let firstDeaths = 0
  first.forEach((k) => {
    if (k.killer === puuid) firstBloods++
    if (k.victim === puuid) firstDeaths++
  })
  return { firstBloods, firstDeaths }
}

/**
 * Valo Tracker Score v2, 0-1000. Eight components, each scored 0-100 where 50 is an average player:
 * ACS (role-adjusted) 25%, K/D 15%, ADR 15%, KAST 15%, opening duels 10%, multikills + clutches 10%,
 * assists 5%, round win share 5%. Competitive games get a +-40 adjustment for the opponents' average rank.
 * Average play lands around 500; S needs 800+.
 */
export function computeVTS(d: any, puuid: string, role: string): VtsResult | null {
  const players: any[] = d.players ?? []
  const me = players.find((p) => p.subject === puuid)
  const st = me?.stats
  if (!st) return null
  const rounds: number = st.roundsPlayed || (d.roundResults ?? []).length
  if (!rounds) return null

  const myTeam = me.teamId
  const teamOf = new Map<string, string>(players.map((p) => [p.subject, p.teamId]))
  const mates = players.filter((p) => p.teamId === myTeam && p.subject !== puuid).map((p) => p.subject as string)
  const enemies = players.filter((p) => p.teamId !== myTeam).map((p) => p.subject as string)
  const kills: any[] = Array.isArray(d.kills) ? d.kills : []
  const detailed = kills.length > 0 && mates.length > 0 && enemies.length > 0

  const byRound = new Map<number, any[]>()
  for (const k of kills) byRound.set(k.round, [...(byRound.get(k.round) ?? []), k])
  const winnerOf = new Map<number, string>((d.roundResults ?? []).map((r: any) => [r.roundNum, r.winningTeam]))

  let kastRounds = 0
  let k3 = 0
  let k4 = 0
  let k5 = 0
  let clutches = 0
  if (detailed) {
    for (let r = 0; r < rounds; r++) {
      const ks = (byRound.get(r) ?? []).slice().sort((a, b) => (a.roundTime ?? 0) - (b.roundTime ?? 0))
      const myKills = ks.filter((k) => k.killer === puuid).length
      const gotAssist = ks.some((k) => (k.assistants ?? []).some((a: any) => assistantId(a) === puuid))
      const death = ks.find((k) => k.victim === puuid)
      const survived = !death
      // Traded: a teammate killed my killer within 5 seconds.
      const traded =
        !!death &&
        ks.some(
          (k) =>
            k.victim === death.killer &&
            k.killer !== puuid &&
            teamOf.get(k.killer) === myTeam &&
            (k.roundTime ?? 0) >= (death.roundTime ?? 0) &&
            (k.roundTime ?? 0) - (death.roundTime ?? 0) <= 5000
        )
      if (myKills > 0 || gotAssist || survived || traded) kastRounds++
      if (myKills >= 5) k5++
      else if (myKills === 4) k4++
      else if (myKills === 3) k3++

      // Clutch: alive and the last of my team while enemies remain, and the round is won.
      if (survived && winnerOf.get(r) === myTeam) {
        const aliveMates = new Set(mates)
        const aliveEnemies = new Set(enemies)
        for (const k of ks) {
          aliveMates.delete(k.victim)
          aliveEnemies.delete(k.victim)
          if (aliveMates.size === 0 && aliveEnemies.size >= 1) {
            clutches++
            break
          }
        }
      }
    }
  }

  // Damage dealt per round.
  let damage = 0
  for (const r of d.roundResults ?? []) {
    const ps = (r.playerStats ?? []).find((x: any) => x.subject === puuid)
    for (const dm of ps?.damage ?? []) damage += dm.damage ?? 0
  }
  const adr = damage / rounds

  const duels = openingDuels(d, puuid)
  const acs = st.score / rounds
  const expectedAcs = ACS_BASE[role.toLowerCase()] ?? 205
  const kd = st.kills / Math.max(1, st.deaths)
  const kast = detailed ? (kastRounds / rounds) * 100 : 70
  const openingNet = (duels.firstBloods - duels.firstDeaths) / rounds
  const impact = (k3 + k4 * 2 + k5 * 3 + clutches * 2) / rounds
  const assistsPerRound = st.assists / rounds

  const teams: any[] = d.teams ?? []
  const mine = teams.find((t) => t.teamId === myTeam)
  const other = teams.find((t) => t.teamId !== myTeam)
  const share = mine && other && mine.roundsWon + other.roundsWon > 0 ? mine.roundsWon / (mine.roundsWon + other.roundsWon) : 0.5

  const components: VtsComponent[] = [
    { key: 'acs', label: 'Çatışma skoru (ACS)', value: `${Math.round(acs)} (beklenen ${expectedAcs})`, points: pts(50 + (acs / expectedAcs - 1) * 100), weight: 0.25 },
    { key: 'kd', label: 'K/D', value: kd.toFixed(2), points: pts(50 + (kd - 1) * 100), weight: 0.15 },
    { key: 'adr', label: 'Raund hasarı (ADR)', value: String(Math.round(adr)), points: pts(50 + ((adr - 140) / 70) * 50), weight: 0.15 },
    { key: 'kast', label: 'KAST', value: detailed ? `%${Math.round(kast)}` : 'veri yok', points: pts(50 + ((kast - 70) / 15) * 50), weight: 0.15 },
    {
      key: 'opening',
      label: 'Açılış düelloları',
      value: `${duels.firstBloods} ilk kan / ${duels.firstDeaths} ilk ölüm`,
      points: pts(50 + (openingNet / 0.08) * 50),
      weight: 0.1
    },
    {
      key: 'impact',
      label: 'Multikill ve clutch',
      value: `${k3 + k4 + k5} multikill, ${clutches} clutch`,
      points: pts(50 + ((impact - 0.08) / 0.12) * 50),
      weight: 0.1
    },
    { key: 'assist', label: 'Destek (asist)', value: `${st.assists} asist`, points: pts(50 + ((assistsPerRound - 0.2) / 0.2) * 50), weight: 0.05 },
    { key: 'win', label: 'Raund galibiyeti', value: `%${Math.round(share * 100)}`, points: pts(50 + (share - 0.5) * 200), weight: 0.05 }
  ]

  let raw = components.reduce((n, c) => n + c.points * c.weight, 0) * 10

  // Rank adjustment for ranked games: beating stronger lobbies is worth a little more.
  const queue = d.matchInfo?.queueID
  const oppTiers = players.filter((p) => p.teamId !== myTeam && p.competitiveTier > 0).map((p) => p.competitiveTier as number)
  let opponentAdjust = 0
  if (queue === 'competitive' && me.competitiveTier > 0 && oppTiers.length) {
    const oppAvg = oppTiers.reduce((a, b) => a + b, 0) / oppTiers.length
    opponentAdjust = Math.round(clamp((oppAvg - me.competitiveTier) * 6, -40, 40))
    raw += opponentAdjust
  }

  const score = Math.round(clamp(raw, 0, 1000))
  return {
    score,
    grade: vtsGrade(score),
    version: VTS_VERSION,
    components,
    kast: Math.round(kast),
    clutches,
    multiKills: { k3, k4, k5 },
    opponentAdjust
  }
}
