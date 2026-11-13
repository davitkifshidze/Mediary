import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BookUser, ChartColumn, Drama, FileText, History, Languages, SpellCheck, Tags, Type } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { fetchSyncKindRuns } from '@/api/syncRuns'
import { fetchTranslationParts, TRANSLATION_PARTS, type TranslationPart } from '@/api/translations'
import { MEDIA_NAV_KEY, type MediaType } from '@/lib/media'
import { TranslateDialog } from '@/components/TranslateDialog'
import { LastRun, UnfinishedRun } from '@/components/SyncRunBits'
import { Badge, CountBadge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { TaskCard } from '@/components/ui/task-card'

/* ============================================================
   **თარგმანის ბარათები** — ინსტრუმენტების „თარგმანი" (`/translations`) და მოდულის
   „თარგმანი" (`/movies/translations`…) ერთსა და იმავე ბარათებს ხატავს; მოდულის გვერდზე
   (`type`) ყველაფერი ამ მოდულზეა დავიწროებული.

   თარგმანი **ნაწილებად იშლება** — თითო ნაწილი ბარათია თავისი რიცხვითა (რამდენია
   სათარგმნი) და ღილაკით: სათაური ქართულად · სათაური ინგლისურად · აღწერა ქართულად ·
   აღწერა ინგლისურად · ჟანრები · გადასამოწმებელი აღწერები · მსახიობების ქართული სახელები ·
   მსახიობების ქართული ბიოგრაფიები. ღილაკი გაშვების ფანჯარას ამ ნაწილით ხსნის — ერთი
   ნაწილის გაშვება სხვას არ ეხება; „ყველაფერი" ერთი ღილაკია ყველა ნაწილზე.

   ⚠️ **„ყველაფერში" გადამოწმება არ შედის**: ის ერთადერთი ნაწილია, რომელიც არსებულ ტექსტს
   წერს — მას მხოლოდ თავისი ბარათი ხსნის.
   ⚠️ საერთო გვერდზე ჩანაწერის ნაწილს მოდულების ჩაშლაც აქვს (ანიმე ცალკე); ჟანრები
   გლობალური ლექსიკონია, მსახიობები კი ამ ბიბლიოთეკის (ან ამ მოდულის) მსახიობებია.
   ⚠️ გაწყვეტილ თარგმანს (ლიმიტი ამოიწურა, რიგი გაჩერდა) გვერდი ბარათების ზემოთ თვითონ
   სთავაზობს გასაგრძელებლად; „შედეგები" ისტორიას თარგმანზე გაფილტრულს ხსნის.
   ============================================================ */

const PART_LOOK: Record<TranslationPart, { icon: LucideIcon; color: string }> = {
  title_ka: { icon: Type, color: 'var(--tool-translations)' },
  title_en: { icon: Type, color: 'var(--tool-translations)' },
  description_ka: { icon: FileText, color: 'var(--tool-sync)' },
  description_en: { icon: FileText, color: 'var(--tool-sync)' },
  review: { icon: SpellCheck, color: 'var(--tool-roles)' },
  genres: { icon: Tags, color: 'var(--tool-genres)' },
  cast_names: { icon: Drama, color: 'var(--tool-actors)' },
  cast_bios: { icon: BookUser, color: 'var(--tool-people)' },
}

/** „ყველაფერი" — ყველა ნაწილი გადამოწმების გარდა (ის არსებულ ტექსტს წერს) */
const EVERYTHING = TRANSLATION_PARTS.filter((part) => part !== 'review')

/** რამდენ ხანში ერთხელ იკითხება სერვერზე მიმდინარე გაშვება */
const POLL_MS = 3000

export function TranslationCards({ type }: { type?: MediaType }) {
  const { t } = useTranslation()
  /** რომელი ნაწილებით არის ფანჯარა ღია */
  const [dialog, setDialog] = useState<TranslationPart[] | null>(null)

  const partsQ = useQuery({
    queryKey: ['translation-parts', type ?? 'all'],
    queryFn: () => fetchTranslationParts(type),
  })
  const runsQ = useQuery({
    queryKey: ['sync-kind-runs', 'translate', type ?? 'all'],
    queryFn: () => fetchSyncKindRuns('translate', type),
    // სანამ სერვერზე რამე მიდის — პროგრესი თავისით ახლდება
    refetchInterval: (query) => (query.state.data?.unfinished.some((run) => run.state === 'running') ? POLL_MS : false),
  })

  const parts = partsQ.data?.parts
  const runs = runsQ.data
  const total = parts ? EVERYTHING.reduce((sum, part) => sum + parts[part].count, 0) : 0

  if (partsQ.isLoading) return null

  return (
    <>
      {(runs?.unfinished.length ?? 0) > 0 && (
        <ul className="mb-3 space-y-2" data-testid="sync-unfinished">
          {runs?.unfinished.map((run) => <UnfinishedRun key={run.key} run={run} />)}
        </ul>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={total === 0} onClick={() => setDialog(EVERYTHING)} data-testid="translate-all">
          <Languages className="size-4" />
          {t('translate.runAll')}
          <CountBadge count={total} />
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2" data-testid="translation-cards">
        {TRANSLATION_PARTS.map((part) => {
          const { icon, color } = PART_LOOK[part]
          const count = parts?.[part].count
          const byType = parts?.[part].by_type

          return (
            <TaskCard
              key={part}
              color={color}
              icon={icon}
              title={t(`translate.part.${part}.title`)}
              info={t(`translate.part.${part}.info`)}
              text={t(`translate.part.${part}.text`)}
              count={count}
              actions={
                <Button size="sm" variant="outline" disabled={!count} onClick={() => setDialog([part])}>
                  <Languages className="size-4" />
                  {t('translate.open')}
                </Button>
              }
              footer={
                // მოდულების ჩაშლა — მხოლოდ საერთო გვერდზე, სადაც ერთზე მეტი მოდულია
                byType && Object.keys(byType).length > 1 ? (
                  <span className="flex flex-wrap justify-end gap-1.5" data-testid="part-by-type">
                    {(Object.entries(byType) as [MediaType, number][]).map(([module, n]) => (
                      <Badge key={module} className={n === 0 ? 'bg-muted text-muted-foreground' : 'bg-secondary'} data-module={module}>
                        {t(MEDIA_NAV_KEY[module])}
                        <span className="tabular-nums">{n}</span>
                      </Badge>
                    ))}
                  </span>
                ) : undefined
              }
              data-testid={`part-${part}`}
            />
          )
        })}

        <TaskCard
          color="var(--tool-stats)"
          icon={ChartColumn}
          title={t('syncCards.resultsTitle')}
          text={t('translate.resultsText')}
          count={runs?.runs}
          countLabel={t('syncCards.resultsCount')}
          actions={
            // ისტორია სახეობით „თარგმანი" გაფილტრული
            <Link to="/sync/results?kind=translate" className={buttonVariants({ variant: 'outline', size: 'sm' })} data-testid="translate-results-link">
              <History className="size-4" />
              {t('syncResults.open')}
            </Link>
          }
          footer={<LastRun run={runs?.latest} />}
          data-testid="results-block"
        />
      </div>

      {/* ფანჯარა ყოველ გახსნაზე თავისი ნაწილებით იწყება; მოდულის გვერდზე — ამ მოდულზე */}
      {dialog && <TranslateDialog key={dialog.join(',')} open onOpenChange={(open) => !open && setDialog(null)} only={type} parts={dialog} />}
    </>
  )
}
