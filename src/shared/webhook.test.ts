import { describe, expect, it } from 'vitest'
import type { MatchSummary } from './types'
import { buildMatchEmbed, isDiscordWebhookUrl } from './webhook'

const ID = '1234567890123456789'
const TOKEN = 'abcDEF_ghi-JKLmno0123456789abcDEF_ghi-JKLmno0123456789'

describe('isDiscordWebhookUrl', () => {
  it('accepts discord.com and discordapp.com webhook urls', () => {
    expect(isDiscordWebhookUrl(`https://discord.com/api/webhooks/${ID}/${TOKEN}`)).toBe(true)
    expect(isDiscordWebhookUrl(`https://discordapp.com/api/webhooks/${ID}/${TOKEN}`)).toBe(true)
    expect(isDiscordWebhookUrl(`https://canary.discord.com/api/webhooks/${ID}/${TOKEN}`)).toBe(true)
  })

  it('rejects look-alike hosts, http and other paths', () => {
    expect(isDiscordWebhookUrl(`https://evil.example/api/webhooks/${ID}/${TOKEN}`)).toBe(false)
    expect(isDiscordWebhookUrl(`https://discord.com.evil.example/api/webhooks/${ID}/${TOKEN}`)).toBe(false)
    expect(isDiscordWebhookUrl(`http://discord.com/api/webhooks/${ID}/${TOKEN}`)).toBe(false)
    expect(isDiscordWebhookUrl(`https://discord.com/api/other/${ID}/${TOKEN}`)).toBe(false)
    expect(isDiscordWebhookUrl('')).toBe(false)
  })
})

const base: MatchSummary = {
  matchId: '1',
  startMillis: Date.UTC(2026, 9, 27, 12),
  queue: 'Rekabetçi',
  queueId: 'competitive',
  mapName: 'Ascent',
  agentName: 'Jett',
  agentIcon: null,
  kills: 18,
  deaths: 12,
  assists: 4,
  result: 'win',
  roundsWon: 13,
  roundsLost: 9,
  rounds: 22,
  acs: 250,
  adr: 160,
  hsPercent: 31,
  firstBloods: 4,
  firstDeaths: 2,
  rrChange: 21,
  vts: { score: 720, grade: 'A' }
}

describe('buildMatchEmbed', () => {
  it('summarizes a ranked win', () => {
    const e = buildMatchEmbed(base)
    expect(e.title).toBe('Galibiyet · Ascent (Rekabetçi)')
    expect(e.color).toBe(0x34d399)
    const byName = Object.fromEntries(e.fields.map((f) => [f.name, f.value]))
    expect(byName['K/D/A']).toBe('18/12/4 (K/D 1.50)')
    expect(byName['VTS']).toBe('720 (A Sınıfı)')
    expect(byName['RR']).toBe('+21')
  })

  it('omits RR outside competitive and VTS when unknown', () => {
    const e = buildMatchEmbed({ ...base, queueId: 'unrated', queue: 'Derecesiz', vts: null, result: 'loss', rrChange: null })
    expect(e.fields.map((f) => f.name)).not.toContain('RR')
    expect(e.fields.map((f) => f.name)).not.toContain('VTS')
    expect(e.color).toBe(0xff4655)
  })

  it('never contains a player name', () => {
    expect(JSON.stringify(buildMatchEmbed(base))).not.toMatch(/#/)
  })
})
