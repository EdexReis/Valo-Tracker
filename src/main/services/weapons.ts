/* eslint-disable @typescript-eslint/no-explicit-any */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Bucket for one kill: the weapon's uuid, or a fixed key for abilities, the spike, falls and the rest. */
export function weaponKey(finishingDamage: any): string {
  const item = String(finishingDamage?.damageItem ?? '')
  if (UUID.test(item)) return item.toLowerCase()
  switch (finishingDamage?.damageType) {
    case 'Ability':
    case 'Ultimate':
      return 'ability'
    case 'Bomb':
      return 'spike'
    case 'Fall':
      return 'fall'
    default:
      return 'other'
  }
}

/** Kills the player made and deaths they suffered, grouped by the finishing weapon. */
export function weaponTally(d: any, puuid: string): { kills: Record<string, number>; deaths: Record<string, number> } {
  const kills: Record<string, number> = {}
  const deaths: Record<string, number> = {}
  for (const k of Array.isArray(d.kills) ? d.kills : []) {
    if (k.killer === puuid && k.victim !== puuid) {
      const key = weaponKey(k.finishingDamage)
      kills[key] = (kills[key] ?? 0) + 1
    } else if (k.victim === puuid) {
      const key = weaponKey(k.finishingDamage)
      deaths[key] = (deaths[key] ?? 0) + 1
    }
  }
  return { kills, deaths }
}
