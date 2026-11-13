import { useMemo, useState } from 'react'
import { useContentLang } from '@/lib/settings'
import { statusName, useMergedStatuses } from '@/lib/statuses'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Languages, Loader2, Sparkles, X } from 'lucide-react'
import { fetchGenres } from '@/api/media'
import {
  fetchTranslationParts,
  fetchTranslationPlan,
  TRANSLATION_FIELDS,
  TRANSLATION_PARTS,
  TRANSLATION_SOURCES,
  type TranslationField,
  type TranslationPart,
  type TranslationPlanFilters,
  type TranslationSource,
} from '@/api/translations'
import { useModules } from '@/lib/modules'
import { emptyMediaIds, type MediaType } from '@/lib/media'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { CountBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { RadioGroup } from '@/components/ui/radio-group'
import { ScopeRow } from '@/components/ui/scope-row'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CredentialMissingNotice } from '@/components/CredentialMissingNotice'
import { GenreSelect } from '@/components/GenreSelect'
import { MediaDomainCards } from '@/components/MediaDomainCards'
import { MediaRecordPicker } from '@/components/MediaRecordPicker'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   თარგმანების დიალოგი:
   რითი → რა ნაწილები → რაზე → რამდენს შეეხება → გაშვება რიგში.

   **რა ითარგმნოს, ნაწილებად ირჩევა** (`TRANSLATION_PARTS`): სათაური და აღწერა ორივე
   მიმართულებით, ჟანრები, გადასამოწმებელი აღწერები, მსახიობების ქართული სახელები და
   ბიოგრაფიები. ფანჯარას თარგმანის გვერდის ბარათი ხსნის — თავისი ნაწილით მონიშნული
   („ყველაფერი" — ყველა ნაწილით); ერთი ნაწილის გაშვება სხვას არ ეხება. ციკლს queue
   ატარებს, როგორც სინქრონსა და გალერეაზე.

   ⚠️ **„გადასამოწმებელი აღწერები" ერთადერთი ნაწილია, რომელიც არსებულ ტექსტს წერს**:
   TMDB-ის ქართულ აღწერას Gemini-ს გადასამოწმებლად აძლევს. ამიტომ „ყველაფერში" ის
   მონიშნული არ არის — მას მხოლოდ თავისი ბარათი ან ცხადი მონიშვნა რთავს.

   ⚠️ **„რითი ითარგმნოს" არჩევანია (შენი მითითება, 2026-09-14).** წყაროები ცხადად
   ირჩევა და **არჩევანი რიგსაც მიჰყვება** (`QItem.sources`), თორემ მეორე ჩანაწერიდან
   ნაგულისხმევზე დაბრუნდებოდა.

   ⚠️ **Gemini-ს ხარჯი გაშვებამდე ჩანს**: მაქსიმუმ რამდენი მოთხოვნაა და რამდენ დღეს
   გაწვდება დღიური ლიმიტი. ლიმიტის ამოწურვაზე გაშვება ჩერდება და შედეგების გვერდიდან
   დარჩენილზე გრძელდება.
   ============================================================ */

type Scope = 'all' | 'status' | 'favorite' | 'genre' | 'specific'

/** ნაწილები, რომლებიც ჩანაწერებს ეხება — მათზე მოქმედებს მოდული, სკოუპი და „დამუშავებულების დამალვა" */
const RECORD_PARTS: readonly TranslationPart[] = [...TRANSLATION_FIELDS, 'review']

export function TranslateDialog({
  open,
  onOpenChange,
  only,
  parts: initial,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** მხოლოდ ეს მოდული — მოდულის საკუთარი „თარგმანის" გვერდიდან გახსნილი ფანჯარა */
  only?: MediaType
  /** რომელი ნაწილებით გაიხსნას — თარგმანის გვერდის ბარათი თავის ნაწილს ხსნის */
  parts: TranslationPart[]
}) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { enqueueTranslate, isBusy } = useQueue()
  const { mediaModules } = useModules()

  const available = useMemo(
    () => mediaModules.map((m) => m.type).filter((type) => !only || type === only),
    [mediaModules, only],
  )

  const [chosen, setChosen] = useState<MediaType[] | null>(null)
  const types = useMemo(() => (chosen ?? available).filter((type) => available.includes(type)), [chosen, available])
  const lang = useContentLang(i18n.language)
  // სტატუსების სია არჩეულ დომენებს მიჰყვება
  const statuses = useMergedStatuses(types)
  const [picked, setPicked] = useState<TranslationPart[]>(initial)
  const [scope, setScope] = useState<Scope>('all')
  const [status, setStatus] = useState<string>('')
  const [genreSlugs, setGenreSlugs] = useState<string[]>([])
  const [ids, setIds] = useState<Record<MediaType, number[]>>(emptyMediaIds)
  const [sources, setSources] = useState<TranslationSource[]>([...TRANSLATION_SOURCES])
  // ბოლო გაშვებაზე ნათარგმნი აღარ ჩანს (ნაგულისხმევად ჩართული)
  const [hideProcessed, setHideProcessed] = useState(true)

  // ნაწილების რიცხვები — იგივე, რაც გვერდის ბარათებზეა
  const partsQ = useQuery({
    queryKey: ['translation-parts', only ?? 'all'],
    queryFn: () => fetchTranslationParts(only),
    enabled: open,
  })
  const genresQ = useQuery({ queryKey: ['genres'], queryFn: () => fetchGenres(), enabled: open })

  const review = picked.includes('review')
  const anyRecordPart = picked.some((part) => RECORD_PARTS.includes(part))

  const filters: TranslationPlanFilters = useMemo(
    () => ({
      types,
      status: scope === 'status' && status ? status : undefined,
      favorite: scope === 'favorite' ? true : undefined,
      genres: scope === 'genre' && genreSlugs.length ? genreSlugs : undefined,
      ids: scope === 'specific' ? ids : undefined,
      parts: picked,
      hide_processed: hideProcessed,
    }),
    [types, scope, status, genreSlugs, ids, picked, hideProcessed],
  )

  const planQ = useQuery({
    queryKey: ['translations', 'plan', filters],
    queryFn: () => fetchTranslationPlan(filters),
    enabled: open,
  })

  const toggleType = (v: MediaType) => setChosen(types.includes(v) ? types.filter((x) => x !== v) : [...types, v])
  const togglePart = (part: TranslationPart) =>
    setPicked((cur) => (cur.includes(part) ? cur.filter((x) => x !== part) : TRANSLATION_PARTS.filter((x) => x === part || cur.includes(x))))

  const plan = planQ.data
  // Gemini-ის გასაღების გარეშე გადამოწმება ვერაფერს გააკეთებს
  const noGemini = partsQ.data?.translator_configured === false
  const genresInRun = picked.includes('genres') && (plan?.genres_pending ?? 0) > 0
  const totalUnits = (plan?.count ?? 0) + (plan?.cast_count ?? 0) + (genresInRun ? 1 : 0)
  const canRun = totalUnits > 0 && !planQ.isFetching && sources.length > 0
  const withGemini = sources.includes('gemini') && !noGemini

  const eta = (seconds: number) =>
    seconds < 90 ? t('sync.etaSec', { count: seconds }) : t('sync.etaMin', { count: Math.round(seconds / 60) })

  const run = () => {
    if (!plan) return
    enqueueTranslate(plan.items, genresInRun, sources, review, {
      fields: picked.filter((part): part is TranslationField => (TRANSLATION_FIELDS as readonly string[]).includes(part)),
      cast: plan.cast,
    })
    toast({ title: t('translate.started', { count: totalUnits }), variant: 'success' })
    onOpenChange(false)
  }

  /* საერთო `ModalShell` (`DialogContent` წაიშალა) */
  if (!open) return null

  return (
    <ModalShell title={t('translate.title')} hint={t('translate.howItWorks')} onClose={() => onOpenChange(false)} wide>
      <div className="mt-4 space-y-5">
        {/* ---------- რითი ითარგმნება ---------- */}

        {/* გასაღები არ არის — ვამბობთ პირდაპირ, რომ მხოლოდ TMDB-ის ტექსტი მოვა.
            ⚠️ გასაღები ანგარიშისაა, ე.ი. „მონაცემების" ბმულიც აქვეა */}
        {partsQ.data && !partsQ.data.translator_configured && (
          <CredentialMissingNotice provider="gemini">{t('translate.noKey')}</CredentialMissingNotice>
        )}
        {partsQ.data && !partsQ.data.tmdb_configured && (
          <CredentialMissingNotice provider="tmdb">{t('translate.noTmdbKey')}</CredentialMissingNotice>
        )}

        {/* ---------- წყაროები (შენი მითითება, 2026-09-14) ----------

            ⚠️ **ბარათებია და არა ჩიპები**: თითოეულმა თვითონ უნდა თქვას, რას
            ნიშნავს — „TMDB-ის ოფიციალური ტექსტი" და „მანქანური თარგმანი"
            სხვადასხვა ხარისხისა და ხარჯის რამეა, ე.ი. არჩევანი ინფორმირებული
            უნდა იყოს. ⚠️ **ორივეს მოხსნა აკრძალულია** (ღილაკი ითიშება):
            წყაროს გარეშე გაშვება სერვერზე 422-ია. */}
        <div>
          <Label className="mb-2 block">{t('translate.sourcesTitle')}</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TRANSLATION_SOURCES.map((source) => {
              const on = sources.includes(source)
              const Icon = source === 'tmdb' ? Languages : Sparkles
              // Gemini-ის გასაღების გარეშე ეს წყარო ვერაფერს გააკეთებს
              const dead = source === 'gemini' && noGemini

              return (
                <button
                  data-kind="chip"
                  key={source}
                  type="button"
                  aria-pressed={on}
                  disabled={dead}
                  onClick={() =>
                    setSources((cur) =>
                      cur.includes(source) ? cur.filter((x) => x !== source) : [...cur, source],
                    )
                  }
                  className={cn(
                    'flex cursor-pointer flex-col gap-1.5 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    on ? 'border-primary bg-secondary/60' : 'border-border hover:border-primary/40',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className={cn('size-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {t(`translate.source.${source}`)}
                    </span>
                    {on && <Check className="size-4 shrink-0 text-primary" />}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {t(`translate.sourceHint.${source}`)}
                  </span>
                </button>
              )
            })}
          </div>
          {sources.length === 0 && (
            <p className="mt-1.5 text-xs text-destructive">{t('translate.sourcesRequired')}</p>
          )}
        </div>

        {/* ---------- რა ითარგმნოს: ნაწილები ----------
            თითო ნაწილს თავისი რიცხვი აქვს (იგივე, რაც გვერდის ბარათზე) და ცალკე ირთვება —
            ერთი ნაწილის გაშვება სხვას არ ეხება. */}
        <div>
          <Label className="mb-2 flex items-center gap-1.5">
            {t('translate.partsTitle')}
            <InfoHint info={t('translate.partsHint')} />
          </Label>
          <div className="grid gap-2 sm:grid-cols-2" data-testid="translate-parts">
            {TRANSLATION_PARTS.map((part) => {
              const on = picked.includes(part)
              // გადამოწმება მთლიანად Gemini-ზე დგას — გასაღების გარეშე ვერაფერს გააკეთებს
              const dead = part === 'review' && noGemini

              return (
                <button
                  data-kind="chip"
                  key={part}
                  type="button"
                  aria-pressed={on}
                  disabled={dead}
                  onClick={() => togglePart(part)}
                  data-testid={`translate-part-${part}`}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    on ? 'border-primary bg-secondary/60' : 'border-border hover:border-primary/40',
                  )}
                >
                  <span className={cn('grid size-4 shrink-0 place-items-center rounded-sm border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t(`translate.part.${part}.title`)}</span>
                  <CountBadge count={partsQ.data?.parts[part]?.count ?? 0} />
                </button>
              )
            })}
          </div>
          {picked.length === 0 && <p className="mt-1.5 text-xs text-destructive">{t('translate.partsRequired')}</p>}
          {/* ⚠️ ფრთხილების ტექსტი ცხადად წერს, რომ ტექსტი **გადაიწერება** — ეს პროექტში
              ერთადერთი ასეთი ადგილია */}
          {review && (
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400" data-testid="review-warn">
              {t('translate.reviewWarn')}
            </p>
          )}
        </div>

        {/* ---------- ჩანაწერები: რომელ მოდულში და რაზე ----------
            მსახიობებსა და ჟანრებს ეს არ ეხება — ამიტომ ჩანაწერის ნაწილის გარეშე არ ჩანს */}
        {anyRecordPart && (
          <>
            {/* დამუშავებულების დამალვა */}
            <label
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
              data-testid="hide-processed"
            >
              <span className="inline-flex items-center gap-1.5 font-medium">
                {t('sync.hideProcessed')}
                <InfoHint info={t('translate.hideProcessedHint')} />
              </span>
              <Switch checked={hideProcessed} onCheckedChange={setHideProcessed} />
            </label>

            {/* იგივე ბარათები, რაც სინქრონიზაციაში (ერთი კითხვა — ერთი სახე);
                ერთი დომენის შემთხვევაში არჩევანი არ არსებობს */}
            {available.length > 1 && (
              <div>
                <Label className="mb-2 block">{t('sync.domains')}</Label>
                <MediaDomainCards value={types} onToggle={toggleType} enabled={open} />
              </div>
            )}

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
                        {/* სია არჩეული დომენების ლექსიკონების გაერთიანებაა */}
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
          </>
        )}
      </div>

      {/* ---------- შეჯამება + გაშვება ---------- */}
      <ModalFooter className="justify-between gap-3">
        <div className="min-w-0 text-sm" data-testid="translate-summary">
          {planQ.isFetching ? (
            <span className="text-muted-foreground">{t('api.loading')}</span>
          ) : plan ? (
            <>
              <span className="font-medium">
                {[
                  plan.count > 0 || plan.cast_count === 0 ? t('sync.affected', { count: plan.count }) : null,
                  plan.cast_count > 0 ? t('translate.castAffected', { count: plan.cast_count }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {totalUnits > 0 && (
                <span className="ml-1.5 text-muted-foreground">≈ {eta(plan.eta_seconds)}</span>
              )}
              {totalUnits === 0 && (
                <span className="block text-xs text-muted-foreground">{t('translate.nothingToDo')}</span>
              )}
              {/* Gemini-ს ხარჯი გაშვებამდე: რამდენი მოთხოვნაა და რამდენ დღეს გაწვდება ლიმიტი */}
              {withGemini && totalUnits > 0 && plan.gemini.requests > 0 && (
                <span className="block text-xs text-muted-foreground" data-testid="gemini-cost">
                  {plan.gemini.days === null
                    ? t('translate.geminiRequests', { count: plan.gemini.requests })
                    : t('translate.geminiDays', { requests: plan.gemini.requests, limit: plan.gemini.limit, count: plan.gemini.days })}
                </span>
              )}
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            {t('confirm.cancel')}
          </Button>
          <Button onClick={run} disabled={!canRun}>
            {planQ.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Languages className="size-4" />}
            {isBusy ? t('sync.addToQueue') : t('translate.run')}
          </Button>
        </div>
      </ModalFooter>
    </ModalShell>
  )
}
