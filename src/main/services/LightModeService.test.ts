import { describe, expect, it, vi } from 'vitest'
import { LightModeService } from './LightModeService'

function setup() {
  const setPriority = vi.fn()
  const broadcast = vi.fn()
  const log = vi.fn()
  const light = new LightModeService({ pids: () => [10, 11, 12], setPriority, broadcast, log })
  return { light, setPriority, broadcast, log }
}

describe('LightModeService', () => {
  it('lowers every process when a match starts and restores them afterwards', () => {
    const { light, setPriority, broadcast } = setup()
    light.enter()
    expect(light.active).toBe(true)
    expect(setPriority.mock.calls).toEqual([[10, 'low'], [11, 'low'], [12, 'low']])
    expect(broadcast).toHaveBeenLastCalledWith(true)

    setPriority.mockClear()
    light.exit()
    expect(light.active).toBe(false)
    expect(setPriority.mock.calls).toEqual([[10, 'normal'], [11, 'normal'], [12, 'normal']])
    expect(broadcast).toHaveBeenLastCalledWith(false)
  })

  it('does nothing twice in a row', () => {
    const { light, setPriority, log } = setup()
    light.enter()
    light.enter()
    expect(setPriority).toHaveBeenCalledTimes(3)
    expect(log).toHaveBeenCalledTimes(1)
    light.exit()
    light.exit()
    expect(setPriority).toHaveBeenCalledTimes(6)
  })

  it('stays inactive while the setting is off', () => {
    const { light, setPriority } = setup()
    light.configure(false)
    light.enter()
    expect(light.active).toBe(false)
    expect(setPriority).not.toHaveBeenCalled()
  })

  it('restores everything when it is switched off mid-match', () => {
    const { light, setPriority } = setup()
    light.enter()
    setPriority.mockClear()
    light.configure(false)
    expect(light.active).toBe(false)
    expect(setPriority).toHaveBeenCalledWith(10, 'normal')
  })

  it('ignores processes that cannot be adjusted', () => {
    const { light, setPriority } = setup()
    setPriority.mockImplementation((pid: number) => {
      if (pid === 11) throw new Error('EPERM')
    })
    expect(() => light.enter()).not.toThrow()
    expect(setPriority).toHaveBeenCalledTimes(3)
  })
})
