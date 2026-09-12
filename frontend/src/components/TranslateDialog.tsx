import { useMemo, useState, type ReactNode } from 'react'
import { useContentLang } from '@/lib/settings'
import { statusName, useMergedStatuses } from '@/lib/statuses'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Languages, Loader2 } from 'lucide-react'
import { fetchGenres } from '@/api/media'
import {
  fetchTranslationPlan,
  fetchTranslationSummary,
  type TranslationPlanFilters,
} from '@/api/translations'
import { useModules } from '@/lib/modules'
import { MEDIA_NAV_KEY, emptyMediaIds, type MediaType } from '@/lib/media'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GenreSelect } from '@/components/GenreSelect'
import { MediaRecordPicker } from '@/components/MediaRecordPicker'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   თარგმანების დიალოგი (Tasks 7):
   სკოუპი → რამდენ ჩანაწერს შეეხება → გაშვება რიგში.

   „რა ითარგმნოს" არჩევანი განზრახ **არ არის**: ვსებავთ მხოლოდ იმას, რაც აკლია,
   და არსებულ ტექსტს არასდროს ვცვლით — ე.ი. არჩევის საგანი არაფერია.
   ციკლს queue ატარებს, როგორც სინქრონსა და გალერეაზე.
   ============================================================ */

type Scope = 'all' | 'status' | 'favorite' | 'genre' | 'specific'

