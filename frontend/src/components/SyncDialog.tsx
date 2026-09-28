import { useMemo, useState, type ReactNode } from 'react'
import { useContentLang } from '@/lib/settings'
import { statusName, useMergedStatuses } from '@/lib/statuses'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, Play } from 'lucide-react'
import {
  fetchGenres,
  fetchSyncPlan,
  SYNC_FIELDS,
  type SyncField,
  type SyncPlanFilters,
} from '@/api/media'
import { emptyMediaIds, type MediaType } from '@/lib/media'
import { useModules } from '@/lib/modules'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CutTabs } from '@/components/ui/cut-tabs'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScopeRow } from '@/components/ui/scope-row'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CastSyncFlow } from '@/components/CastSyncFlow'
import { CredentialMissingNotice } from '@/components/CredentialMissingNotice'
import { GenreSelect } from '@/components/GenreSelect'
import { MediaDomainCards } from '@/components/MediaDomainCards'
import { MediaRecordPicker } from '@/components/MediaRecordPicker'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   მასობრივი სინქრონის დიალოგი (Tasks J2/J4):
   სკოუპი → რა განახლდეს → რამდენ ჩანაწერს შეეხება → გაშვება რიგში.
   თვითონ ციკლს queue ატარებს (J3).

   ⚠️ **ორი ნაკადი** (Tasks §20/§39): „ჩანაწერები" (TMDB-ის პოსტერი,
   აღწერა, ჟანრები…) და „მსახიობები" (ბიოგრაფია, ბმულები, ფოტო). ორივე
   ერთსა და იმავე დომენის ბარათებს იყენებს — „რომელ ბიბლიოთეკაში" — და
   ორივე დამონტაჟებული რჩება, ე.ი. გადართვა არჩევანს არ აქრობს.
   ============================================================ */

type Scope = 'all' | 'status' | 'favorite' | 'genre' | 'specific'
type Flow = 'records' | 'cast'

export function SyncDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()

  /* Tasks §4.2 — დომენები ჩართული მედია-მოდულებიდან მოდის. ხელით ჩაწერილი
     `['movie', 'series']` ანიმეს საერთოდ არ სთავაზობდა, გამორთულ მოდულს კი
     სთავაზობდა. `null` = „ყველა ხელმისაწვდომი“ — მოდულები შეიძლება დიალოგის
     შემდეგ ჩაიტვირთოს და საწყისი მნიშვნელობა ცარიელი არ უნდა გაიყინოს. */
  const { mediaModules } = useModules()
  const domains = useMemo(() => mediaModules.map((m) => m.type), [mediaModules])
  const [picked, setPicked] = useState<MediaType[] | null>(null)
  const types = useMemo(
    () => (picked ?? domains).filter((d) => domains.includes(d)),
    [picked, domains],
  )
  const toggleType = (v: MediaType) =>
    setPicked(types.includes(v) ? types.filter((x) => x !== v) : [...types, v])

  const [flow, setFlow] = useState<Flow>('records')
  const close = () => onOpenChange(false)

  /* ⚠️ **ნაკადი ბარათია და არა მეოთხე დომენი** (§20.1 → §39): დომენების რიგში
     „მსახიობები" „ფილმები + მსახიობები"-ად წაიკითხებოდა, ანუ „ორივე
     დაასინქრონე", მაშინ როცა ქვემოთ ფორმა მთლიანად იცვლება. */
  const header = (
    <>
      <CutTabs
        options={[
          { key: 'records', label: t('sync.flow.records'), hint: t('sync.flow.recordsHint') },
          { key: 'cast', label: t('sync.flow.cast'), hint: t('sync.flow.castHint') },
        ]}
        value={flow}
        onChange={(key) => setFlow(key as Flow)}
        layout="inline"
      />

      {/* ---------- დომენი ----------
          Tasks §20.1 — ბარათები მოდულის ფერითა და რიცხვით (ჩეკბოქსების
          ნაცვლად); ერთი დომენის შემთხვევაში არჩევანი არ არსებობს */}
      {domains.length > 1 && (
        <div>
          <Label className="mb-2 block">{flow === 'cast' ? t('castSync.domains') : t('sync.domains')}</Label>
          <MediaDomainCards value={types} onToggle={toggleType} enabled={open} />
        </div>
      )}
    </>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{t('sync.title')}</DialogTitle>

        {/* ⚠️ თავი მხოლოდ აქტიურ ნაკადს გადაეცემა — ორჯერ დახატული ბარათები
            ფარულშიც დეშბორდის რექვესთს დაუშვებდა */}
        <RecordsFlow
          open={open}
          active={flow === 'records'}
          types={types}
          header={flow === 'records' ? header : null}
          onClose={close}
        />
        <CastSyncFlow
          open={open}
          active={flow === 'cast'}
          types={types}
          header={flow === 'cast' ? header : null}
          onClose={close}
        />
      </DialogContent>
    </Dialog>
  )
}

