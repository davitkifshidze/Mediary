import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckSquare,
  Download,
  ExternalLink,
  FileText,
  LayoutGrid,
  List,
  Lock,
  Search,
  Square,
  Trash2,
} from 'lucide-react'
import type { UploadedFile } from '@/api/account'
import { storageUrl } from '@/lib/api'
import { useDateFormat } from '@/lib/dates'
import { moduleName, useModules } from '@/lib/modules'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   ატვირთვების **მედია-ბიბლიოთეკა** (Tasks 17.5 → §6.2).

   ერთი კომპონენტი ორ ხედს ემსახურება, რომ „რა არის ატვირთული" ორნაირად
   არ გამოიყურებოდეს: ადმინის `/users/{id}` (ნახვა/გადმოწერა) და
   **პროფილის** „ატვირთული ფაილები" (საკუთარი ფაილები + წაშლა).
   ორივე ერთი და იმავე `StorageMeter::files()`-იდან იკვებება.

   სია **სრულია და სქროლადი** — ჭრილი ფილტრებით ხდება და არა „top 200"-ით.

   ⚠️ **§6.2 — ერთი დაჭერა ნიშნავს და არ ხსნის** (§2.9-ის ბიბლიოთეკის წესი,
   იგივე, რაც `PhotoGrid`-ს აქვს). გახსნას ცალკე ღილაკი აქვს, თორემ
   მონიშვნისას ყოველ დაჭერაზე ახალი ტაბი იხსნებოდა.
   ============================================================ */

type Sort = 'size' | 'date' | 'name'
type View = 'grid' | 'list'

const KINDS = ['avatar', 'poster', 'cover', 'thumbnail', 'image', 'video', 'doc', 'field'] as const

/** მასობრივი მოქმედების სკოუპი — `'all'` = **მთელი ბიბლიოთეკა**, ჭრილი არა */
export type BulkScope = { paths: string[] } | 'all'

