import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownWideNarrow, ArrowLeft, ArrowUpNarrowWide, RotateCcw } from 'lucide-react'
import { fetchStorageUsage } from '@/api/account'
import { moduleName, useModules } from '@/lib/modules'
import { statusName, useStatusMap } from '@/lib/statuses'
import type { Status } from '@/api/types'
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
import { StorageAllocations } from '@/components/StorageAllocations'
import { UploadLimitsCard } from '@/components/UploadLimitsCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

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

      {/* ---------- საცავის ლიმიტები (Tasks §17.2 → ეტაპი 5) ----------
          ⚠️ **პარამეტრებს მხოლოდ ეს რჩება.** „რამდენი მაქვს", „რა ავტვირთე",
          გაზრდის მოთხოვნა და ობოლი ფაილები ანგარიშის ფაქტია და არა პარამეტრი —
          ისინი `/profile`-ის ერთ ბლოკშია (`components/StorageCard.tsx`). */}
      <AllocationSettings />

      {/* ---------- ატვირთვის ლიმიტები (2026-09-14) ----------
          ⚠️ **ეს საცავის კვოტა არაა**: ზემოთ „რამდენი ადგილი მაქვს" წერია,
          აქ კი „ერთ ატვირთვაზე რა ზომა და ფორმატი მიიღება". ბლოკი მხოლოდ
          კითხვადია — ჭერს აპის წესი და `php.ini` ერთად წყვეტენ. */}
      <div className="mt-6">
        <UploadLimitsCard />
      </div>

      {/* ---------- სინქრონიზაცია: მხოლოდ პარამეტრი (L2) ----------
          თვითონ გაშვება ქმედებაა და `/sync`-ზე გადავიდა — პარამეტრებში
          მხოლოდ „პაუზა ჩანაწერებს შორის" რჩება. */}

      {/* 3 — ცხადი შენახვა; „ნაგულისხმევებზე დაბრუნებაც" აქ დასტურდება */}
      <SettingsSaveBar />
    </PageContainer>
  )
}

/**
 * მოდულებზე ლიმიტების გაწერა — **ერთადერთი საცავის პარამეტრი** (ეტაპი 5).
 *
 * ⚠️ `null` ≠ `0`: `null` = გამოყოფილი ლიმიტი არაა (საერთო აუზიდან ხარჯავს),
 * `0` = ატვირთვა აკრძალულია. ჯამი ანგარიშის კვოტას ვერ გადააჭარბებს —
 * ამას backend ამოწმებს **ჩაწერამდე** (422 `allocation_exceeds_quota`).
 */
function AllocationSettings() {
  const { t, i18n } = useTranslation()
  const { all } = useModules()
  const usageQ = useQuery({ queryKey: ['storage'], queryFn: fetchStorageUsage })

  const usage = usageQ.data

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
        {t('storage.allocationsTitle')}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">{t('storage.allocationsWhere')}</p>

      {usageQ.isLoading || !usage ? (
        <div className="h-12 animate-pulse rounded-md bg-muted" />
      ) : (
        <StorageAllocations
          usage={usage}
          modules={all
            .filter((m) => m.enabled)
            .map((m) => ({ key: m.key, name: moduleName(m, i18n.language) }))}
          bare
        />
      )}
    </section>
  )
}
