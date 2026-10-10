export type ThemeName = 'paper' | 'night' | 'green' | 'system'
export type ResolvedTheme = Exclude<ThemeName, 'system'>
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
  backupReminderDismissedAt?: string
  onboardingDone: boolean
  findWildcards: boolean
}

const KEY = 'sujian.settings'
const SIZE_PX: Record<FontSize, number> = { s: 16, m: 18, l: 22 }

export const themeChoices: readonly (readonly [ThemeName, string])[] = [
  ['paper', '素纸'],
  ['green', '护眼'],
  ['night', '夜读'],
  ['system', '跟随系统'],
]

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
  findWildcards: false,
}

export function fontSizePx(size: FontSize): number {
  return SIZE_PX[size] ?? SIZE_PX.m
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaultSettings }
    const saved = JSON.parse(raw) as Partial<AppSettings>
    if ((saved.theme as string) === 'sepia') saved.theme = 'green'
    return { ...defaultSettings, ...saved }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function resolveTheme(theme: ThemeName, prefersDark = false): ResolvedTheme {
  if (theme === 'system') return prefersDark ? 'night' : 'paper'
  return theme
}

/** Switches the root theme and returns its top bar color (read from CSS) for system chrome. */
export function applyTheme(theme: ResolvedTheme): string {
  const root = document.documentElement
  root.dataset.theme = theme
  const bar = getComputedStyle(root).getPropertyValue('--bar').trim()
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
  }
  if (bar) meta.content = bar
  return bar
}
