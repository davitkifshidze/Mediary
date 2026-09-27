import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckSquare, Loader2, Play, Search, Square } from 'lucide-react'
import {
  CAST_SYNC_FIELDS,
  fetchCastSyncPlan,
  type CastSyncField,
  type CastSyncFilters,
  type CastSyncScope,
} from '@/api/media'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import type { MediaType } from '@/lib/media'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumberPick } from '@/components/ui/number-pick'
import { RadioGroup } from '@/components/ui/radio-group'
import { ScopeRow } from '@/components/ui/scope-row'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **მსახიობების მონაცემები — სინქრონიზაციის მეორე ნაკადი** (Tasks §39).

   შენი სიტყვები: „მინდა მასობრივი მსახიობების ინფოს სინქრონიზაცია —
   პროფილი, სოციალები და რაც ხდება ახლა სათითაოდ"; „მსახიობების
   ბიოგრაფიების გლობალური სინქრონიზაცია სინქრონიზაციაში შეიტანე" (§20).

   ⚠️ **დომენის ბარათები ორივე ნაკადში ერთსა და იმავეს ნიშნავს** —
   „რომელ ბიბლიოთეკაში". ჩანაწერების ნაკადში ეს ამ ბიბლიოთეკის ჩანაწერებია,
   აქ — მათი მსახიობები (გალერეის ჩამოტვირთვის „ჩანაწერი · მსახიობები"
   ტაბების იგივე მოდელი). „მსახიობები" ამიტომ **ნაკადის** ბარათია და არა
   მეოთხე დომენი: დომენების რიგში ის „ფილმები + მსახიობები"-ად წაიკითხებოდა.

   ⚠️ **ველები გეგმის გასაღებში არ ზის** — ისინი „რომელ მსახიობებს"
   არ ცვლის, ე.ი. ჩამრთველზე ყოველი დაჭერა ცარიელ რექვესთს გაგზავნიდა.

   ⚠️ **`placeholderData` ერთ კონტექსტში** — §18-ის გაკვეთილი: გეგმის
   გასაღები მონიშნულ მსახიობებსაც შეიცავს, ე.ი. ყოველი ტიკი ახალი
   რექვესთია და მის გარეშე ამრჩევი ყოველ დაჭერაზე ქრებოდა და ბრუნდებოდა.
   ============================================================ */

/** „N დღეზე ადრე" — მზა ვარიანტები + „სხვა" */
const STALE_DAYS = [7, 30, 90, 180, 365]

