import https from 'node:https'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { CLIENT_PLATFORM } from '../constants'
import { log } from '../logger'

export interface Lockfile {
  name: string
  pid: string
  port: number
  password: string
  protocol: string
}

interface Tokens {
  accessToken: string
  entitlementsToken: string
  puuid: string
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: string,
    url: string
  ) {
    super(`HTTP ${status} ${url}`)
  }
}

const localAgent = new https.Agent({ rejectUnauthorized: false })

export class AuthService {
  private tokens: Tokens | null = null
  private clientVersion: string | null = null
  private refreshing: Promise<boolean> | null = null
  private lock: Lockfile | null = null

  get puuid(): string | null {
    return this.tokens?.puuid ?? null
  }

  get lockfile(): Lockfile | null {
    return this.lock
  }

  readLockfile(): Lockfile | null {
    const base = process.env.LOCALAPPDATA
    if (!base) return null
    try {
      const raw = readFileSync(path.join(base, 'Riot Games', 'Riot Client', 'Config', 'lockfile'), 'utf8').trim()
      const [name, pid, port, password, protocol] = raw.split(':')
      if (!port || !password) return null
      return { name, pid, port: Number(port), password, protocol }
    } catch {
      return null
    }
  }

  basicAuth(lock: Lockfile): string {
    return 'Basic ' + Buffer.from(`riot:${lock.password}`).toString('base64')
  }

  /** GET against the local Riot Client API (self-signed cert). */
  localGet(urlPath: string): Promise<{ status: number; body: string }> {
    const lock = this.lock ?? this.readLockfile()
    if (!lock) return Promise.reject(new Error('Lockfile bulunamadı'))
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: '127.0.0.1',
          port: lock.port,
          path: urlPath,
          method: 'GET',
          agent: localAgent,
          headers: { Authorization: this.basicAuth(lock) },
          timeout: 5000
        },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (c) => (body += c))
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
        }
      )
      req.on('timeout', () => req.destroy(new Error('Yerel istek zaman aşımı')))
      req.on('error', reject)
      req.end()
    })
  }

  /** Fetches fresh tokens from the local client. Concurrent calls share one request. */
  refreshTokens(): Promise<boolean> {
    if (this.refreshing) return this.refreshing
    this.refreshing = this.doRefresh().finally(() => (this.refreshing = null))
    return this.refreshing
  }

  private async doRefresh(): Promise<boolean> {
    this.lock = this.readLockfile()
    if (!this.lock) return false
    try {
      const { status, body } = await this.localGet('/entitlements/v1/token')
      if (status !== 200) return false
      const data = JSON.parse(body) as { accessToken?: string; token?: string; subject?: string }
      if (!data.accessToken || !data.token || !data.subject) return false
      this.tokens = { accessToken: data.accessToken, entitlementsToken: data.token, puuid: data.subject }
      return true
    } catch {
      return false
    }
  }

  clear(): void {
    this.tokens = null
    this.lock = null
  }

  private async getClientVersion(): Promise<string> {
    if (this.clientVersion) return this.clientVersion
    const res = await fetch('https://valorant-api.com/v1/version')
    const json = (await res.json()) as { data: { riotClientVersion: string } }
    this.clientVersion = json.data.riotClientVersion
    return this.clientVersion
  }

  private async headers(): Promise<Record<string, string>> {
    if (!this.tokens && !(await this.refreshTokens())) throw new Error('Riot Client oturumu yok')
    const t = this.tokens!
    return {
      Authorization: `Bearer ${t.accessToken}`,
      'X-Riot-Entitlements-JWT': t.entitlementsToken,
      'X-Riot-ClientVersion': await this.getClientVersion(),
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'Content-Type': 'application/json'
    }
  }

  /** Remote (GLZ / PD) request. On 401 the token is refreshed locally and the request retried once. */
  async remote<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method,
        headers: await this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      const text = await res.text()
      const expired = res.status === 401 || (res.status === 400 && text.includes('BAD_CLAIMS'))
      if (expired && attempt === 0) {
        log('Auth', 'info', 'Token süresi doldu, yenileniyor…')
        if (await this.refreshTokens()) continue
      }
      if (!res.ok) throw new HttpError(res.status, text, url)
      return (text ? JSON.parse(text) : undefined) as T
    }
  }
}
