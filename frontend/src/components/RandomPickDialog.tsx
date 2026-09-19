import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dices, Loader2, PlayCircle } from 'lucide-react'
import { mediaApi, type MediaFilters } from '@/api/media'
import { mediaOf, type MediaType } from '@/lib/media'
import { useContentLang } from '@/lib/settings'
import { useStatuses } from '@/lib/statuses'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ModalShell } from '@/components/ui/modal-shell'
import { PosterImage } from '@/components/PosterImage'
import { useToast } from '@/components/ui/feedback'

/**
 * **„რა ვნახო დღეს" (FEAT-20).**
 *
 * ⚠️ **არჩევანი სერვერზე ხდება და არა ბრაუზერში.** ჩატვირთულია მხოლოდ
 * პრეფიქსი („მეტის ჩვენება"), ე.ი. ბადიდან აღებული „შემთხვევითი" ყოველთვის
 * პირველ სამოცში მოხვდებოდა — და სწორედ ის ფილმი, რომელიც დიდი ხანია
 * სიის ბოლოშია, არასდროს ამოვიდოდა.
 *
 * ⚠️ **ფილტრი იგივეა, რაც სიას აქვს**: კითხვა „ამ სიიდან რომელი"-ა.
 * სტატუსი ნაგულისხმევად `todo`-ს როლს ჭრის (სერვერზე), მაგრამ ცხადად
 * არჩეული სექცია მასზე მაღლა დგას.
 *
 * ⚠️ **„დავიწყო" სტატუსს `doing` **როლით** ეძებს და არა გასაღებით** (§6.4):
 * სტატუსი per-user ლექსიკონია, ე.ი. ჩემი „ვუყურებ" და შენი „მიმდინარე"
 * ერთი და იგივეა მხოლოდ როლის დონეზე. თუ ასეთი სტატუსი არ არსებობს,
 * ღილაკი **არ იხატება** — არა გამორთული, არამედ არარსებული.
 */
export function RandomPickDialog({
  type,
  filters,
  onClose,
}: {
  type: MediaType
  filters: MediaFilters
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  const { data: statuses = [] } = useStatuses(type)

  const [starting, setStarting] = useState(false)

  /* ⚠️ **`useQuery` + `refetch()` და არა `useEffect`**: პირველი არჩევანი
     გახსნისთანავე უნდა მოვიდეს, „სხვა" კი იმავე მოთხოვნის გამეორებაა —
     ეფექტს აქ დამოკიდებულებების ხელით დათრგუნვა დასჭირდებოდა.
     ⚠️ **`staleTime: 0` + `gcTime: 0`**: ქეშირებული „შემთხვევითი" ყოველ
     გახსნაზე ერთსა და იმავე ფილმს დააბრუნებდა. */
  const { data: record, isFetching, refetch } = useQuery({
    queryKey: ['random-pick', type, filters],
    queryFn: () => mediaApi(type).pickRandom(filters),
    staleTime: 0,
    gcTime: 0,
  })

  const busy = isFetching

  const doing = statuses.find((s) => s.role === 'doing')

  const start = async () => {
    if (!record || !doing) return
    setStarting(true)
    try {
      await mediaApi(type).setStatus(record.id, doing.key)
      toast({ title: t('pick.started'), variant: 'success' })
      onClose()
    } finally {
      setStarting(false)
    }
  }

  const title = (lang === 'ka' ? record?.title_ka : record?.title_en) || record?.title_en || record?.title_ka

  return (
    <ModalShell title={t('pick.title')} onClose={onClose}>
      {busy ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !record ? (
        /* ⚠️ ცარიელი ფილტრი შეცდომა არაა — მდგომარეობაა, და `EmptyState`
           სწორედ ამისთვის არსებობს (რა ცარიელია · რატომ · რა ვქნა). */
        <EmptyState
          icon={<Dices className="size-6" />}
          title={t('pick.emptyTitle')}
          hint={t('pick.emptyHint')}
          actions={
            <Button variant="outline" onClick={onClose}>
              {t('actions.close')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-4">
            <Link to={`${mediaOf(type).detailBase}/${record.id}`} onClick={onClose} className="shrink-0">
              <PosterImage src={record.poster} alt={title ?? ''} className="h-40 w-28 rounded-md" />
            </Link>

            <div className="min-w-0 flex-1">
              <Link
                to={`${mediaOf(type).detailBase}/${record.id}`}
                onClick={onClose}
                className="text-lg font-semibold tracking-tight hover:text-primary"
              >
                {title}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {[record.year, record.rating ? `★ ${record.rating}` : null].filter(Boolean).join(' · ')}
              </p>
              {record.genres.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {record.genres.map((g) => (lang === 'ka' ? g.name_ka || g.name_en : g.name_en)).join(' · ')}
                </p>
              )}
              {(lang === 'ka' ? record.description_ka : record.description_en) && (
                <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">
                  {lang === 'ka' ? record.description_ka : record.description_en}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => void refetch()} disabled={busy}>
              <Dices className="size-4" />
              {t('pick.again')}
            </Button>
            {doing && (
              <Button onClick={() => void start()} disabled={starting}>
                {starting ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                {t('pick.start')}
              </Button>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  )
}
