import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateModuleSettings, type ModuleInfo } from '@/api/account'
import { useModules } from '@/lib/modules'
import type { RecordLayout } from '@/lib/recordLayout'
import type { CardSize } from '@/lib/settings'
import { safeGet, safeSet } from '@/lib/storage'

/* ============================================================
   **გვერდზე რამდენი — სვეტების ჯერადი.**

   შენი სიტყვები: „რიგში 3 → 9 15 21, სხვა, ყველა; რიგში 4 → 16, 24, 32…" ·
   ბადე: „6 და გამოდიოდეს 24 ცალი ანუ 4 რიგი". ვარიანტები **სვეტები × რიგები**
   (`PAGE_ROWS`) — ბოლო რიგი არასდროს რჩება ნახევრად სავსე; სტრიქონებს სვეტი არ
   აქვთ, მათ თავისი სერია აქვს (`ROW_PAGE_SIZES`). ნაგულისხმევი: ბარათი 3 რიგი,
   ბადე და ფოტოები 4 რიგი (ბარათები 9, ბადე 24, ფოტოები 16, სტრიქონები 10).

   ⚠️ **„ყველა" = 0 = ერთი გვერდი სერვერის ჭერით** (`perPage()` — სიები 500,
   ფოტოები 1000): ჭერზე მეტ სიაში „ნაჩვენებია N / M" და „მეტის ჩვენება"
   აგრძელებს. `all=1` შიდა გამომძახებლებისთვის რჩება (`paged.ts`).

   ⚠️ **სვეტების რიცხვი განლაგების ზედა ზღვარია** (ბარათები 3, ბადე 6,
   ფოტოები 4, პოსტერები `cardSize`-ით) — ვიწრო ეკრანზე სვეტი ნაკლებია და
   ბოლო რიგი შეიძლება არ შეივსოს; ფართოზე, სადაც ყველაზე მეტი ჩანს, ივსება.

   ⚠️ **არჩევანი მოდულზე ინახება** (`module_user.settings.page_size =
   {cards, grid, rows}`) — `useRecordLayout`-ის წესით: ჩუმად, ქეში ჯერ.
   სერვერი ბლობს **ზედაპირულად** ერწყმის, ამიტომ მთელი ობიექტი იგზავნება.
   გალერეის/ფოტოების ბადეები მოდული არ არიან — ბრაუზერში (`usePhotoPageSize`).
   ============================================================ */

/** სტრიქონების ნაგულისხმევი; ჩადგმული სიების ფიქსირებული ზომაც (`paged.ts` ამას გადასცემს) */
export const LIST_PAGE_SIZE = 10

/** რიგების რაოდენობა ვარიანტებში — „დიდი დიაპაზონიც" (12, 20) */
const PAGE_ROWS = [3, 4, 5, 6, 8, 12, 20] as const

/** სტრიქონები — სვეტი არ აქვთ */
const ROW_PAGE_SIZES = [LIST_PAGE_SIZE, 20, 30, 50, 100] as const

/** „ყველა" */
export const PAGE_ALL = 0

/** სერვერის ჭერი (`Controller::LIST_PER_PAGE_MAX`) — „ყველა" და „სხვა" აქამდე */
export const LIST_PER_PAGE_MAX = 500

/** ფოტოების ჭერი (`GalleryController::MAX_PER_PAGE`) */
export const PHOTO_PER_PAGE_MAX = 1000

/** ფოტოს ბადე (`PhotoGrid`, ჩაკეტილი ალბომიც) — `lg`-დან 4 სვეტი */
export const PHOTO_COLUMNS = 4

/** სიის ხედების სვეტების ზედა ზღვარი (`RecordView`-ის `LIST`) */
const LAYOUT_COLUMNS: Record<RecordLayout, number> = { cards: 3, grid: 6, rows: 1 }

/** პოსტერების ბადე (`MovieGrid`) — ბარათის ზომის ზედა ზღვარი; ბადის ხედი კომპაქტურია */
const POSTER_COLUMNS: Record<CardSize, number> = { compact: 10, medium: 6, large: 4 }

