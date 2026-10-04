import { useTranslation } from 'react-i18next'
import { Images } from 'lucide-react'
import type { PublicGalleryGroup } from '@/api/publicProfile'
import type { StackPreview } from '@/components/ui/photo-stack'
import { useContentLang } from '@/lib/settings'
import { groupSubtitle, groupTitle } from '@/components/public-gallery/groupTitle'
import { EmptyState } from '@/components/ui/empty-state'
import { PhotoStack } from '@/components/ui/photo-stack'
import { Pagination } from '@/components/ui/pagination'
import { LIST_PAGE_SIZE, useClientPages } from '@/lib/paged'

/* ============================================================
   **საჯარო ჯგუფების ბადე — დასტები** (Tasks §32.2).

   ჩანაწერი, მსახიობი და ალბომი ერთნაირად იხატება: `PhotoStack` — ის
   ბარათი, რასაც მფლობელი საკუთარ გალერეაში ხედავს. სტრუქტურა სწორედ ამით
   ემთხვევა „როგორც რეალურადაა".

   ⚠️ **მოქმედებები აქ არ არის** — არც ჩამოტვირთვა, არც ვებძებნა, არც
   წაშლა: სხვისი პროფილია. დასტაზე დაჭერა მხოლოდ ჯგუფს ხსნის.

   ⚠️ **ჩაკეტილი ალბომი ბუნდოვანი ზედაპირია** (`locked`): სერვერი მას ესკიზს
   არ უგზავნის, ე.ი. ბლარის ქვეშ არაფერია — devtools-ში მოხსნაც ვერაფერს
   გამოაჩენს.

   ⚠️ **ჯგუფები გვერდებად იხატება** (Tasks §46 — 10 გვერდზე, ნომრები + „მეტის
   ჩვენება"): ხუთასფილმიან საჯარო პროფილზე ხუთასი დასტა ერთბაშად DOM-ს
   დაამძიმებდა. სია სერვერიდან სრულად მოდის, ე.ი. გვერდი ახალ მოთხოვნას არ აგზავნის.
   ============================================================ */

export function PublicGroupGrid({
  groups,
  previews,
  loading,
  aspect = 'wide',
  onOpen,
  emptyText,
}: {
  groups: PublicGalleryGroup[]
  previews: Record<string, StackPreview[]>
  loading?: boolean
  aspect?: 'portrait' | 'wide'
  onOpen: (group: PublicGalleryGroup) => void
  emptyText: string
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const pager = useClientPages(groups, LIST_PAGE_SIZE)

  /* ⚠️ ჩონჩხი ლოკალურია და არა მფლობელის `GalleryStackSkeleton`: ის
     `GalleryPhotoGrid`-შია, რომელიც წაშლის მუტაციას, გადატანის ფანჯარას და
     ალბომების ამრჩევს იმპორტავს — საჯარო გვერდის ჩანკს ეს არაფერში სჭირდება. */
  if (loading) {
    return (
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="rounded-2xl border border-border bg-card p-4">
            <div className="aspect-[16/10] animate-pulse rounded-xl bg-muted/60" />
            <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-muted/60" />
          </li>
        ))}
      </ul>
    )
  }

  if (!groups.length) {
    return <EmptyState icon={<Images className="size-6" />} title={emptyText} />
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {pager.shown.map((group) => {
          const key = `${group.kind}:${group.id}`
          const locked = !!group.locked && !group.unlocked

          return (
            <li key={key}>
              <PhotoStack
                title={groupTitle(group, lang)}
                subtitle={groupSubtitle(group, lang)}
                label={t('gallery.photos', { count: group.photos })}
                count={group.photos}
                images={previews[key] ?? []}
                aspect={aspect}
                locked={locked}
                badge={group.locked ? t(locked ? 'gallery.albumLocked' : 'gallery.albumOpen') : undefined}
                onClick={() => onOpen(group)}
              />
            </li>
          )
        })}
      </ul>

      <Pagination {...pager.pagination} />
    </>
  )
}
