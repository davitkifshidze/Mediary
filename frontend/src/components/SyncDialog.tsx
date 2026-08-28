import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, Play } from 'lucide-react'
import {
  fetchGenres,
  fetchSyncPlan,
  mediaApi,
  SYNC_FIELDS,
  type SyncField,
  type SyncPlanFilters,
} from '@/api/media'
import type { MediaType } from '@/lib/media'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GenreSelect } from '@/components/GenreSelect'
import { MovieMultiSelect } from '@/components/MovieMultiSelect'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   მასობრივი სინქრონის დიალოგი (Tasks J2/J4):
   სკოუპი → რა განახლდეს → რამდენ ჩანაწერს შეეხება → გაშვება რიგში.
   თვითონ ციკლს queue ატარებს (J3).
   ============================================================ */

const STATUSES = ['undecided', 'to_watch', 'watching', 'watched'] as const
type Scope = 'all' | 'status' | 'favorite' | 'genre' | 'specific'

export function SyncDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { enqueueSync, isBusy } = useQueue()

  // --- სკოუპი ---
  const [types, setTypes] = useState<MediaType[]>(['movie', 'series'])
  const [scope, setScope] = useState<Scope>('all')
  const [status, setStatus] = useState<string>('')
  const [genres, setGenres] = useState<string[]>([])
  const [ids, setIds] = useState<Record<MediaType, number[]>>({ movie: [], series: [] })

  // --- რა განახლდეს ---
  const [media, setMedia] = useState(true)
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [fields, setFields] = useState<SyncField[]>([])
  const [overwrite, setOverwrite] = useState(false)

  const genresQ = useQuery({ queryKey: ['genres'], queryFn: () => fetchGenres(), enabled: open })

  const filters: SyncPlanFilters = useMemo(
    () => ({
      types,
      status: scope === 'status' && status ? status : undefined,
      favorite: scope === 'favorite' ? true : undefined,
      genres: scope === 'genre' && genres.length ? genres : undefined,
      ids: scope === 'specific' ? ids : undefined,
      // მხოლოდ დაკარგული ფაილები რიგსაც ამცირებს, არა მხოლოდ სამუშაოს
      missing_media_only: media && onlyMissing && fields.length === 0 ? true : undefined,
    }),
    [types, scope, status, genres, ids, media, onlyMissing, fields.length],
  )

  const planQ = useQuery({
    queryKey: ['sync-plan', filters],
    queryFn: () => fetchSyncPlan(filters),
    enabled: open && types.length > 0,
  })

  // კონკრეტული ჩანაწერების ასარჩევად სრული სიები
  const moviesQ = useQuery({
    queryKey: ['genre-attach-pool', 'movie'],
    queryFn: () => mediaApi('movie').list(),
    enabled: open && scope === 'specific' && types.includes('movie'),
  })
  const seriesQ = useQuery({
    queryKey: ['genre-attach-pool', 'series'],
    queryFn: () => mediaApi('series').list(),
    enabled: open && scope === 'specific' && types.includes('series'),
  })

  const toggleType = (v: MediaType) =>
    setTypes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))
  const toggleField = (f: SyncField) =>
    setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))

  const plan = planQ.data
  const nothingSelected = !media && fields.length === 0
  const canRun = !!plan?.count && !nothingSelected && types.length > 0 && !planQ.isFetching

  const eta = (seconds: number) =>
    seconds < 90 ? t('sync.etaSec', { count: seconds }) : t('sync.etaMin', { count: Math.round(seconds / 60) })

  const run = () => {
    if (!plan?.items.length) return
    enqueueSync(plan.items, { media, only_missing: onlyMissing, overwrite, fields })
    toast({ title: t('sync.started', { count: plan.items.length }), variant: 'success' })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{t('sync.title')}</DialogTitle>

        <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {/* ---------- დომენი ---------- */}
          <div>
            <Label className="mb-2 block">{t('sync.domains')}</Label>
            <div className="flex flex-wrap gap-4">
              {(['movie', 'series'] as MediaType[]).map((d) => (
                <label key={d} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={types.includes(d)} onCheckedChange={() => toggleType(d)} />
                  {t(d === 'series' ? 'nav.series' : 'nav.movies')}
                </label>
              ))}
            </div>
          </div>

          {/* ---------- სკოუპი ---------- */}
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
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`status.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ScopeRow>
              <ScopeRow value="favorite" active={scope} label={t('sync.scopeFavorite')} />
              <ScopeRow value="genre" active={scope} label={t('sync.scopeGenre')}>
                <GenreSelect genres={genresQ.data ?? []} value={genres} onChange={setGenres} />
              </ScopeRow>
              <ScopeRow value="specific" active={scope} label={t('sync.scopeSpecific')}>
                <div className="space-y-2">
                  {types.includes('movie') && (
                    <MovieMultiSelect
                      movies={moviesQ.data ?? []}
                      value={ids.movie}
                      onChange={(v) => setIds((c) => ({ ...c, movie: v }))}
                      placeholder={moviesQ.isLoading ? t('api.loading') : t('nav.movies')}
                    />
                  )}
                  {types.includes('series') && (
                    <MovieMultiSelect
                      movies={seriesQ.data ?? []}
                      value={ids.series}
                      onChange={(v) => setIds((c) => ({ ...c, series: v }))}
                      placeholder={seriesQ.isLoading ? t('api.loading') : t('nav.series')}
                    />
                  )}
                </div>
              </ScopeRow>
            </RadioGroup>
          </div>

          {/* ---------- რა განახლდეს ---------- */}
          <div>
            <Label className="mb-2 block">{t('sync.what')}</Label>

            <div className="rounded-lg border border-border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={media} onCheckedChange={() => setMedia((m) => !m)} />
                {t('sync.media')}
              </label>
              {media && (
                <label className="mt-2 flex cursor-pointer items-start gap-2 pl-7 text-sm">
                  <Checkbox checked={onlyMissing} onCheckedChange={() => setOnlyMissing((v) => !v)} />
                  <span>
                    {t('sync.onlyMissing')}
                    <span className="block text-xs text-muted-foreground">{t('sync.onlyMissingHint')}</span>
                  </span>
                </label>
              )}
            </div>

            <div className="mt-2 rounded-lg border border-border p-3">
              <div className="mb-2 text-sm font-medium">{t('sync.fields')}</div>
              <div className="grid grid-cols-2 gap-y-2 sm:grid-cols-3">
                {SYNC_FIELDS.map((f) => (
                  <label key={f} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={fields.includes(f)} onCheckedChange={() => toggleField(f)} />
                    {t(`sync.field.${f}`)}
                  </label>
                ))}
              </div>

              {fields.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-2 text-sm font-medium">{t('sync.mode')}</div>
                  <RadioGroup
                    value={overwrite ? 'overwrite' : 'empty'}
                    onValueChange={(v) => setOverwrite(v === 'overwrite')}
                    className="gap-2"
                  >
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <RadioGroupItem value="empty" />
                      <span>
                        {t('sync.modeEmpty')}
                        <span className="block text-xs text-muted-foreground">{t('sync.modeEmptyHint')}</span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <RadioGroupItem value="overwrite" />
                      <span>
                        {t('sync.modeOverwrite')}
                        <span className="block text-xs text-destructive">{t('sync.modeOverwriteHint')}</span>
                      </span>
                    </label>
                  </RadioGroup>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---------- შეჯამება + გაშვება ---------- */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="min-w-0 text-sm">
            {planQ.isFetching ? (
              <span className="text-muted-foreground">{t('api.loading')}</span>
            ) : nothingSelected ? (
              <span className="text-destructive">{t('sync.pickSomething')}</span>
            ) : plan ? (
              <>
                <span className="font-medium">{t('sync.affected', { count: plan.count })}</span>
                {plan.count > 0 && (
                  <span className="ml-1.5 text-muted-foreground">≈ {eta(plan.eta_seconds)}</span>
                )}
                {plan.skipped_without_tmdb > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {t('sync.noTmdb', { count: plan.skipped_without_tmdb })}
                  </span>
                )}
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('confirm.cancel')}
            </Button>
            <Button onClick={run} disabled={!canRun}>
              {planQ.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {isBusy ? t('sync.addToQueue') : t('sync.run')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** radio + (არჩეულზე) დამატებითი კონტროლი */
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
      {/* select/multi-select <label>-ში ვერ ჯდება — მასზე დაჭერა radio-ს ააქტიურებდა */}
      <label className="flex cursor-pointer items-center gap-3">
        <RadioGroupItem value={value} />
        <span className="text-sm font-medium">{label}</span>
      </label>
      {selected && children && <div className="mt-2 pl-8">{children}</div>}
    </div>
  )
}
