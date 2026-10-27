import type { MatchSummary } from './types'
import { tr } from './i18n'

/** Only genuine Discord webhook URLs are accepted, so match data can never be sent to another server. */
const WEBHOOK_URL = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,200}$/

export function isDiscordWebhookUrl(url: string): boolean {
  return WEBHOOK_URL.test(url.trim())
}

export interface DiscordEmbed {
  title: string
  color: number
  fields: Array<{ name: string; value: string; inline?: boolean }>
  footer: { text: string }
  timestamp: string
}

const COLORS = { win: 0x34d399, loss: 0xff4655, draw: 0x8b98a5 } as const

/** Embed for one finished match. It carries no player name or Riot ID. */
export function buildMatchEmbed(m: MatchSummary): DiscordEmbed {
  const kd = (m.kills / Math.max(1, m.deaths)).toFixed(2)
  const fields: DiscordEmbed['fields'] = [
    { name: tr('Ajan'), value: m.agentName, inline: true },
    { name: tr('Skor'), value: `${m.roundsWon} - ${m.roundsLost}`, inline: true },
    { name: 'K/D/A', value: `${m.kills}/${m.deaths}/${m.assists} (K/D ${kd})`, inline: true },
    { name: 'ACS · ADR', value: `${m.acs} · ${m.adr}`, inline: true },
    { name: tr('Kafa isabeti'), value: `%${m.hsPercent}`, inline: true }
  ]
  if (m.vts) fields.push({ name: 'VTS', value: tr('{score} ({grade} Sınıfı)', { score: m.vts.score, grade: m.vts.grade }), inline: true })
  if (typeof m.rrChange === 'number' && m.queueId === 'competitive') {
    fields.push({ name: 'RR', value: `${m.rrChange > 0 ? '+' : ''}${m.rrChange}`, inline: true })
  }
  return {
    title: `${{ win: tr('Galibiyet'), loss: tr('Mağlubiyet'), draw: tr('Berabere') }[m.result]} · ${m.mapName} (${tr(m.queue)})`,
    color: COLORS[m.result],
    fields,
    footer: { text: 'Valo Tracker' },
    timestamp: new Date(m.startMillis || Date.now()).toISOString()
  }
}
