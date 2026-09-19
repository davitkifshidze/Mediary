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

/** არა-მედია მოდულები, რომლებსაც საკუთარი გვერდი აქვთ (`App.tsx`-ის რეესტრი) */
export const PAGE_MODULE_KEYS = ['video', 'song', 'book', 'board_game', 'game', 'note', 'bookmark', 'course', 'place', 'gallery'] as const

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

/* ============================================================
   **მოდულის ფერი CSS-ცვლადებად** (ეტაპი 6 → ეტაპი 10).

   ⚠️ **Tailwind კლასს hex-იდან ვერ დაბადებს**: `border-[#6366f1]`
   კომპილაციისას არ არსებობს. ამიტომ ფერი inline `style`-ით ორ ცვლადად
   ჩამოდის (`--mod` და სუსტი ტონი `--mod-soft`), კლასები კი სტატიკურია
   (`hover:border-[var(--mod)]`) — ჰოვერი მხოლოდ CSS-ით ითქმება, JS-ით არა.

   ⚠️ **ფერის გარეშე მოდული ცვლადს არ წერს** — მშობლისას იმემკვიდრებს
   (საიდბარში `<nav>`-ის ოქროსფერი). სწორედ ეს ცვლის „თუ ფერი არ აქვს"
   განშტოებას ყოველ გამოძახებაზე.

   ⚠️ **ერთი განსაზღვრება ორი მომხმარებლისთვის** — საიდბარისა და აუდიტ-
   ლოგის ბარათების; მეორე ასლი იმავე კვირაში გაშორდებოდა.

   ⚠️ **`--mod-fill` სუსტი ტონის ძლიერი ძმაა (28% vs 16%) და 2026-09-15-ს
   დაემატა**: საიდბარში აქტიური პუნქტი `--mod-soft`-ით იხატებოდა და
   „რომელზე ვდგავარ" პრაქტიკულად არ ჩანდა — ეს იყო შენი შენიშვნა. ორივე
   რჩება, რადგან სხვადასხვა საქმეს აკეთებენ: `soft` **ფონია** (ბარათის
   ხატულის ფილა), `fill` კი **მონიშვნაა**. ერთ მნიშვნელობამდე შეკვეცა
   ან ბარათს გადააფერადებდა, ან მონიშვნას ისევ უხილავს გახდიდა.
   ============================================================ */
export function modAccent(color: string | null | undefined): React.CSSProperties | undefined {
  if (!color) return undefined
  return {
    '--mod': color,
    '--mod-soft': `color-mix(in oklab, ${color} 16%, transparent)`,
    '--mod-fill': `color-mix(in oklab, ${color} 28%, transparent)`,
  } as React.CSSProperties
}

/**
 * ნაგულისხმევი აქცენტი — ოქროსფერი. ფერის უქონელი (ან ფსევდო-) მოდული
 * სწორედ ამას იმემკვიდრებს, ე.ი. „თუ ფერი არ აქვს" განშტოება ყოველ
 * გამოძახებაზე აღარ იწერება.
 */
export const MODULE_ACCENT_FALLBACK = {
  '--mod': 'var(--gold)',
  '--mod-soft': 'color-mix(in oklab, var(--gold) 16%, transparent)',
  '--mod-fill': 'color-mix(in oklab, var(--gold) 28%, transparent)',
} as React.CSSProperties

/** მოდულის სახელი მიმდინარე ენაზე */
export function moduleName(m: ModuleInfo, lang: string): string {
  return (lang === 'ka' ? m.name_ka : m.name_en) || m.name_en || m.name_ka
}

export function moduleDescription(m: ModuleInfo, lang: string): string | null {
  return (lang === 'ka' ? m.description_ka : m.description_en) || m.description_en || m.description_ka
}
