import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { mediaApi } from '@/api/media'
import { MEDIA_NAV_KEY, type MediaType } from '@/lib/media'
import { MovieMultiSelect } from '@/components/MovieMultiSelect'

/* ============================================================
   **„კონკრეტული ჩანაწერები" — თითო მედია-დომენზე ერთი პიქერი.**

   ⚠️ **რატომ არსებობს.** სინქრონისა და თარგმანის დიალოგებში ეს ბლოკი
   ხელით ორჯერ ეწერა (`types.includes('movie') && …`, `types.includes('series') && …`),
   თითოეული თავისი `useQuery`-ით. მესამე დომენის (§7.1) დამატებისას ანიმე
   **ჩუმად ამოვარდებოდა**: სია საერთოდ არ დაიხატებოდა და user ვერ მიხვდებოდა,
   რატომ არ შეუძლია კონკრეტული ანიმეს არჩევა.

   ⚠️ **თითო დომენი ცალკე კომპონენტია და არა ციკლი ჰუკებში** — React-ის ჰუკები
   ციკლში ვერ იწერება, ე.ი. `types.map()` სწორედ კომპონენტებს უნდა ხატავდეს.
   ============================================================ */

export function MediaRecordPicker({
  types,
  ids,
  onChange,
  enabled,
}: {
  /** რომელი დომენებია მონიშნული სკოუპში */
  types: MediaType[]
  ids: Record<MediaType, number[]>
  onChange: (type: MediaType, next: number[]) => void
  /** სია მხოლოდ მაშინ იტვირთება, როცა ეს სკოუპი მართლა არჩეულია */
  enabled: boolean
}) {
  return (
    <div className="space-y-2">
      {types.map((type) => (
        <OneDomain
          key={type}
          type={type}
          value={ids[type] ?? []}
          onChange={(next) => onChange(type, next)}
          enabled={enabled}
        />
      ))}
    </div>
  )
}

function OneDomain({
  type,
  value,
  onChange,
  enabled,
}: {
  type: MediaType
  value: number[]
  onChange: (next: number[]) => void
  enabled: boolean
}) {
  const { t } = useTranslation()

  /* ⚠️ queryKey **`genre-attach-pool`-ია** და არა ახალი: ჟანრების მიბმის
     პიქერი ზუსტად იმავე სიას კითხულობს, ე.ი. ორივე ერთ ქეშს იზიარებს. */
  const q = useQuery({
    queryKey: ['genre-attach-pool', type],
    queryFn: () => mediaApi(type).list(),
    enabled,
  })

  return (
    <MovieMultiSelect
      movies={q.data ?? []}
      value={value}
      onChange={onChange}
      placeholder={q.isLoading ? t('api.loading') : t(MEDIA_NAV_KEY[type])}
    />
  )
}
