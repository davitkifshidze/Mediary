import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  ExternalLink,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import {
  cancelRequest,
  cleanStorageOrphans,
  fetchMyRequests,
  fetchStorageOrphans,
  fetchStorageUsage,
  recalculateStorage,
  requestStorageIncrease,
} from '@/api/account'
import { useAuth } from '@/lib/auth'
import { grantedQuota, requestedQuota } from '@/lib/display'
import { errorMessage } from '@/lib/errors'
import { moduleName, useModules } from '@/lib/modules'
import { statusName, useStatusMap } from '@/lib/statuses'
import type { Status } from '@/api/types'
import { formatBytes } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import {
  ACTOR_PER_PAGE_OPTIONS,
  CARD_SIZE_OPTIONS,
  CONTENT_LANG_OPTIONS,
  DATE_FORMAT_OPTIONS,
  DISCOVER_PER_PAGE_OPTIONS,
  GROUP_BY_OPTIONS,
  LIBRARY_PAGE_SIZE_OPTIONS,
  POSTER_QUALITY_OPTIONS,
  SORT_FIELD_OPTIONS,
  TMDB_MAX_PAGE,
  useContentLang,
  useSettings,
  type CardSize,
  type ContentLang,
  type DateFormat,
  type GroupBy,
  type LibraryView,
  type PosterQuality,
  type Settings,
  type SortField,
} from '@/lib/settings'
import { NumberSelect, SettingRow as Row } from '@/components/SettingRow'
import { SettingsSaveBar } from '@/components/SettingsSaveBar'
import { WebQuotaCard } from '@/components/WebQuotaCard'
import { StorageAllocations } from '@/components/StorageAllocations'
import { StorageBar } from '@/components/StorageBar'
import { Button } from '@/components/ui/button'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

/** კვოტა UI-ში ყოველთვის MB-ებშია (ისევე, როგორც ადმინის `/users/{id}`-ზე) */
const MB = 1024 * 1024

