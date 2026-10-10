import { describe, expect, it } from 'vitest'
import { loadSettings, resolveTheme, saveSettings } from './settings'

describe('settings', () => {
  it('round-trips patches through localStorage', () => {
    localStorage.clear()
    saveSettings({ theme: 'night', fontSize: 'l' })
    expect(loadSettings().theme).toBe('night')
    expect(loadSettings().fontSize).toBe('l')
    expect(loadSettings().readMode).toBe('scroll')
  })

  it('maps system theme to night when the OS is dark', () => {
    expect(resolveTheme('system', true)).toBe('night')
    expect(resolveTheme('system', false)).toBe('paper')
    expect(resolveTheme('green', true)).toBe('green')
  })

  it('migrates the old sepia theme to green', () => {
    localStorage.clear()
    localStorage.setItem('sujian.settings', JSON.stringify({ theme: 'sepia' }))
    expect(loadSettings().theme).toBe('green')
  })
})