export function StorageLibrary({
  files,
  total,
  bytes,
  moduleTotals,
  onDelete,
  onBulkDelete,
  onBulkDownload,
  deletingPath,
  busy,
}: {
  files: UploadedFile[]
  /** სულ რამდენია backend-ზე — თუ ნაჩვენებზე მეტია, ქვემოთ შენიშვნა ჩნდება */
  total?: number
  bytes?: number
  /** მოდულების ჯამები backend-იდან (ჩიპების რიცხვები არ ცდება ჭრილზე) */
  moduleTotals?: Record<string, { files: number; bytes: number }>
  /** არ არის გადმოცემული → წაშლის ღილაკი არ ჩანს (ადმინის ხედი) */
  onDelete?: (file: UploadedFile) => void
  /** §6.2 — მონიშნულების ან ყველას წაშლა; არ არის → მონიშვნის რეჟიმიც არ ჩანს */
  onBulkDelete?: (scope: BulkScope, count: number) => void
  /** §6.2 — იგივე ჩამოტვირთვაზე (zip) */
  onBulkDownload?: (scope: BulkScope, count: number) => void
  deletingPath?: string | null
  busy?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { all } = useModules()
  const fmt = useDateFormat()

  const [q, setQ] = useState('')
  const [module, setModule] = useState<string>('all')
  const [kind, setKind] = useState<string>('all')
  const [sort, setSort] = useState<Sort>('size')
  const [view, setView] = useState<View>('list')
  const [picked, setPicked] = useState<string[]>([])

  const bulk = !!(onBulkDelete || onBulkDownload)

  /** მოდულის სახელი key-იდან; `account` და `chat` მოდულები არ არიან (§16.4) */
  const label = (key: string) =>
    key === 'account' || key === 'chat'
      ? t(`storage.${key}`)
      : (() => {
          const m = all.find((mod) => mod.key === key)
          return m ? moduleName(m, i18n.language) : key
        })()

  const moduleChips = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of files) counts.set(f.module, (counts.get(f.module) ?? 0) + 1)
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count: moduleTotals?.[key]?.files ?? count }))
      .sort((a, b) => b.count - a.count)
  }, [files, moduleTotals])

  const kindChips = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of files) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1)
    return KINDS.filter((k) => counts.has(k)).map((k) => ({ key: k, count: counts.get(k)! }))
  }, [files])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = files.filter(
      (f) =>
        (module === 'all' || f.module === module) &&
        (kind === 'all' || f.kind === kind) &&
        (!needle || (f.name ?? f.path).toLowerCase().includes(needle)),
    )

    return [...list].sort((a, b) => {
      if (sort === 'name') return (a.name ?? a.path).localeCompare(b.name ?? b.path)
      if (sort === 'date') return (b.created_at ?? '').localeCompare(a.created_at ?? '')
      return b.size - a.size
    })
  }, [files, q, module, kind, sort])

  /* ⚠️ **მონიშვნიდან გამქრალი ფაილი ჩუმად უნდა მოიხსნას** — წაშლის შემდეგ
     სიაში აღარაა და „5 მონიშნული" ტყუილი გახდებოდა. */
  useEffect(() => {
    setPicked((p) => {
      const live = p.filter((path) => files.some((f) => f.path === path))
      return live.length === p.length ? p : live
    })
  }, [files])

  const shownBytes = shown.reduce((sum, f) => sum + f.size, 0)
  const pickedSet = new Set(picked)
  const pickedShown = shown.filter((f) => pickedSet.has(f.path))
  const pickedBytes = pickedShown.reduce((sum, f) => sum + f.size, 0)
  const allShownPicked = shown.length > 0 && pickedShown.length === shown.length

  const toggle = (path: string) =>
    setPicked((p) => (p.includes(path) ? p.filter((x) => x !== path) : [...p, path]))

  const toggleAllShown = () =>
    setPicked((p) =>
      allShownPicked
        ? p.filter((path) => !shown.some((f) => f.path === path))
        : [...new Set([...p, ...shown.map((f) => f.path)])],
    )

  return (
    <>
      {/* ---------- ხელსაწყოების ზოლი ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('storage.searchPlaceholder')}
            className="h-9 pl-8"
          />
        </div>

        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="h-9 w-auto min-w-[9rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['size', 'date', 'name'] as Sort[]).map((s) => (
              <SelectItem key={s} value={s}>
                {t(`storage.sort.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex overflow-hidden rounded-md border border-border">
          {(['list', 'grid'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-label={v}
              className={cn(
                'grid size-9 cursor-pointer place-items-center transition-colors',
                view === v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {v === 'list' ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- ჩიპები: მოდული და ფაილის სახე ---------- */}
      {(moduleChips.length > 1 || kindChips.length > 1) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {moduleChips.length > 1 && (
            <>
              <Chip active={module === 'all'} onClick={() => setModule('all')} label={t('filter.all')} count={files.length} />
              {moduleChips.map((c) => (
                <Chip
                  key={c.key}
                  active={module === c.key}
                  onClick={() => setModule(c.key)}
                  label={label(c.key)}
                  count={c.count}
                />
              ))}
            </>
          )}
          {kindChips.length > 1 && (
            <span className="ml-2 flex flex-wrap gap-1.5 border-l border-border pl-3">
              <Chip active={kind === 'all'} onClick={() => setKind('all')} label={t('storage.allKinds')} />
              {kindChips.map((c) => (
                <Chip
                  key={c.key}
                  active={kind === c.key}
                  onClick={() => setKind(c.key)}
                  label={t(`storage.fileKind.${c.key}`)}
                  count={c.count}
                />
              ))}
            </span>
          )}
        </div>
      )}

      {/* ---------- §6.2 — მასობრივი მოქმედებები ----------
          ⚠️ „მონიშნულები" ჭრილზე მუშაობს, „ყველა" კი **მთელ ბიბლიოთეკაზე** —
          ამიტომ ორივე ღილაკზე რიცხვი ცხადად წერია და არა „ყველა" მარტო. */}
      {bulk && !!files.length && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
          <Button variant="ghost" size="sm" onClick={toggleAllShown} disabled={!shown.length}>
            {allShownPicked ? <Square className="size-4" /> : <CheckSquare className="size-4" />}
            {allShownPicked ? t('storage.selectNone') : t('storage.selectShown', { count: shown.length })}
          </Button>

          <span className="text-xs text-muted-foreground">
            {t('storage.selected', { count: picked.length, size: formatBytes(pickedBytes) })}
          </span>

          <span className="ml-auto flex flex-wrap items-center gap-2">
            {onBulkDownload && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !picked.length}
                  onClick={() => onBulkDownload({ paths: picked }, picked.length)}
                >
                  <Download className="size-4" />
                  {t('storage.downloadSelected', { count: picked.length })}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onBulkDownload('all', total ?? files.length)}
                >
                  {t('storage.downloadAll', { count: total ?? files.length })}
                </Button>
              </>
            )}
            {onBulkDelete && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={busy || !picked.length}
                  onClick={() => onBulkDelete({ paths: picked }, picked.length)}
                >
                  <Trash2 className="size-4" />
                  {t('storage.deleteSelected', { count: picked.length })}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => onBulkDelete('all', total ?? files.length)}
                >
                  {t('storage.deleteAll', { count: total ?? files.length })}
                </Button>
              </>
            )}
          </span>
        </div>
      )}

      {!shown.length ? (
        <p className="text-sm text-muted-foreground">{t('storage.filesEmpty')}</p>
      ) : (
        /* სია სქროლადია — ყველა ფაილი ჩანს და გვერდი არ იბერება */
        <div className="fb-scroll max-h-[70vh] overflow-y-auto rounded-lg border border-border p-2">
          {view === 'list' ? (
            <ul className="space-y-1">
              {shown.map((f) => (
                <li
                  key={f.path}
                  onClick={bulk ? () => toggle(f.path) : undefined}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2',
                    bulk && 'cursor-pointer',
                    pickedSet.has(f.path)
                      ? 'border-primary bg-primary/5'
                      : 'border-border',
                  )}
                >
                  {bulk && (
                    <Checkbox
                      checked={pickedSet.has(f.path)}
                      onCheckedChange={() => toggle(f.path)}
                      aria-label={f.name ?? f.path}
                    />
                  )}
                  <Preview file={f} className="h-10 w-14" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{f.name ?? f.path}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`storage.fileKind.${f.kind}`)}
                      {' · '}
                      {label(f.module)}
                      {' · '}
                      {formatBytes(f.size)}
                      {f.created_at && ` · ${fmt.date(f.created_at)}`}
                    </span>
                  </span>
                  <Actions file={f} onDelete={onDelete} deletingPath={deletingPath} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((f) => (
                <li
                  key={f.path}
                  onClick={bulk ? () => toggle(f.path) : undefined}
                  className={cn(
                    'overflow-hidden rounded-lg border',
                    bulk && 'cursor-pointer',
                    pickedSet.has(f.path) ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <span className="relative block">
                    <Preview file={f} className="aspect-video w-full" />
                    {bulk && (
                      <span className="absolute left-1.5 top-1.5 rounded bg-background/90 p-0.5">
                        <Checkbox
                          checked={pickedSet.has(f.path)}
                          onCheckedChange={() => toggle(f.path)}
                          aria-label={f.name ?? f.path}
                        />
                      </span>
                    )}
                  </span>
                  <div className="p-2">
                    <p className="truncate text-xs">{f.name ?? f.path}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                      <Actions file={f} onDelete={onDelete} deletingPath={deletingPath} compact />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {t('storage.shownCount', { shown: shown.length, total: total ?? files.length })}
        {' · '}
        {formatBytes(shownBytes)}
        {bytes != null && shownBytes !== bytes && ` / ${formatBytes(bytes)}`}
      </p>
    </>
  )
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-secondary text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {count != null && <span className="ml-1 opacity-60">{count}</span>}
    </button>
  )
}

/**
 * ფაილის მინი-ხედი.
 *
 * ⚠️ **პრივატული დისკის ფაილი აქ არ იხსნება** (§17.5). `/storage/*` მას ვერ
 * ხედავს, ე.ი. `<img>` გატეხილი იყო და ბმული 404-ს აბრუნებდა — ჩანაწერების
 * დოკუმენტებზე და ჩატის მედიაზე სწორედ ეს ხდებოდა. თითოეულ სექციას
 * გაცემის **თავისი** route აქვს (`/note-files/{id}`, `/chat/files/{message}`,
 * `/custom-fields/…/file/{key}`), ე.ი. საერთო url აქედან არ აიგება —
 * ამიტომ პრივატული ხატულით ჩანს და ღიად აღარ მოგვაქვს.
 *
 * ⚠️ **`private`-ს backend ამბობს** და არა აქაური `startsWith('notes/')`:
 * დისკს მხოლოდ `StorageFolder` წყვეტს (CLAUDE.md-ის წესი).
 *
 * ⚠️ **§6.2 — ესკიზი აღარაა ბმული.** ერთი დაჭერა ახლა **ნიშნავს** და არ
 * ხსნის (§2.9), ე.ი. გახსნა ცალკე ღილაკზე გადავიდა (`Actions`).
 */
function Preview({ file, className }: { file: UploadedFile; className?: string }) {
  const { t } = useTranslation()
  const url = storageUrl(file.path) ?? ''

  const box = cn('grid shrink-0 place-items-center overflow-hidden rounded bg-muted', className)

  if (file.private) {
    return (
      <span title={t('storage.privateFile')} className={box}>
        <Lock className="size-4 text-muted-foreground" />
      </span>
    )
  }

  return (
    <span className={box}>
      {/* ⚠️ `field` (§6 ფაზა 4b) ხატულით ჩანს ტიპისგან დამოუკიდებლად:
          მორგებული ველის ფაილი ნებისმიერი ფორმატისაა და `<img>` მას ვერ ხატავს */}
      {file.kind === 'doc' || file.kind === 'field' ? (
        <FileText className="size-4 text-muted-foreground" />
      ) : (
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      )}
    </span>
  )
}

function Actions({
  file,
  onDelete,
  deletingPath,
  compact,
}: {
  file: UploadedFile
  onDelete?: (file: UploadedFile) => void
  deletingPath?: string | null
  compact?: boolean
}) {
  const { t } = useTranslation()
  const url = storageUrl(file.path) ?? ''

  const btn = cn(
    'inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-muted',
    compact && 'size-7 justify-center px-0',
  )

  return (
    <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {/* ⚠️ პრივატულ ფაილს გახსნა/ჩამოტვირთვა **არ ეძლევა** (§17.5): `/storage/*`
          მას ვერ ხედავს, ე.ი. ბმული 404-ს აბრუნებდა. ცალკეული ფაილის გახსნა
          თავის სექციაშია (ჩანაწერი / ჩატი / მორგებული ველი), სადაც მფლობელობა
          მოწმდება; მასობრივ zip-ში კი პრივატულიც ხვდება — ის endpoint
          ავტორიზებულია და გზას user-ის საკუთარ სიაში ეძებს.
          წაშლა აქაც რჩება — ის `path`-ით მიდის და დისკს პირდაპირ არ ეხება. */}
      {!file.private && (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" title={t('actions.open')} className={btn}>
            <ExternalLink className="size-3.5" />
            {!compact && t('actions.open')}
          </a>
          <a href={url} download title={t('videos.download')} className={btn}>
            <Download className="size-3.5" />
            {!compact && t('videos.download')}
          </a>
        </>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(file)}
          disabled={deletingPath === file.path}
          title={t('actions.delete')}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50',
            compact && 'size-7 justify-center px-0',
          )}
        >
          <Trash2 className="size-3.5" />
          {!compact && t('actions.delete')}
        </button>
      )}
    </span>
  )
}
