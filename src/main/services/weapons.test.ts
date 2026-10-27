import { describe, expect, it } from 'vitest'
import { weaponKey, weaponTally } from './weapons'

const VANDAL = '9C82E19D-4575-0200-1A81-3E800CF87274'

describe('weaponKey', () => {
  it('uses the lower-cased weapon uuid', () => {
    expect(weaponKey({ damageType: 'Weapon', damageItem: VANDAL })).toBe(VANDAL.toLowerCase())
  })

  it('groups abilities, the spike and falls', () => {
    expect(weaponKey({ damageType: 'Ability', damageItem: 'Ability1' })).toBe('ability')
    expect(weaponKey({ damageType: 'Ultimate', damageItem: 'Ultimate' })).toBe('ability')
    expect(weaponKey({ damageType: 'Bomb', damageItem: '' })).toBe('spike')
    expect(weaponKey({ damageType: 'Fall', damageItem: '' })).toBe('fall')
  })

  it('falls back to other for missing data', () => {
    expect(weaponKey(undefined)).toBe('other')
  })
})

describe('weaponTally', () => {
  it('counts my kills and my deaths separately', () => {
    const d = {
      kills: [
        { killer: 'me', victim: 'e1', finishingDamage: { damageType: 'Weapon', damageItem: VANDAL } },
        { killer: 'me', victim: 'e2', finishingDamage: { damageType: 'Weapon', damageItem: VANDAL } },
        { killer: 'me', victim: 'e3', finishingDamage: { damageType: 'Ability', damageItem: 'Ability2' } },
        { killer: 'e1', victim: 'me', finishingDamage: { damageType: 'Weapon', damageItem: VANDAL } },
        { killer: 'e2', victim: 'm1', finishingDamage: { damageType: 'Weapon', damageItem: VANDAL } }
      ]
    }
    const t = weaponTally(d, 'me')
    expect(t.kills).toEqual({ [VANDAL.toLowerCase()]: 2, ability: 1 })
    expect(t.deaths).toEqual({ [VANDAL.toLowerCase()]: 1 })
  })

  it('returns empty tallies without a kill list', () => {
    expect(weaponTally({}, 'me')).toEqual({ kills: {}, deaths: {} })
  })
})