/* ============================================================
   პარამეტრების გვერდი (Tasks E1) — per-user, `users.settings`-ში.
   L2: სინქრონი მთლიანად `/sync`-ზე გავიდა — გაშვებაც და „პაუზა
   ჩანაწერებს შორის"-იც, რადგან პაუზა სწორედ სინქრონის ნაწილია.
   ============================================================ */

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { settings, set, reset, isDirty } = useSettings()
  const lang = useContentLang(i18n.language)
  const { mediaModules } = useModules()

  /* §6.4 — ნაგულისხმევი სექციის ვარიანტები **სამივე მედია-დომენის
     გაერთიანებაა**: პარამეტრი ერთია და სამივეზე მოქმედებს. დუბლი
     გასაღებით იჭრება (ნაგულისხმევი ნაკრები ხომ სამივეზე ერთნაირია). */
  const statusMap = useStatusMap(mediaModules.map((m) => m.key))
  const viewStatuses = useMemo(() => {
    const seen = new Map<string, Status>()
    for (const m of mediaModules) {
      for (const s of statusMap[m.type] ?? []) if (!seen.has(s.key)) seen.set(s.key, s)
    }
    return [...seen.values()]
  }, [mediaModules, statusMap])

  const num = (key: keyof Settings) => (v: number) => set(key, v)

  return (
    <PageContainer>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="size-4" />
              {t('settings.reset')}
            </Button>
          </>
        }
      />

      {/* ---------- ნაგულისხმევები (E4) ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
          {t('settings.defaults')}
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">{t('settings.defaultsHint')}</p>

        <Row label={t('settings.defaultView')} hint={t('settings.defaultViewHint')} dirty={isDirty('defaultView')}>
          <Select
            value={settings.defaultView}
            onValueChange={(v) => set('defaultView', v as LibraryView)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* §6.4 — „ყველა" · *ჩემი* სტატუსები · „რჩეული".
                  ⚠️ სია სამივე მედია-დომენის **გაერთიანებაა**: პარამეტრი
                  ერთია და ფილმზეც მოქმედებს, სერიალზეც, ანიმეზეც. */}
              <SelectItem value="all">{t('filter.all')}</SelectItem>
              {viewStatuses.map((s: Status) => (
                <SelectItem key={s.key} value={s.key}>
                  {statusName(s, lang)}
                </SelectItem>
              ))}
              <SelectItem value="favorite">{t('filter.favorite')}</SelectItem>
            </SelectContent>
          </Select>
        </Row>

        <Row
          label={t('settings.defaultSort')}
          hint={t('settings.defaultSortHint')}
          dirty={isDirty('defaultSortField') || isDirty('defaultSortDir')}
        >
          <div className="flex gap-1">
            <Select
              value={settings.defaultSortField}
              onValueChange={(v) => set('defaultSortField', v as SortField)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_FIELD_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {t(`sort.${f}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => set('defaultSortDir', settings.defaultSortDir === 'desc' ? 'asc' : 'desc')}
              title={t(settings.defaultSortDir === 'desc' ? 'sort.desc' : 'sort.asc')}
              aria-label={t(settings.defaultSortDir === 'desc' ? 'sort.desc' : 'sort.asc')}
            >
              {settings.defaultSortDir === 'desc' ? (
                <ArrowDownWideNarrow className="size-4" />
              ) : (
                <ArrowUpNarrowWide className="size-4" />
              )}
            </Button>
          </div>
        </Row>

        <Row label={t('settings.contentLang')} hint={t('settings.contentLangHint')} dirty={isDirty('contentLang')}>
          <Select
            value={settings.contentLang}
            onValueChange={(v) => set('contentLang', v as ContentLang)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_LANG_OPTIONS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l === 'auto' ? t('settings.contentLangAuto') : l === 'ka' ? 'ქართული' : 'English'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        {/* ---------- 18 ---------- */}
        <Row
          label={t('settings.defaultGrouping')}
          hint={t('settings.defaultGroupingHint')}
          dirty={isDirty('defaultGrouping')}
        >
          <Select
            value={settings.defaultGrouping}
            onValueChange={(v) => set('defaultGrouping', v as GroupBy)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_BY_OPTIONS.map((g) => (
                <SelectItem key={g} value={g}>
                  {t(`sort.groupBy_${g}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row label={t('settings.cardSize')} hint={t('settings.cardSizeHint')} dirty={isDirty('cardSize')}>
          <Select value={settings.cardSize} onValueChange={(v) => set('cardSize', v as CardSize)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CARD_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`settings.cardSizeOption.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        {/* თარიღის ვარიანტები **ნიმუშად** ჩანს და არა სახელად — „ka-GE"
            არაფერს ეუბნება, `06.09.2026` კი ყველაფერს. */}
        <Row label={t('settings.dateFormat')} hint={t('settings.dateFormatHint')} dirty={isDirty('dateFormat')}>
          <Select value={settings.dateFormat} onValueChange={(v) => set('dateFormat', v as DateFormat)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMAT_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  {formatDate(new Date(), f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </section>

      {/* ---------- სიები და გვერდები (E2) ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t('settings.lists')}</h2>
        <p className="mb-2 text-xs text-muted-foreground">{t('settings.listsHint')}</p>

        <Row label={t('settings.actorMovies')} hint={t('settings.actorMoviesHint')} dirty={isDirty('actorMoviesPerPage')}>
          <NumberSelect
            value={settings.actorMoviesPerPage}
            options={ACTOR_PER_PAGE_OPTIONS}
            onChange={num('actorMoviesPerPage')}
          />
        </Row>
        <Row label={t('settings.actorSeries')} hint={t('settings.actorSeriesHint')} dirty={isDirty('actorSeriesPerPage')}>
          <NumberSelect
            value={settings.actorSeriesPerPage}
            options={ACTOR_PER_PAGE_OPTIONS}
            onChange={num('actorSeriesPerPage')}
          />
        </Row>
        <Row label={t('settings.libraryPageSize')} hint={t('settings.libraryPageSizeHint')} dirty={isDirty('libraryPageSize')}>
          <NumberSelect
            value={settings.libraryPageSize}
            options={LIBRARY_PAGE_SIZE_OPTIONS}
            onChange={num('libraryPageSize')}
            labelOf={(v) => (v === 0 ? t('settings.allOnOnePage') : String(v))}
          />
        </Row>
      </section>

      {/* ---------- „აღმოაჩინე" (E3) ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t('settings.discover')}</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          {t('settings.discoverHint', { max: TMDB_MAX_PAGE })}
        </p>

        <Row
          label={t('settings.discoverMaxPages')}
          hint={t('settings.discoverMaxPagesHint', { max: TMDB_MAX_PAGE })}
          dirty={isDirty('discoverMaxPages')}
        >
          <Input
            type="number"
            min={1}
            max={TMDB_MAX_PAGE}
            value={settings.discoverMaxPages}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v)) set('discoverMaxPages', Math.min(Math.max(1, v), TMDB_MAX_PAGE))
            }}
          />
        </Row>
        <Row label={t('settings.discoverPerPage')} hint={t('settings.discoverPerPageHint')} dirty={isDirty('discoverPerPage')}>
          <NumberSelect
            value={settings.discoverPerPage}
            options={DISCOVER_PER_PAGE_OPTIONS}
            onChange={num('discoverPerPage')}
          />
        </Row>
      </section>

      {/* ---------- მედია და TMDB (18) ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t('settings.media')}</h2>
        <p className="mb-2 text-xs text-muted-foreground">{t('settings.mediaHint')}</p>

        <Row
          label={t('settings.posterQuality')}
          hint={t('settings.posterQualityHint')}
          dirty={isDirty('posterQuality')}
        >
          <Select
            value={settings.posterQuality}
            onValueChange={(v) => set('posterQuality', v as PosterQuality)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSTER_QUALITY_OPTIONS.map((q) => (
                <SelectItem key={q} value={q}>
                  {q.slice(1)} px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row label={t('settings.autoResync')} hint={t('settings.autoResyncHint')} dirty={isDirty('autoResync')}>
          <div className="flex h-9 items-center">
            <Switch
              checked={settings.autoResync}
              onCheckedChange={(v) => set('autoResync', v)}
              aria-label={t('settings.autoResync')}
            />
          </div>
        </Row>
      </section>

      {/* ---------- საცავი (Tasks 17.3) ---------- */}
      <StorageSection />

      {/* §7.6.6 — ვებძებნის კვოტა. ⚠️ **გვერდი/სექცია მას არ ეკუთვნის**:
          SerpApi მოდული არ არის, წყაროა — ინტერფეისში მხოლოდ კვოტა სჭირდება.
          გასაღების გარეშე ბარათი საერთოდ არ ჩანს. */}
      <WebQuotaCard />

      {/* ---------- სინქრონიზაცია: მხოლოდ პარამეტრი (L2) ----------
          თვითონ გაშვება ქმედებაა და `/sync`-ზე გადავიდა — პარამეტრებში
          მხოლოდ „პაუზა ჩანაწერებს შორის" რჩება. */}

      {/* 3 — ცხადი შენახვა; „ნაგულისხმევებზე დაბრუნებაც" აქ დასტურდება */}
      <SettingsSaveBar />
    </PageContainer>
  )
}

/**
 * საცავის მდგომარეობა (17.3) + მოდულებად დაშლა, გადანაწილება (17.2),
 * გაზრდის მოთხოვნა (17.4) და ობოლი ფაილები (17.5).
 *
 * ⚠️ **ატვირთვების ბიბლიოთეკა აქ აღარაა** (§6.2) — ის `/profile`-ზე გადავიდა
 * (`StorageFilesCard`), რადგან „რა ავტვირთე" ანგარიშის ფაქტია და არა პარამეტრი.
 */
function StorageSection() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { all } = useModules()

  const usageQ = useQuery({ queryKey: ['storage'], queryFn: fetchStorageUsage })

  // წაშლა/გადათვლა ერთსა და იმავეს ცვლის — სამივე ხედი ერთად უნდა განახლდეს
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['storage-files'] })
    // ჰედერის ინდიკატორი `/auth/me`-დან იკვებება
    qc.invalidateQueries({ queryKey: ['me'] })
  }

  const recalc = useMutation({
    mutationFn: recalculateStorage,
    onSuccess: (usage) => {
      qc.setQueryData(['storage'], usage)
      refreshAll()
      toast({ title: t('storage.recalcDone'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const usage = usageQ.data
  // მოდულის სახელი key-იდან; `account` და `chat` მოდულები არ არიან (§16.4)
  const label = (key: string) =>
    key === 'account' || key === 'chat'
      ? t(`storage.${key}`)
      : (() => {
          const m = all.find((mod) => mod.key === key)
          return m ? moduleName(m, i18n.language) : key
        })()

  const rows = Object.entries(usage?.modules ?? {})
    .filter(([, bytes]) => bytes > 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t('storage.title')}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{t('storage.hint')}</p>

      {usageQ.isLoading || !usage ? (
        <div className="h-12 animate-pulse rounded-md bg-muted" />
      ) : (
        <>
          <StorageBar usage={usage} />

          {rows.length > 0 ? (
            <ul className="mt-4 space-y-2 border-t border-border pt-4">
              {rows.map(([key, bytes]) => (
                <li key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{label(key)}</span>
                  <span className="shrink-0 tabular-nums">{formatBytes(bytes)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              {t('storage.empty')}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">{t('storage.recalcHint')}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalc.mutate()}
              disabled={recalc.isPending}
            >
              <RotateCcw className="size-4" />
              {recalc.isPending ? t('actions.saving') : t('storage.recalc')}
            </Button>
          </div>

          {/* §17.2 — გადანაწილება მოდულებზე; `account` ლიმიტს ვერ იღებს */}
          <StorageAllocations
            usage={usage}
            modules={all
              .filter((m) => m.enabled)
              .map((m) => ({ key: m.key, name: moduleName(m, i18n.language) }))}
          />

          <QuotaRequest quota={usage.quota} />

          {/* §6.2 — ატვირთვების ბიბლიოთეკა **პროფილზე** გადავიდა
              (`components/StorageFilesCard.tsx`). აქ მხოლოდ ის რჩება, რაც
              მართლა პარამეტრია: ლიმიტი, გადანაწილება, გაზრდის მოთხოვნა
              და ობოლი ფაილები. */}
          <Link
            to="/profile"
            className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm hover:text-primary"
          >
            <span>
              <span className="block font-medium">{t('storage.filesTitle')}</span>
              <span className="block text-xs text-muted-foreground">{t('storage.filesMoved')}</span>
            </span>
            <ExternalLink className="size-4 shrink-0" />
          </Link>

          <OrphanFiles />
        </>
      )}
    </section>
  )
}

/**
 * ლიმიტის გაზრდის მოთხოვნა (Tasks 17.4).
 *
 * ცალკე ცხრილი არ გაჩენილა — იგივე `approval_requests`-ია, რაც მოდულებზე,
 * ე.ი. ადმინი მას `/requests`-ზე და `/users/{id}`-ზე იმავე ღილაკებით ხედავს.
 * ერთდროულად **ერთი ღია მოთხოვნაა** დაშვებული (backend-იც ამას იცავს).
 */
function QuotaRequest({ quota }: { quota: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data: mine = [] } = useQuery({ queryKey: ['my-requests'], queryFn: fetchMyRequests })
  const storageRequests = mine.filter((r) => r.type === 'storage_increase')
  const pending = storageRequests.find((r) => r.status === 'pending')
  const last = storageRequests[0]

  // ნაგულისხმევი წინადადება — მიმდინარე ლიმიტი + 1 GB (ცარიელ ველზე ფიქრი არ სჭირდება)
  const [mb, setMb] = useState('')
  const [message, setMessage] = useState('')
  const suggested = Math.round(quota / MB) + 1024

  const done = () => {
    qc.invalidateQueries({ queryKey: ['my-requests'] })
    qc.invalidateQueries({ queryKey: ['pending-count'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const send = useMutation({
    mutationFn: () => requestStorageIncrease(Math.round(Number(mb) || suggested) * MB, message || undefined),
    onSuccess: () => {
      setMessage('')
      setMb('')
      done()
      toast({ title: t('storage.requestSent'), variant: 'success' })
    },
    onError: fail,
  })

  const cancel = useMutation({ mutationFn: cancelRequest, onSuccess: done, onError: fail })

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">{t('storage.requestTitle')}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t('storage.requestHint')}</p>

      {pending ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
          <span>{t('storage.requestPending', { requested: formatBytes(requestedQuota(pending)) })}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => cancel.mutate(pending.id)}
            disabled={cancel.isPending}
          >
            {t('modules.cancelRequest')}
          </Button>
        </div>
      ) : (
        <>
          {/* ბოლო პასუხი — რომ „გავაგზავნე და არაფერი მოხდა" შეგრძნება არ დარჩეს */}
          {last && (
            <p className="mb-2 text-xs text-muted-foreground">
              {t(`requests.status.${last.status}`)}
              {last.status === 'approved' &&
                grantedQuota(last) != null &&
                ` · ${formatBytes(grantedQuota(last)!)}`}
              {last.review_note && ` — ${last.review_note}`}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="quota-request">{t('storage.requestAmount')}</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  id="quota-request"
                  type="number"
                  min={10}
                  step={10}
                  className="w-32"
                  placeholder={String(suggested)}
                  value={mb}
                  onChange={(e) => setMb(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">MB</span>
              </div>
            </div>
            <Input
              className="min-w-52 flex-1"
              placeholder={t('storage.requestMessage')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => send.mutate()}
              disabled={send.isPending || Math.round(Number(mb) || suggested) * MB <= quota}
            >
              {send.isPending ? t('actions.saving') : t('storage.requestSend')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * ობოლი ფაილები (17.5) — დისკზე არიან, ბაზაში კი არავინ იხსენიებს.
 *
 * ⚠️ **გლობალური ოპერაციაა და არა per-user:** ატვირთვები საერთო
 * საქაღალდეებში ჯდება, ე.ი. არ-მოხსენიებულ ფაილს მფლობელი აღარ აქვს.
 * ამიტომ ბლოკი მხოლოდ `super_admin`-ს ჩანს (backend-ზეც იგივე ზღუდეა).
 */
function OrphanFiles() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()

  const isAdmin = !!user?.is_super_admin
  const orphansQ = useQuery({
    queryKey: ['storage-orphans'],
    queryFn: fetchStorageOrphans,
    enabled: isAdmin,
  })

  const clean = useMutation({
    mutationFn: cleanStorageOrphans,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['storage-orphans'] })
      toast({
        title: t('storage.orphansCleaned', {
          count: result.files,
          size: formatBytes(result.bytes),
        }),
        variant: 'success',
      })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!isAdmin) return null

  const orphans = orphansQ.data

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">{t('storage.orphansTitle')}</h3>
      {/* §6.3 — ტექსტი ხსნის, **რა არის** და **რატომ გამოჩნდა**: ადრე მხოლოდ
          „დისკზე არიან, ბაზაში კი არავინ იხსენიებს" ეწერა, რაც არ პასუხობდა
          კითხვას „საიდან მოვიდა და უსაფრთხოა თუ არა წაშლა". */}
      <p className="mb-1.5 text-xs text-muted-foreground">{t('storage.orphansHint')}</p>
      <p className="mb-1.5 text-xs text-muted-foreground">{t('storage.orphansWhy')}</p>
      <p className="mb-3 text-xs text-muted-foreground">{t('storage.orphansSafe')}</p>

      {orphansQ.isLoading ? (
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      ) : !orphans?.total ? (
        <p className="text-sm text-muted-foreground">{t('storage.orphansEmpty')}</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {t('storage.orphansFound', {
              count: orphans.total,
              size: formatBytes(orphans.bytes),
            })}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={clean.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: t('storage.orphansTitle'),
                description: t('storage.orphansConfirm', {
                  count: orphans.total,
                  size: formatBytes(orphans.bytes),
                }),
                confirmText: t('confirm.delete'),
                variant: 'destructive',
              })
              if (ok) clean.mutate()
            }}
          >
            <Trash2 className="size-4" />
            {clean.isPending ? t('actions.saving') : t('storage.orphansClean')}
          </Button>
        </div>
      )}
    </div>
  )
}
