import { execFile } from 'node:child_process'
import { log } from '../logger'
import { tr } from '@shared/i18n'

/**
 * Pauses and resumes whatever the Windows media session reports as playing (Spotify, YouTube Music,
 * a browser tab, VLC...). It uses the system media transport controls, so pause and play are explicit:
 * there is no toggle key that could accidentally start music that was off.
 */

const PREAMBLE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
`

const PAUSE_SCRIPT = `${PREAMBLE}
$paused = @()
foreach ($s in $mgr.GetSessions()) {
  if ($s.GetPlaybackInfo().PlaybackStatus -eq 'Playing') {
    if (Await ($s.TryPauseAsync()) ([bool])) { $paused += $s.SourceAppUserModelId }
  }
}
Write-Output ('PAUSED:' + ($paused -join '|'))
`

const resumeScript = (ids: string[]): string => `${PREAMBLE}
$ids = @(${ids.map((i) => `'${i}'`).join(',')})
foreach ($s in $mgr.GetSessions()) {
  if ($ids -contains $s.SourceAppUserModelId) { [void](Await ($s.TryPlayAsync()) ([bool])) }
}
Write-Output 'RESUMED'
`

function runPowerShell(script: string): Promise<string> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: 15_000, windowsHide: true },
      (err, stdout) => (err ? reject(err) : resolve(stdout.trim()))
    )
  })
}

export class MusicControlService {
  /** Sessions this app paused, so it only resumes what it stopped itself. */
  private paused: string[] = []
  private busy: Promise<void> = Promise.resolve()
  private errorLogged = false

  get isHoldingPause(): boolean {
    return this.paused.length > 0
  }

  /** Pauses everything that is playing. Calls are serialized so pause/resume never overlap. */
  pause(): Promise<void> {
    return this.enqueue(async () => {
      if (this.paused.length) return
      const out = await runPowerShell(PAUSE_SCRIPT)
      const ids = out.replace(/^PAUSED:/, '').split('|').filter(Boolean)
      this.paused = ids
      if (ids.length) log(tr('Müzik'), 'info', tr('Müzik duraklatıldı'))
    })
  }

  /** Resumes only the sessions this app paused. */
  resume(): Promise<void> {
    return this.enqueue(async () => {
      const ids = this.paused.filter((i) => /^[\w.!\\\-\s]+$/.test(i)) // ids go into a script: keep them plain
      this.paused = []
      if (!ids.length) return
      await runPowerShell(resumeScript(ids))
      log(tr('Müzik'), 'info', tr('Müzik devam ettirildi'))
    })
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    this.busy = this.busy.then(job).catch((e: Error) => {
      if (!this.errorLogged) {
        this.errorLogged = true
        log(tr('Müzik'), 'error', tr('Medya kontrolü çalışmadı: {msg}', { msg: e.message.split('\n')[0] }))
      }
    })
    return this.busy
  }
}
