import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import type { SavedCrosshair } from '@shared/types'

/** The player's own library of crosshair share codes. */
export class CrosshairService {
  private file = path.join(app.getPath('userData'), 'crosshairs.json')
  private items: SavedCrosshair[] = []

  constructor() {
    try {
      this.items = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      this.items = []
    }
  }

  private save(): SavedCrosshair[] {
    try {
      writeFileSync(this.file, JSON.stringify(this.items))
    } catch {
      /* non-fatal */
    }
    return this.items
  }

  list(): SavedCrosshair[] {
    return this.items
  }

  add(input: { name: string; code: string }): SavedCrosshair[] {
    const name = input.name.trim().slice(0, 60)
    const code = input.code.trim().slice(0, 500)
    if (!name || !code) return this.items
    this.items = [...this.items, { id: randomUUID(), name, code }]
    return this.save()
  }

  remove(id: string): SavedCrosshair[] {
    this.items = this.items.filter((c) => c.id !== id)
    return this.save()
  }
}
