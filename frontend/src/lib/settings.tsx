import * as React from 'react'
import { saveSettings } from '@/api/account'
import { useToast } from '@/components/ui/feedback'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'

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
  /**
   * პაუზა **თარგმანის** ჩანაწერებს შორის, ms (Tasks 7).
   * განზრახ ცალკეა `syncDelayMs`-ისგან: თარგმანი Gemini-ს ურეკავს და
   * მისი rate-limit TMDB-ისას არ ემთხვევა.
   */
  translateDelayMs: number

  /* ---------- E4 ---------- */
  /** ბიბლიოთეკის ნაგულისხმევი სორტირება — გახსნისას აღარ ირჩევა ხელახლა */
  defaultSortField: SortField
  defaultSortDir: SortDir
  /** რომელი სექცია გაიხსნას ბიბლიოთეკაზე `?view=`-ის გარეშე */
  defaultView: LibraryView
  /**
   * კონტენტის ენა (სახელი/აღწერა) — ინტერფეისის ენისგან **დამოუკიდებლად**.
   * `auto` = მიჰყვება ინტერფეისს (ძველი ქცევა).
   */
  contentLang: ContentLang

  /* ---------- 18 (backlog, 2026-09-06) ---------- */
  /**
   * ბადის ნაგულისხმევი დაჯგუფება — ჟანრი / წელი / სტატუსი.
   * ⚠️ **ფრანჩაიზის დაჯგუფებას არ ცვლის:** ის backend-ის `group=`-ია
   * (კოლექციის ერთ ბარათად შეკვრა), ეს კი ბადის სექციებად დაშლაა.
   * ორივე ერთდროულადაც მუშაობს.
   */
  defaultGrouping: GroupBy
  /** ბარათის ზომა ბადეზე — სვეტების რაოდენობას ცვლის */
  cardSize: CardSize
  /**
   * TMDB პოსტერის ხარისხი. ⚠️ **ჩამოტვირთვის მომენტში მოქმედებს** —
   * უკვე ჩამოტვირთულს არ ცვლის; გადასაწერად `/sync` სჭირდება.
   */
  posterQuality: PosterQuality
  /**
   * „დამატებისას ავტომატური resync" — TMDB-იდან დამატებულ ჩანაწერს
   * შენახვისთანავე ტვირთავს მედიას. გამორთვა დამატებას აჩქარებს.
   */
  autoResync: boolean
  /** თარიღის ფორმატი — `lib/dates.ts::useDateFormat()` კითხულობს */
  dateFormat: DateFormat
}

/** ბიბლიოთეკის სორტირება — `LibraryPage`-ის ველი + მიმართულება */
export type SortField = 'added' | 'year' | 'rating'
export type SortDir = 'asc' | 'desc'

/** საიდბარის სექციები (`?view=`) */
/**
 * ბიბლიოთეკის ნაგულისხმევი სექცია: `all` · `favorite` · **სტატუსის გასაღები**.
 *
 * ⚠️ §6.4-ის შემდეგ კონკრეტული სია აქ ვეღარ ჩაიწერება — სტატუსი per-user
 * ლექსიკონია, ე.ი. ვარიანტები `/settings`-ზე მისგან იგება.
 */
export type LibraryView = string

export type ContentLang = 'auto' | 'ka' | 'en'

/** ბადის სექციებად დაშლა (18) — `off` = ერთი უწყვეტი ბადე */
export type GroupBy = 'off' | 'genre' | 'year' | 'status'
export type CardSize = 'compact' | 'medium' | 'large'
/** TMDB-ის სურათის ზომები; `w500` ისტორიული ნაგულისხმევია */
export type PosterQuality = 'w342' | 'w500' | 'w780'
/** `iso` = `YYYY-MM-DD`, დანარჩენი — ბრაუზერის ლოკალი */
export type DateFormat = 'ka-GE' | 'en-GB' | 'iso'

