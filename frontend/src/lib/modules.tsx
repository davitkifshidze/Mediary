import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchModules, type ModuleInfo } from '@/api/account'
import { MEDIA, type MediaType } from '@/lib/media'
import { useAuth } from '@/lib/auth'

/* ============================================================
   მოდულების კონტექსტი (I2/I3).
   ნავიგაცია და მარშრუტები backend-იდან მოდის (`GET /api/modules`),
   და არა hard-coded სიიდან — ჩაურთველი მოდული საერთოდ არ ჩანს.
   ============================================================ */

/** მედია-დომენები, რომლებზეც generic UI (LibraryPage/MoviePage/…) მუშაობს */
const MEDIA_KEYS = Object.keys(MEDIA) as MediaType[]

export function isMediaKey(key: string): key is MediaType {
  return (MEDIA_KEYS as string[]).includes(key)
}

interface ModulesApi {
  /** ყველა აქტიური მოდული (ჩართულიც და ჩასართავადაც) */
  all: ModuleInfo[]
  /** ჩემთვის ჩართული */
  enabled: ModuleInfo[]
  /** ჩემთვის ჩართული მედია-დომენები (movie/series) — მარშრუტებისთვის */
  mediaModules: (ModuleInfo & { type: MediaType })[]
  /** ჩართული არა-მედია მოდულები საკუთარი გვერდით (მაგ. ვიდეოები) */
  pageModules: ModuleInfo[]
  has: (key: string) => boolean
  loading: boolean
}

/**
 * არა-მედია მოდულები, რომლებსაც საკუთარი გვერდი აქვთ (`App.tsx`-ის რეესტრი).
 * `video_adult` აქ არაა: ის ცალკე გვერდი კი არა, `video`-ს შიგნით 18+ ჩანაწერების
 * გამხსნელი დროშაა.
 */
export const PAGE_MODULE_KEYS = ['video'] as const

const ModulesContext = React.createContext<ModulesApi>({
  all: [],
  enabled: [],
  mediaModules: [],
  pageModules: [],
  has: () => false,
  loading: true,
})

export function useModules() {
  return React.useContext(ModulesContext)
}

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn: fetchModules,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })

  const value = React.useMemo<ModulesApi>(() => {
    const all = data ?? []
    const enabled = all.filter((m) => m.enabled)
    const mediaModules = enabled
      .filter((m) => isMediaKey(m.key))
      .map((m) => ({ ...m, type: m.key as MediaType }))

    return {
      all,
      enabled,
      mediaModules,
      pageModules: enabled.filter((m) => (PAGE_MODULE_KEYS as readonly string[]).includes(m.key)),
      has: (key: string) => enabled.some((m) => m.key === key),
      loading: isLoading,
    }
  }, [data, isLoading])

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>
}

/** მოდულის სახელი მიმდინარე ენაზე */
export function moduleName(m: ModuleInfo, lang: string): string {
  return (lang === 'ka' ? m.name_ka : m.name_en) || m.name_en || m.name_ka
}

export function moduleDescription(m: ModuleInfo, lang: string): string | null {
  return (lang === 'ka' ? m.description_ka : m.description_en) || m.description_en || m.description_ka
}