/** ჩანაწერების ნაკადი — TMDB-ის მონაცემები ფილმზე/სერიალზე/ანიმეზე */
function RecordsFlow({
  open,
  active,
  types,
  header,
  onClose,
}: {
  open: boolean
  active: boolean
  types: MediaType[]
  header: ReactNode
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { enqueueSync, isBusy } = useQueue()

  const lang = useContentLang(i18n.language)
  // §6.4 — სტატუსების სია არჩეულ დომენებს მიჰყვება
  const statuses = useMergedStatuses(types)
  const [scope, setScope] = useState<Scope>('all')
  const [status, setStatus] = useState<string>('')
  const [genres, setGenres] = useState<string[]>([])
  const [ids, setIds] = useState<Record<MediaType, number[]>>(emptyMediaIds)

  // --- რა განახლდეს ---
  const [media, setMedia] = useState(true)
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [fields, setFields] = useState<SyncField[]>([])
  const [overwrite, setOverwrite] = useState(false)

  const genresQ = useQuery({ queryKey: ['genres'], queryFn: () => fetchGenres(), enabled: open && active })

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
    enabled: open && active && types.length > 0,
  })

  const toggleField = (f: SyncField) =>
    setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))

  const plan = planQ.data
  const nothingSelected = !media && fields.length === 0
  /* Tasks §30.6 — ⚠️ **გასაღები ანგარიშისაა**: მის გარეშე გაშვება 300 ერთნაირ
     ჩავარდნად იქცეოდა, ამიტომ გეგმა თვითონ ამბობს და ღილაკი ითიშება */
  const noKey = plan?.tmdb === false
  const canRun = !!plan?.count && !nothingSelected && types.length > 0 && !planQ.isFetching && !noKey

  const eta = (seconds: number) =>
    seconds < 90 ? t('sync.etaSec', { count: seconds }) : t('sync.etaMin', { count: Math.round(seconds / 60) })

  const run = () => {
    if (!plan?.items.length) return
    enqueueSync(plan.items, { media, only_missing: onlyMissing, overwrite, fields })
    toast({ title: t('sync.started', { count: plan.items.length }), variant: 'success' })
    onClose()
  }

  return (
    // ⚠️ `contents` — ფარულ ნაკადს მდგომარეობა რჩება, ხილული კი ფანჯრის
    // flex-სვეტში ჩვეულებრივად დგება (გადახვევადი შუა + მიმაგრებული ქვედა)
    <div className={active ? 'contents' : 'hidden'}>
      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        {header}

        {noKey && <CredentialMissingNotice provider="tmdb" />}

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
              <GenreSelect genres={genresQ.data ?? []} value={genres} onChange={setGenres} />
            </ScopeRow>
            <ScopeRow value="specific" active={scope} label={t('sync.scopeSpecific')}>
              <MediaRecordPicker
                types={types}
                ids={ids}
                enabled={open && active && scope === 'specific'}
                onChange={(type, next) => setIds((c) => ({ ...c, [type]: next }))}
              />
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
          <Button variant="outline" onClick={onClose}>
            {t('confirm.cancel')}
          </Button>
          <Button onClick={run} disabled={!canRun}>
            {planQ.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {isBusy ? t('sync.addToQueue') : t('sync.run')}
          </Button>
        </div>
      </div>
    </div>
  )
}