export function TranslateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { enqueueTranslate, isBusy } = useQueue()
  const { mediaModules } = useModules()

  const available = useMemo(() => mediaModules.map((m) => m.type), [mediaModules])

  const [types, setTypes] = useState<MediaType[]>(available)
  const lang = useContentLang(i18n.language)
  // §6.4 — სტატუსების სია არჩეულ დომენებს მიჰყვება
  const statuses = useMergedStatuses(types)
  const [scope, setScope] = useState<Scope>('all')
  const [status, setStatus] = useState<string>('')
  const [genreSlugs, setGenreSlugs] = useState<string[]>([])
  const [ids, setIds] = useState<Record<MediaType, number[]>>(emptyMediaIds)
  const [withGenres, setWithGenres] = useState(true)

  const summaryQ = useQuery({
    queryKey: ['translations', 'summary'],
    queryFn: fetchTranslationSummary,
    enabled: open,
  })
  const genresQ = useQuery({ queryKey: ['genres'], queryFn: () => fetchGenres(), enabled: open })

  const filters: TranslationPlanFilters = useMemo(
    () => ({
      types,
      status: scope === 'status' && status ? status : undefined,
      favorite: scope === 'favorite' ? true : undefined,
      genres: scope === 'genre' && genreSlugs.length ? genreSlugs : undefined,
      ids: scope === 'specific' ? ids : undefined,
      include_genres: withGenres,
    }),
    [types, scope, status, genreSlugs, ids, withGenres],
  )

  const planQ = useQuery({
    queryKey: ['translations', 'plan', filters],
    queryFn: () => fetchTranslationPlan(filters),
    enabled: open,
  })


  const toggleType = (v: MediaType) =>
    setTypes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))

  const plan = planQ.data
  const genresInRun = withGenres && (plan?.genres_pending ?? 0) > 0
  const totalUnits = (plan?.count ?? 0) + (genresInRun ? 1 : 0)
  const canRun = totalUnits > 0 && !planQ.isFetching

  const eta = (seconds: number) =>
    seconds < 90 ? t('sync.etaSec', { count: seconds }) : t('sync.etaMin', { count: Math.round(seconds / 60) })

  const run = () => {
    if (!plan) return
    enqueueTranslate(plan.items, genresInRun)
    toast({ title: t('translate.started', { count: totalUnits }), variant: 'success' })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{t('translate.title')}</DialogTitle>

        <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {/* ---------- რითი ითარგმნება ---------- */}
          <p className="text-sm text-muted-foreground">{t('translate.howItWorks')}</p>

          {/* გასაღები არ არის — ვამბობთ პირდაპირ, რომ მხოლოდ TMDB-ის ტექსტი მოვა */}
          {summaryQ.data && !summaryQ.data.translator_configured && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              {t('translate.noKey')}
            </p>
          )}

          {/* ---------- დომენი ---------- */}
          {available.length > 0 && (
            <div>
              <Label className="mb-2 block">{t('sync.domains')}</Label>
              <div className="flex flex-wrap gap-4">
                {available.map((d) => (
                  <label key={d} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={types.includes(d)} onCheckedChange={() => toggleType(d)} />
                    {t(MEDIA_NAV_KEY[d])}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ---------- სკოუპი ---------- */}
          {types.length > 0 && (
            <div>
              <Label className="mb-2 block">{t('sync.scope')}</Label>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="gap-2">
                <ScopeRow value="all" active={scope} label={t('sync.scopeAll')} />
                <ScopeRow value="status" active={scope} label={t('sync.scopeStatus')}>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('sync.statusPick')} />
                    </SelectTrigger>
                    <SelectContent>
                      {/* §6.4 — სია არჩეული დომენების ლექსიკონების გაერთიანებაა */}
                      {statuses.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {statusName(s, lang)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ScopeRow>
                <ScopeRow value="favorite" active={scope} label={t('sync.scopeFavorite')} />
                <ScopeRow value="genre" active={scope} label={t('sync.scopeGenre')}>
                  <GenreSelect genres={genresQ.data ?? []} value={genreSlugs} onChange={setGenreSlugs} />
                </ScopeRow>
                <ScopeRow value="specific" active={scope} label={t('sync.scopeSpecific')}>
                  <MediaRecordPicker
                    types={types}
                    ids={ids}
                    enabled={open && scope === 'specific'}
                    onChange={(type, next) => setIds((c) => ({ ...c, [type]: next }))}
                  />
                </ScopeRow>
              </RadioGroup>
            </div>
          )}

          {/* ---------- ჟანრების ლექსიკონი ---------- */}
          <div className="rounded-lg border border-border p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox checked={withGenres} onCheckedChange={() => setWithGenres((v) => !v)} />
              <span>
                <span className="font-medium">{t('translate.withGenres')}</span>
                <span className="block text-xs text-muted-foreground">
                  {plan
                    ? t('translate.genresPending', { count: plan.genres_pending })
                    : t('translate.withGenresHint')}
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* ---------- შეჯამება + გაშვება ---------- */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="min-w-0 text-sm">
            {planQ.isFetching ? (
              <span className="text-muted-foreground">{t('api.loading')}</span>
            ) : plan ? (
              <>
                <span className="font-medium">{t('sync.affected', { count: plan.count })}</span>
                {totalUnits > 0 && (
                  <span className="ml-1.5 text-muted-foreground">≈ {eta(plan.eta_seconds)}</span>
                )}
                {totalUnits === 0 && (
                  <span className="block text-xs text-muted-foreground">{t('translate.nothingToDo')}</span>
                )}
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('confirm.cancel')}
            </Button>
            <Button onClick={run} disabled={!canRun}>
              {planQ.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Languages className="size-4" />}
              {isBusy ? t('sync.addToQueue') : t('translate.run')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** radio + (არჩეულზე) დამატებითი კონტროლი — `SyncDialog`-ის ანალოგი */
function ScopeRow({
  value,
  active,
  label,
  children,
}: {
  value: Scope
  active: Scope
  label: string
  children?: ReactNode
}) {
  const selected = active === value
  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        selected ? 'border-primary bg-secondary/50' : 'border-border',
      )}
    >
      <label className="flex cursor-pointer items-center gap-3">
        <RadioGroupItem value={value} />
        <span className="text-sm font-medium">{label}</span>
      </label>
      {selected && children && <div className="mt-2 pl-8">{children}</div>}
    </div>
  )
}