export const DEFAULT_SETTINGS: Settings = {
  actorMoviesPerPage: 10,
  actorSeriesPerPage: 10,
  libraryPageSize: 0,
  discoverMaxPages: 100,
  discoverPerPage: 20,
  syncDelayMs: 200,
  translateDelayMs: 4000,
  defaultSortField: 'added',
  defaultSortDir: 'desc',
  defaultView: 'all',
  contentLang: 'auto',
  defaultGrouping: 'off',
  cardSize: 'medium',
  posterQuality: 'w500',
  autoResync: true,
  dateFormat: 'ka-GE',
}

export const SORT_FIELD_OPTIONS: SortField[] = ['added', 'year', 'rating']
export const SORT_DIR_OPTIONS: SortDir[] = ['desc', 'asc']
/** ჩარჩო — სტატუსები მათ შორის ჯდება (იხ. `SettingsPage`) */
export const LIBRARY_VIEW_FRAME = ['all', 'favorite'] as const
export const CONTENT_LANG_OPTIONS: ContentLang[] = ['auto', 'ka', 'en']
export const GROUP_BY_OPTIONS: GroupBy[] = ['off', 'genre', 'year', 'status']
export const CARD_SIZE_OPTIONS: CardSize[] = ['compact', 'medium', 'large']
export const POSTER_QUALITY_OPTIONS: PosterQuality[] = ['w342', 'w500', 'w780']
export const DATE_FORMAT_OPTIONS: DateFormat[] = ['ka-GE', 'en-GB', 'iso']

/** TMDB-ის მყარი ლიმიტი: `page` ≤ 500 (discover-იც და search-იც) */
export const TMDB_MAX_PAGE = 500

export const DISCOVER_PER_PAGE_OPTIONS = [20, 40, 60, 80, 100]
export const LIBRARY_PAGE_SIZE_OPTIONS = [0, 24, 48, 60, 96, 120]
export const ACTOR_PER_PAGE_OPTIONS = [5, 10, 15, 20, 30, 50]
export const SYNC_DELAY_OPTIONS = [0, 200, 500, 1000, 2000]
/* თარგმანის პაუზა — Gemini-ის ლიმიტი TMDB-ისაზე მკაცრია, ე.ი. ჭერიც მაღალია.
   ⚠️ ნაგულისხმევი 4000 ms-ია, რადგან Gemini-ის უფასო დონე წუთში ~15 მოთხოვნას
   უშვებს — 1000 ms წუთში 60-ს ნიშნავდა და რიგი 429-ებში ჩავარდებოდა. */
export const TRANSLATE_DELAY_OPTIONS = [0, 500, 1000, 2000, 4000, 5000]

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
  /** მიმდინარე მნიშვნელობები — შესაძლოა ჯერ შეუნახავი (Tasks 3) */
  settings: Settings
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  /** ნაგულისხმევებზე დაბრუნება — ისიც შენახვას მოითხოვს */
  reset: () => void
  /** შეუნახავი ცვლილებების გაუქმება */
  revert: () => void
  save: () => void
  /** არის თუ არა გაუშვებელი ცვლილება */
  dirty: boolean
  /** კონკრეტული პარამეტრი შეცვლილია და ჯერ არ შენახულა */
  isDirty: (key: keyof Settings) => boolean
  /** backend-ზე შენახვა მიმდინარეობს */
  saving: boolean
  /** ბოლო წარმატებული შენახვის დრო — „შენახულია ✓"-სთვის */
  savedAt: number | null
}

const SettingsContext = React.createContext<SettingsApi>({
  settings: DEFAULT_SETTINGS,
  set: () => {},
  reset: () => {},
  revert: () => {},
  save: () => {},
  dirty: false,
  isDirty: () => false,
  saving: false,
  savedAt: null,
})

export function useSettings() {
  return React.useContext(SettingsContext)
}

/**
 * კონტენტის (სახელი/აღწერა/ჟანრი) მოქმედი ენა — E4.
 * `contentLang: 'auto'` ინტერფეისის ენას მიჰყვება; სხვა შემთხვევაში
 * კონტენტი ერთ ენაზე რჩება, თუნდაც ინტერფეისი გადაირთოს.
 *
 * ⚠️ i18next-ის `useTranslation()` აქ განზრახ არ გამოიყენება — ეს ფაილი
 * `lib`-ია და i18n-ზე დამოკიდებულებას არ ქმნის; ინტერფეისის ენას
 * გამომძახებელი გადმოგვცემს.
 */