export function CastSyncFlow({
  open,
  active,
  types,
  header,
  onClose,
}: {
  open: boolean
  active: boolean
  types: MediaType[]
  /** ნაკადის ბარათები + დომენები — ფანჯარა აწვდის, რომ ორ ნაკადს ერთი თავი ჰქონდეს */
  header?: ReactNode
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { enqueueCast, isBusy } = useQueue()
  const { date } = useDateFormat()

  const [scope, setScope] = useState<CastSyncScope>('never')
  const [days, setDays] = useState(30)
  const [ids, setIds] = useState<number[]>([])
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [fields, setFields] = useState<CastSyncField[]>([...CAST_SYNC_FIELDS])
  const [overwritePhoto, setOverwritePhoto] = useState(false)
  const [starting, setStarting] = useState(false)

  // ⚠️ ძებნა გეგმას ხელახლა ითვლის — ყოველ ასოზე რექვესთი არ უნდა წავიდეს
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(q.trim()), 350)
    return () => window.clearTimeout(id)
  }, [q])

  const filters: CastSyncFilters = useMemo(
    () => ({
      types,
      scope,
      days: scope === 'stale' ? days : undefined,
      ids: scope === 'ids' ? ids : undefined,
      q: scope === 'ids' && query ? query : undefined,
    }),
    [types, scope, days, ids, query],
  )

  const planQ = useQuery({
    queryKey: ['cast-sync-plan', filters],
    queryFn: () => fetchCastSyncPlan(filters),
    enabled: open && active && types.length > 0,
    placeholderData: keepPreviousData,
  })
  const plan = planQ.data

  const toggleField = (f: CastSyncField) =>
    setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))
  const toggleId = (id: number) =>
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const candidates = plan?.cast ?? []
  const pickable = candidates.filter((c) => c.has_tmdb)

  const eta = (seconds: number) =>
    seconds < 90 ? t('sync.etaSec', { count: seconds }) : t('sync.etaMin', { count: Math.round(seconds / 60) })

  const canRun =
    !!plan?.count && plan.tmdb && fields.length > 0 && types.length > 0 && !planQ.isFetching && !starting

  /**
   * **გაშვება** — იგივე გეგმა `start: true`-ით.
   *
   * ⚠️ რიგი **ამ პასუხიდან** ივსება და არა ეკრანზე მდგარი გეგმიდან:
   * სერვერი ჟურნალში ზუსტად იმ რიცხვს წერს, რაც რიგში ჩადგება (`/purge`-ის
   * „დათვლილი = გაშვებული" წესი).
   */
  const run = async () => {
    if (!canRun) return
    setStarting(true)

    try {
      const opts = { fields, overwrite_photo: overwritePhoto || undefined }
      const started = await fetchCastSyncPlan({ ...filters, ...opts, start: true })

      if (!started.items.length) {
        toast({ title: t('castSync.nothingToRun'), variant: 'info' })
        return
      }

      enqueueCast(started.items, opts)
      toast({ title: t('castSync.started', { count: started.items.length }), variant: 'success' })
      onClose()
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setStarting(false)
    }
  }

  /** ნულოვანი გეგმა თავის მიზეზს ამბობს — „ცარიელია" და „ყველას უკვე აქვს" სხვა ფაქტია */
  const zeroReason = !plan || plan.count > 0
    ? null
    : plan.pool_total === 0
      ? t('castSync.emptyLibrary')
      : scope === 'never'
        ? t('castSync.allUpdated')
        : scope === 'stale'
          ? t('castSync.nothingStale', { days })
          : scope === 'ids'
            ? t('castSync.pickActors')
            : null

  return (
    // ⚠️ `contents` — ორივე ნაკადი დამონტაჟებულია (მდგომარეობა არ იკარგება),
    // ხილული კი მხოლოდ აქტიურია; `contents` ფანჯრის flex-სვეტს არ არღვევს
    <div className={active ? 'contents' : 'hidden'}>
      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        {header}

        {/* ---------- რომელი მსახიობები (§39.1) ---------- */}
        <div>
          <Label className="mb-2 block">{t('castSync.scope')}</Label>
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as CastSyncScope)} className="gap-2">
            <ScopeRow
              value="never"
              active={scope}
              label={t('castSync.scopeNever')}
              hint={plan ? t('castSync.inLibrary', { count: plan.never_synced }) : undefined}
            />
            <ScopeRow value="stale" active={scope} label={t('castSync.scopeStale')} hint={t('castSync.scopeStaleHint')}>
              <div className="flex flex-wrap items-center gap-2">
                <NumberPick value={days} onChange={(n) => setDays(Math.max(1, n))} options={STALE_DAYS} min={1} max={3650} />
                <span className="text-sm text-muted-foreground">{t('castSync.daysAgo')}</span>
              </div>
            </ScopeRow>
            <ScopeRow
              value="all"
              active={scope}
              label={t('castSync.scopeAll')}
              hint={plan ? t('castSync.inLibrary', { count: plan.pool_total }) : undefined}
            />
            <ScopeRow value="ids" active={scope} label={t('castSync.scopeIds')}>
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!pickable.length}
                    onClick={() => setIds((cur) => [...new Set([...cur, ...pickable.map((c) => c.id)])])}
                  >
                    <CheckSquare className="size-3.5" />
                    {t('castSync.pickAll')}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={!ids.length} onClick={() => setIds([])}>
                    <Square className="size-3.5" />
                    {t('castSync.clear')}
                  </Button>
                  <span className="ml-auto self-center text-xs text-muted-foreground">
                    {t('castSync.picked', { count: ids.length })}
                  </span>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('castSync.search')}
                    className="pl-8"
                  />
                </div>

                {/* ⚠️ ფიქსირებული სიმაღლე — მონიშვნამ და ძებნამ ფანჯრის ზომა არ
                    უნდა შეცვალოს (გალერეის ჩამოტვირთვის §18.2-ის წესი) */}
                <div className="fb-scroll h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {candidates.map((member) => (
                    <label
                      key={member.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm',
                        !member.has_tmdb && 'opacity-50',
                      )}
                    >
                      <Checkbox
                        checked={ids.includes(member.id)}
                        disabled={!member.has_tmdb}
                        onCheckedChange={() => toggleId(member.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{member.name_ka || member.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {!member.has_tmdb
                          ? t('castSync.result.noTmdbId')
                          : member.details_synced_at
                            ? t('castSync.syncedOn', { date: date(member.details_synced_at) })
                            : t('castSync.neverSynced')}
                      </span>
                    </label>
                  ))}
                  {/* ⚠️ „ვერ მოიძებნა" მხოლოდ ცნობილ ცარიელ პასუხზე — `placeholderData`
                      სხვა ფარგლების (ცარიელ) სიას აჩვენებდა, სანამ ახალი მოვა */}
                  {!candidates.length && (
                    <p className="px-1.5 py-1 text-xs text-muted-foreground">
                      {plan && !planQ.isFetching ? t('castSync.none') : t('api.loading')}
                    </p>
                  )}
                </div>

                {plan?.cast_truncated && <p className="text-xs text-muted-foreground">{t('castSync.truncated')}</p>}
              </div>
            </ScopeRow>
          </RadioGroup>
        </div>

        {/* ---------- რა განახლდეს (§39.2) ---------- */}
        <div>
          <Label className="mb-2 block">{t('sync.what')}</Label>
          <div className="space-y-2.5 rounded-lg border border-border p-3">
            {CAST_SYNC_FIELDS.map((f) => (
              <div key={f}>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox checked={fields.includes(f)} onCheckedChange={() => toggleField(f)} />
                  <span>
                    <span className="font-medium">{t(`castSync.field.${f}`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`castSync.fieldHint.${f}`)}</span>
                  </span>
                </label>
                {f === 'photo' && fields.includes('photo') && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 pl-7 text-sm">
                    <Checkbox checked={overwritePhoto} onCheckedChange={() => setOverwritePhoto((v) => !v)} />
                    <span>
                      {t('castSync.overwritePhoto')}
                      <span className="block text-xs text-muted-foreground">{t('castSync.overwritePhotoHint')}</span>
                    </span>
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- შეჯამება + გაშვება ---------- */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0 text-sm">
          {/* ⚠️ დომენის გარეშე გეგმა არ ითვლება — `placeholderData` კი ძველ
              რიცხვს დატოვებდა; მიზეზს დომენის ბარათები თვითონ ამბობს */}
          {!types.length ? null : !fields.length ? (
            <span className="text-destructive">{t('sync.pickSomething')}</span>
          ) : plan && !plan.tmdb ? (
            <span className="text-destructive">{t('errors.tmdb_not_configured')}</span>
          ) : plan ? (
            <>
              <span className="font-medium">{t('castSync.affected', { count: plan.count })}</span>
              {plan.count > 0 && <span className="ml-1.5 text-muted-foreground">≈ {eta(plan.eta_seconds)}</span>}
              {plan.skipped_without_tmdb > 0 && (
                <span className="block text-xs text-muted-foreground">
                  {t('castSync.noTmdb', { count: plan.skipped_without_tmdb })}
                </span>
              )}
              {zeroReason && <span className="block text-xs text-muted-foreground">{zeroReason}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">{t('api.loading')}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('confirm.cancel')}
          </Button>
          <Button onClick={run} disabled={!canRun}>
            {planQ.isFetching || starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {isBusy ? t('sync.addToQueue') : t('sync.run')}
          </Button>
        </div>
      </div>
    </div>
  )
}
