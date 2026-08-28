import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, DownloadCloud, RotateCcw } from 'lucide-react'
import {
  ACTOR_PER_PAGE_OPTIONS,
  DISCOVER_PER_PAGE_OPTIONS,
  LIBRARY_PAGE_SIZE_OPTIONS,
  SYNC_DELAY_OPTIONS,
  TMDB_MAX_PAGE,
  useSettings,
  type Settings,
} from '@/lib/settings'
import { SyncDialog } from '@/components/SyncDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   პარამეტრების გვერდი (Tasks E1) — შენახვა localStorage-ში.
   აქვეა „მონაცემების სინქრონიზაცია" (J1 — ღილაკი ბიბლიოთეკის
   თავიდან აქ გადმოვიდა).
   ============================================================ */

/** ერთი პარამეტრის რიგი — ლეიბლი + აღწერა მარცხნივ, კონტროლი მარჯვნივ */
function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="w-40 shrink-0">{children}</div>
    </div>
  )
}

function NumberSelect({
  value,
  options,
  onChange,
  labelOf,
}: {
  value: number
  options: number[]
  onChange: (v: number) => void
  labelOf?: (v: number) => string
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={String(o)}>
            {labelOf ? labelOf(o) : String(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const { settings, set, reset } = useSettings()
  const [syncOpen, setSyncOpen] = useState(false)

  const num = (key: keyof Settings) => (v: number) => set(key, v)

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="size-4" />
          {t('settings.reset')}
        </Button>
      </div>

      {/* ---------- სიები და გვერდები (E2) ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t('settings.lists')}</h2>
        <p className="mb-2 text-xs text-muted-foreground">{t('settings.listsHint')}</p>

        <Row label={t('settings.actorMovies')} hint={t('settings.actorMoviesHint')}>
          <NumberSelect
            value={settings.actorMoviesPerPage}
            options={ACTOR_PER_PAGE_OPTIONS}
            onChange={num('actorMoviesPerPage')}
          />
        </Row>
        <Row label={t('settings.actorSeries')} hint={t('settings.actorSeriesHint')}>
          <NumberSelect
            value={settings.actorSeriesPerPage}
            options={ACTOR_PER_PAGE_OPTIONS}
            onChange={num('actorSeriesPerPage')}
          />
        </Row>
        <Row label={t('settings.libraryPageSize')} hint={t('settings.libraryPageSizeHint')}>
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

        <Row label={t('settings.discoverMaxPages')} hint={t('settings.discoverMaxPagesHint', { max: TMDB_MAX_PAGE })}>
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
        <Row label={t('settings.discoverPerPage')} hint={t('settings.discoverPerPageHint')}>
          <NumberSelect
            value={settings.discoverPerPage}
            options={DISCOVER_PER_PAGE_OPTIONS}
            onChange={num('discoverPerPage')}
          />
        </Row>
      </section>

      {/* ---------- მონაცემების სინქრონიზაცია (J1–J5) ---------- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t('settings.sync')}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{t('settings.syncHint')}</p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t('sync.title')}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('settings.syncDesc')}</p>
          </div>
          <Button variant="outline" onClick={() => setSyncOpen(true)}>
            <DownloadCloud className="size-4" />
            {t('sync.open')}
          </Button>
        </div>

        <div className="mt-2">
          <Row label={t('settings.syncDelay')} hint={t('settings.syncDelayHint')}>
            <NumberSelect
              value={settings.syncDelayMs}
              options={SYNC_DELAY_OPTIONS}
              onChange={num('syncDelayMs')}
              labelOf={(v) => (v === 0 ? t('settings.noDelay') : `${v} ms`)}
            />
          </Row>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">{t('settings.syncCli')}</p>
      </section>

      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
    </main>
  )
}