/** სვეტები ხედისთვის; `cardSize` — პოსტერების (ფილმი/სერიალი/ანიმე) სია */
export function layoutColumns(layout: RecordLayout, cardSize?: CardSize): number {
  if (!cardSize || layout === 'rows') return LAYOUT_COLUMNS[layout]
  return layout === 'grid' ? POSTER_COLUMNS.compact : (POSTER_COLUMNS[cardSize] ?? POSTER_COLUMNS.medium)
}

/** ვარიანტები — სვეტები × რიგები; ერთ სვეტზე — სტრიქონების სერია */
export function pageSizeOptions(columns: number): number[] {
  return columns <= 1 ? [...ROW_PAGE_SIZES] : PAGE_ROWS.map((rows) => rows * columns)
}

/** ნაგულისხმევი — ბარათი 3 რიგი, ბადე/ფოტოები 4 რიგი, სტრიქონები 10 */
export function defaultPageSize(columns: number, layout: RecordLayout | 'photos' = 'grid'): number {
  if (columns <= 1) return LIST_PAGE_SIZE
  return columns * (layout === 'cards' ? 3 : 4)
}

/** `per_page` მოთხოვნისთვის: „ყველა" — ჭერი, დანარჩენი ჭერამდე */
export function perPage(size: number, max: number = LIST_PER_PAGE_MAX): number {
  return size <= PAGE_ALL ? max : Math.min(size, max)
}

const SETTING = 'page_size'

type Saved = Partial<Record<RecordLayout, number>>

function readSaved(settings: Record<string, unknown> | undefined): Saved {
  const raw = settings?.[SETTING]
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Saved) : {}
}

/** ⚠️ ბლობი ნებისმიერი იყოს — უცნობი/დაზიანებული მნიშვნელობა ნაგულისხმევს ნიშნავს */
export function readPageSize(settings: Record<string, unknown> | undefined, layout: RecordLayout, fallback: number): number {
  const value = readSaved(settings)[layout]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= LIST_PER_PAGE_MAX ? value : fallback
}

/**
 * მოდულის სიის გვერდის ზომა მიმდინარე ხედისთვის — `[ზომა, შეცვლა, სვეტები]`.
 * `cardSize` — პოსტერების სია (სვეტები ბარათის ზომიდან).
 */
export function usePageSize(
  moduleKey: string,
  layout: RecordLayout,
  cardSize?: CardSize,
): readonly [number, (next: number) => void, number] {
  const { all } = useModules()
  const qc = useQueryClient()
  const columns = layoutColumns(layout, cardSize)
  const scope = `${moduleKey}:${layout}`
  const [local, setLocal] = useState<{ scope: string; size: number } | null>(null)
  const settings = all.find((m) => m.key === moduleKey)?.user_settings
  const saved = readPageSize(settings, layout, defaultPageSize(columns, layout))

  const change = useCallback(
    (next: number) => {
      setLocal({ scope, size: next })
      const merged = { ...readSaved(settings), [layout]: next }
      qc.setQueryData<ModuleInfo[]>(['modules'], (list) =>
        list?.map((m) => (m.key === moduleKey ? { ...m, user_settings: { ...m.user_settings, [SETTING]: merged } } : m)),
      )
      void updateModuleSettings(moduleKey, { [SETTING]: merged }).catch(() => {
        // შენახვის ჩავარდნა სიას არ აჩერებს — შემდეგ ჯერზე შენახული/ნაგულისხმევი იქნება
      })
    },
    [qc, moduleKey, layout, scope, settings],
  )

  return [local?.scope === scope ? local.size : saved, change, columns] as const
}

const PHOTO_KEY = 'photo-grid.page-size'

/** ფოტოების ბადის ზომა — ბრაუზერში, ყველა ფოტოს ბადეზე ერთი (გალერეა, ჩანაწერი, მსახიობი) */
export function usePhotoPageSize(): readonly [number, (next: number) => void] {
  const [size, setSize] = useState(() => {
    const raw = Number(safeGet(PHOTO_KEY))
    return Number.isInteger(raw) && raw >= 0 && raw <= PHOTO_PER_PAGE_MAX && safeGet(PHOTO_KEY) !== null
      ? raw
      : defaultPageSize(PHOTO_COLUMNS, 'photos')
  })

  const change = useCallback((next: number) => {
    setSize(next)
    safeSet(PHOTO_KEY, String(next))
  }, [])

  return [size, change] as const
}
