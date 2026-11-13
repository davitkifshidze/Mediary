import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateModuleSettings, type ModuleInfo } from '@/api/account'
import { EMPTY_SELECTION, type SuggestSelection, type SuggestSource } from '@/api/suggestions'
import type { Status } from '@/api/types'
import type { MediaType } from '@/lib/media'
import { useModules } from '@/lib/modules'

/* ============================================================
   „შემოთავაზებების" საფუძვლის არჩევანი — რაზე დაყრდნობით მინდა შემოთავაზება.

   ⚠️ **არჩევანი მოდულზე ინახება** (`module_user.settings.suggest`) და არა
   ბრაუზერში — ყველა მოწყობილობაზე ერთნაირია; შენახვა ჩუმია (`useModuleSetting`-ის
   წესი: ჯერ `['modules']`-ის ქეში, მერე სერვერი, რომელიც ბლობს ერწყმის).

   ⚠️ სანამ არაფერი შენახულა, საფუძველი **ნანახი სათაურები და რჩეულებია**
   (`defaultSelection`) — ცარიელი გვერდი პირველ გახსნაზე არაფერს იტყოდა.
   ============================================================ */

const SUGGEST_SETTING = 'suggest'

/** წყაროს სახელი „რატომ"-ში და წყაროების შენიშვნებში — საკუთარი სახელია, არ ითარგმნება */
export const SOURCE_NAMES: Record<SuggestSource | 'gemini', string> = {
  tmdb: 'TMDB',
  trakt: 'Trakt',
  anilist: 'AniList',
  gemini: 'Gemini',
}

/** ⚠️ ბლობი ნებისმიერი იყოს — უცნობი/დაზიანებული ველი ცარიელს ნიშნავს; საერთოდ არაფერი — `null` */
export function readSelection(settings: Record<string, unknown> | undefined): SuggestSelection | null {
  const raw = settings?.[SUGGEST_SETTING]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const blob = raw as Record<string, unknown>
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [])
  const text = (value: unknown) => (typeof value === 'string' ? value : '')

  return {
    statuses: strings(blob.statuses),
    favorite: blob.favorite === true,
    ids: Array.isArray(blob.ids) ? blob.ids.filter((x): x is number => Number.isInteger(x) && (x as number) > 0) : [],
    genre: strings(blob.genre),
    yearMin: text(blob.yearMin),
    yearMax: text(blob.yearMax),
    myRatingMin: text(blob.myRatingMin),
    myRatingMax: text(blob.myRatingMax),
    ratingMin: text(blob.ratingMin),
    ratingMax: text(blob.ratingMax),
  }
}

/** ნაგულისხმევი საფუძველი — რაც უკვე ვნახე (როლით და არა სახელით) და რაც რჩეულებშია */
export function defaultSelection(statuses: readonly Status[]): SuggestSelection {
  return { ...EMPTY_SELECTION, statuses: statuses.filter((s) => s.role === 'done').map((s) => s.key), favorite: true }
}

/** რამდენი დავიწროებაა ჩართული — ღილაკის რიცხვი */
export function narrowingCount(selection: SuggestSelection): number {
  const range = (from: string, to: string) => (from.trim() !== '' || to.trim() !== '' ? 1 : 0)

  return (
    (selection.genre.length ? 1 : 0) +
    range(selection.yearMin, selection.yearMax) +
    range(selection.myRatingMin, selection.myRatingMax) +
    range(selection.ratingMin, selection.ratingMax)
  )
}

/** შენახული არჩევანი (`null` — ჯერ არაფერი შენახულა) და მისი შეცვლა */
export function useSuggestSelection(type: MediaType): readonly [SuggestSelection | null, (next: SuggestSelection) => void] {
  const { all } = useModules()
  const qc = useQueryClient()
  const [local, setLocal] = useState<{ type: MediaType; value: SuggestSelection } | null>(null)
  const saved = readSelection(all.find((m) => m.key === type)?.user_settings)

  const change = useCallback(
    (next: SuggestSelection) => {
      setLocal({ type, value: next })
      qc.setQueryData<ModuleInfo[]>(['modules'], (list) =>
        list?.map((m) => (m.key === type ? { ...m, user_settings: { ...m.user_settings, [SUGGEST_SETTING]: next } } : m)),
      )
      void updateModuleSettings(type, { [SUGGEST_SETTING]: next }).catch(() => {
        // შენახვის ჩავარდნა გვერდს არ აჩერებს — შემდეგ ჯერზე შენახული/ნაგულისხმევი იქნება
      })
    },
    [qc, type],
  )

  return [local?.type === type ? local.value : saved, change] as const
}
