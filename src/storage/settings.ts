export type ThemeName = 'paper' | 'night' | 'sepia' | 'system'
export type FontFamily = 'serif' | 'sans'
export type FontSize = 's' | 'm' | 'l'
export type ReadMode = 'scroll' | 'page'
export type ShelfView = 'grid' | 'list'
export type ShelfSort = 'updated' | 'title' | 'author' | 'added' | 'progress'

export interface AppSettings {
  theme: ThemeName
  fontFamily: FontFamily
  fontSize: FontSize
  lineHeight: number
  pageMargin: number
  readMode: ReadMode
  shelfView: ShelfView
  shelfSort: ShelfSort
  backupDays: number
  onboardingDone: boolean
}

const KEY = 'sujian.settings'
const SIZE_PX: Record<FontSize, number> = { s: 16, m: 18, l: 22 }

export const defaultSettings: AppSettings = {
  theme: 'paper',
  fontFamily: 'serif',
  fontSize: 'm',
  lineHeight: 1.7,
  pageMargin: 18,
  readMode: 'scroll',
  shelfView: 'grid',
  shelfSort: 'updated',
  backupDays: 3,
  onboardingDone: false,
}

export function fontSizePx(size: FontSize): number {
  return SIZE_PX[size] ?? SIZE_PX.m
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaultSettings }
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function resolveTheme(theme: ThemeName, prefersDark = false): Exclude<ThemeName, 'system'> {
  if (theme === 'system') return prefersDark ? 'night' : 'paper'
  return theme
}

export function applyTheme(theme: Exclude<ThemeName, 'system'>): void {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  const colors = { paper: '#efe6d4', sepia: '#e6d3a8', night: '#12110f' }
  meta?.setAttribute('content', colors[theme])
}
