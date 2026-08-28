import * as React from 'react'
import { saveSettings } from '@/api/account'
import { useAuth } from '@/lib/auth'

/* ============================================================
   აპლიკაციის პარამეტრები (Tasks E1).

   I7-ის შემდეგ შენახვა **per-user backend-შია** (`users.settings`),
   localStorage დარჩა როგორც ლოკალური ქეში (მყისიერი პირველი რენდერი)
   და ერთჯერადი მიგრაციის წყარო ძველი single-user მდგომარეობიდან.
   ============================================================ */

export interface Settings {
  /** მსახიობის გვერდი — ცალკე ფილმებზე, ცალკე სერიალებზე (E2) */
  actorMoviesPerPage: number
  actorSeriesPerPage: number
  /** ბიბლიოთეკის გვერდზე ჩანაწერების რაოდენობა; 0 = ყველა (E2) */
  libraryPageSize: number
  /** „აღმოაჩინე" — რამდენ გვერდამდე მივყვეთ TMDB-ს (E3). TMDB-ს ლიმიტი 500-ია. */
  discoverMaxPages: number
  /** „აღმოაჩინე" — ჩანაწერი გვერდზე; TMDB თითო გვერდზე 20-ს აბრუნებს, ამიტომ ჯერადი (E3) */
  discoverPerPage: number
  /** პაუზა სინქრონის ჩანაწერებს შორის, ms — TMDB-ის rate-limit-ისთვის (J5) */
  syncDelayMs: number
}

export const DEFAULT_SETTINGS: Settings = {
  actorMoviesPerPage: 10,
  actorSeriesPerPage: 10,
  libraryPageSize: 0,
  discoverMaxPages: 100,
  discoverPerPage: 20,
  syncDelayMs: 200,
}

/** TMDB-ის მყარი ლიმიტი: `page` ≤ 500 (discover-იც და search-იც) */
export const TMDB_MAX_PAGE = 500

export const DISCOVER_PER_PAGE_OPTIONS = [20, 40, 60, 80, 100]
export const LIBRARY_PAGE_SIZE_OPTIONS = [0, 24, 48, 60, 96, 120]
export const ACTOR_PER_PAGE_OPTIONS = [5, 10, 15, 20, 30, 50]
export const SYNC_DELAY_OPTIONS = [0, 200, 500, 1000, 2000]

const KEY = 'mediary.settings.v1'

function merge(partial?: Partial<Settings> | null): Settings {
  return { ...DEFAULT_SETTINGS, ...(partial ?? {}) }
}

function loadLocal(): Settings | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? merge(JSON.parse(raw) as Partial<Settings>) : null
  } catch {
    return null
  }
}

function saveLocal(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // private mode / სავსე quota — პარამეტრები სესიაში მაინც მუშაობს
  }
}

interface SettingsApi {
  settings: Settings
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  reset: () => void
  /** backend-ზე შენახვა მიმდინარეობს */
  saving: boolean
}

const SettingsContext = React.createContext<SettingsApi>({
  settings: DEFAULT_SETTINGS,
  set: () => {},
  reset: () => {},
  saving: false,
})

export function useSettings() {
  return React.useContext(SettingsContext)
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [settings, setSettings] = React.useState<Settings>(() => loadLocal() ?? DEFAULT_SETTINGS)
  const [saving, setSaving] = React.useState(false)

  // ვისზეა მიმდინარე state — რომ user-ის შეცვლაზე ერთხელ გადაიტვირთოს
  const loadedFor = React.useRef<number | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    if (!user) {
      loadedFor.current = null
      return
    }
    if (loadedFor.current === user.id) return
    loadedFor.current = user.id

    if (user.settings && Object.keys(user.settings).length > 0) {
      const fromServer = merge(user.settings)
      setSettings(fromServer)
      saveLocal(fromServer)
      return
    }

    // backend-ზე ჯერ არაფერია: ძველი localStorage-ის მნიშვნელობები ერთხელ აიტვირთოს
    const local = loadLocal()
    const initial = local ?? DEFAULT_SETTINGS
    setSettings(initial)
    void saveSettings(initial).catch(() => {})
  }, [user])

  const persist = React.useCallback(
    (next: Settings) => {
      saveLocal(next)
      if (!user) return
      if (timer.current) clearTimeout(timer.current)
      setSaving(true)
      // debounce — select-ების სწრაფ ცვლილებაზე თითო რექვესთი არ გავიდეს
      timer.current = setTimeout(() => {
        saveSettings(next)
          .catch(() => {})
          .finally(() => setSaving(false))
      }, 400)
    },
    [user],
  )

  const set = React.useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((cur) => {
        const next = { ...cur, [key]: value }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const reset = React.useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
    persist(DEFAULT_SETTINGS)
  }, [persist])

  const api = React.useMemo<SettingsApi>(
    () => ({ settings, set, reset, saving }),
    [settings, set, reset, saving],
  )

  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>
}