export function useContentLang(uiLang: string): 'ka' | 'en' {
  const { settings } = useSettings()
  if (settings.contentLang !== 'auto') return settings.contentLang

  return uiLang === 'en' ? 'en' : 'ka'
}

/**
 * Tasks 3 — შენახვა **აღარაა ავტომატური**.
 *
 * `settings` მიმდინარე (სამუშაო) მდგომარეობაა, `persisted` — ბოლო შენახული.
 * `set()` მხოლოდ სამუშაოს ცვლის, `save()` აგზავნის backend-ზე და ლოკალურ
 * ქეშსაც სწორედ მაშინ ანახლებს: თორემ გვერდის განახლების შემდეგ შეუნახავი
 * მნიშვნელობა შენახულად მოგვეჩვენებოდა.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  // ⚠️ ამიტომ დგას `FeedbackProvider` ამაზე გარეთ — იხ. `main.tsx` (GAP-03)
  const { toast } = useToast()
  const initial = React.useMemo(() => loadLocal() ?? DEFAULT_SETTINGS, [])
  const [settings, setSettings] = React.useState<Settings>(initial)
  const [persisted, setPersisted] = React.useState<Settings>(initial)
  const [saving, setSaving] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)

  // ვისზეა მიმდინარე state — რომ user-ის შეცვლაზე ერთხელ გადაიტვირთოს
  const loadedFor = React.useRef<number | null>(null)

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
      setPersisted(fromServer)
      saveLocal(fromServer)
      return
    }

    // backend-ზე ჯერ არაფერია: ძველი localStorage-ის მნიშვნელობები ერთხელ აიტვირთოს.
    // ეს მიგრაციაა და არა user-ის ცვლილება, ამიტომ შენახვის ღილაკს არ ელოდება.
    const local = loadLocal() ?? DEFAULT_SETTINGS
    setSettings(local)
    setPersisted(local)
    void saveSettings(local).catch(() => {})
  }, [user])

  const set = React.useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((cur) => (cur[key] === value ? cur : { ...cur, [key]: value }))
  }, [])

  const reset = React.useCallback(() => setSettings(DEFAULT_SETTINGS), [])
  const revert = React.useCallback(() => setSettings(persisted), [persisted])

  const save = React.useCallback(() => {
    if (!user) {
      saveLocal(settings)
      setPersisted(settings)
      setSavedAt(Date.now())
      return
    }
    setSaving(true)
    saveSettings(settings)
      .then(() => {
        saveLocal(settings)
        setPersisted(settings)
        setSavedAt(Date.now())
      })
      /* ⚠️ **ჩავარდნა ცხადად ჩანს (Tasks GAP-03).** ეს `/settings`-ისა და
         `/sync`-ის ერთადერთი შენახვის გზაა და `catch`-ი ცარიელი იყო: 500/419
         ან ქსელის გაწყვეტა უხმაუროდ იკარგებოდა, ზოლი კი „შეუნახავი
         ცვლილებებს" აჩვენებდა ახსნის გარეშე — მომხმარებელი Save-ს
         უსასრულოდ აჭერდა. აპის ყველა სხვა მუტაცია `onError` toast-ს აჩენს.

         ⚠️ `persisted` **განზრახ არ ახლდება**, ე.ი. `dirty` რჩება: ცვლილება
         ჯერ არ შენახულა და ზოლმაც ეს უნდა თქვას. */
      .catch((e: unknown) => toast({ title: errorMessage(e), variant: 'error' }))
      .finally(() => setSaving(false))
  }, [settings, toast, user])

  const dirty = React.useMemo(
    () => (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).some((k) => settings[k] !== persisted[k]),
    [settings, persisted],
  )

  const isDirty = React.useCallback(
    (key: keyof Settings) => settings[key] !== persisted[key],
    [settings, persisted],
  )

  const api = React.useMemo<SettingsApi>(
    () => ({ settings, set, reset, revert, save, dirty, isDirty, saving, savedAt }),
    [settings, set, reset, revert, save, dirty, isDirty, saving, savedAt],
  )

  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>
}
