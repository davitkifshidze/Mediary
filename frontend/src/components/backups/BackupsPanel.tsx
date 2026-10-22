import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Database, Download, Table2, Loader2, Play, RotateCcw, TriangleAlert, Upload } from 'lucide-react'
import {
  createBackup,
  deleteBackup,
  downloadBackup,
  fetchBackups,
  importBackup,
  restoreBackup,
  type Backup,
} from '@/api/backups'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeSize } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { FormField } from '@/components/ui/form-layout'
import { InfoHint } from '@/components/ui/info-hint'
import { Pagination } from '@/components/ui/pagination'
import { BackupViewer } from '@/components/backups/BackupViewer'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { formatBytes } from '@/lib/utils'
import { isApiCode } from '@/lib/errors'
import { useClientPages } from '@/lib/paged'
import { LIST_PAGE_SIZE } from '@/lib/pageSize'

/* ============================================================
   **ბაზის დამპი და აღდგენა.**

   ⚠️ **გამოკითხვა მხოლოდ მაშინ, როცა რამე მართლა მიმდინარეობს** — ვიდეოს
   ჩამოწერის იგივე წესი. მუდმივი polling ერთნაკადიან `artisan serve`-ს
   ტყუილად აჯდება, ხოლო **მიტოვებული** `running` თვითონ ვერასდროს შეიცვლება,
   ე.ი. მასზე გამოკითხვა უსასრულო იქნებოდა — ამიტომ `stale` გამოკითხვას
   ჩერდება.

   ⚠️ **აღდგენა აკრეფილ სიტყვას ითხოვს** (`/purge`-ის წესი): ის მიმდინარე
   ბაზას **ცვლის** და ერთი შეცდომით დაჭერილი ღილაკი ბიბლიოთეკას შლის.

   ⚠️ **ცალკე გვერდი აღარ არის**: ეს „ექსპორტ & იმპორტის"
   „ბაზის" ჩანართია (`/transfer?tab=database`; `/backups` იქ გადამისამართდება),
   შენი სიტყვებით — „ბაზის ასლი და რამეც ცალკე რომ მაქვს — აქ შემოიტანე".
   ღილაკები („ატვირთვა", „ასლის შექმნა") სათაურის ზოლიდან პანელის თავში გადმოვიდა.

   ⚠️ **რიგის ღილაკები აიქონი + ტექსტია** (`h-9`, წაშლა — `destructiveOutline`):
   ოთხი მხოლოდ-აიქონი `ghost` ღილაკი `title`-ით იკითხებოდა და აღდგენა
   ჩამოტვირთვას ჰგავდა. ღილაკები და მარჯვენა კლიკის მენიუ **ერთი სიიდან**
   იხატება (`actions`), ე.ი. ორივეგან ერთი სახელი და ერთი პირობაა. სია
   გვერდებადაა (`useClientPages`, 10) — ავტომატური ასლი ყოველდღე ემატება.
   „შენიშვნა" „დამპის აღების" გვერდითაა (ის მხოლოდ ახალ დამპს ეხება),
   შესავალი კი სათაურის `i`-შია.
   ============================================================ */

const POLL_MS = 4000

const NO_BACKUPS: Backup[] = []

export function BackupsPanel() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { date, dateTime } = useDateFormat()
  const fileRef = useRef<HTMLInputElement>(null)

  const [note, setNote] = useState('')
  const [restoring, setRestoring] = useState<Backup | null>(null)
  // ასლის ვიუერი (ცხრილები, რიგები, ნაწილობრივი აღდგენა)
  const [viewing, setViewing] = useState<Backup | null>(null)
  const [typed, setTyped] = useState('')

  const list = useQuery({
    queryKey: ['backups'],
    queryFn: fetchBackups,
    enabled: isAdmin,
    // ⚠️ მიტოვებული გაშვება თვითონ ვერ დასრულდება — მასზე ლოდინი უსასრულოა
    refetchInterval: (q) =>
      q.state.data?.data.some((b) => b.status === 'running' && !b.stale) ? POLL_MS : false,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['backups'] })

  const start = useMutation({
    mutationFn: () => createBackup({ note: note.trim() || undefined }),
    onSuccess: () => {
      setNote('')
      toast({ title: t('backups.started'), variant: 'success' })
      invalidate()
    },
    onError: (e) =>
      toast({
        title: isApiCode(e, 'mysqldump_unavailable') ? t('backups.unavailable') : t('toast.error'),
        variant: 'error',
      }),
  })

  const upload = useMutation({
    mutationFn: (file: File) => importBackup(file),
    onSuccess: () => {
      toast({ title: t('backups.imported'), variant: 'success' })
      invalidate()
    },
    onError: (e) =>
      toast({
        title: isApiCode(e, 'invalid_backup_file') ? t('backups.invalidFile') : t('toast.error'),
        variant: 'error',
      }),
  })

  const runRestore = useMutation({
    mutationFn: (id: number) => restoreBackup(id),
    onSuccess: () => {
      setRestoring(null)
      setTyped('')
      toast({ title: t('backups.restoreStarted'), description: t('backups.recalcHint'), variant: 'success' })
      invalidate()
    },
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteBackup(id),
    onSuccess: invalidate,
  })

  const meta = list.data?.meta
  const rows = list.data?.data ?? NO_BACKUPS
  const { shown, pagination } = useClientPages(rows, LIST_PAGE_SIZE)

  if (!isAdmin) {
    return <EmptyState title={t('roles.noAccess')} />
  }

  return (
    <section data-testid="backups-panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Database className="size-5 text-muted-foreground" />
            {t('backups.title')}
            <InfoHint info={t('backups.intro')} />
          </h2>
          {meta && <p className="text-sm text-muted-foreground">{t('backups.subtitle', { database: meta.database })}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {t('backups.import')}
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".sql,.gz,application/sql,application/gzip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload.mutate(file)
          e.target.value = ''
        }}
      />

      {/* ⚠️ „ინსტრუმენტი არ მაქვს" ღილაკის ჩავარდნით კი არ უნდა აღმოჩნდეს —
          გვერდი ამას წინასწარ წერს (`ytdlp_unavailable`-ის წესი). */}
      {meta && !meta.available && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            {t('backups.unavailableHint')}
            {meta.driver !== 'mysql' && <> {t('backups.driverHint', { driver: meta.driver })}</>}
          </span>
        </p>
      )}

      {/* ===== დაგეგმილი ასლი =====
          ⚠️ **გადამრთველი არ არის და ეს განზრახია.** ეს ინსტალაციის
          პარამეტრია (`BACKUP_AUTO` `.env`-ში) და არა მომხმარებლის: ორი
          სუპერ-ადმინის შემთხვევაში „ვისი გადამრთველია" კითხვას პასუხი
          არ აქვს, ცალკე გლობალური ცხრილის დაბადება კი ერთი ბულევისთვის
          ზედმეტი მექანიზმია. იგივე წესი, რაც `UploadLimitsCard`-ს აქვს.
          ⚠️ **ბოლო გაშვება ნამდვილი ასლიდან იკითხება**: „ტასკი არსებობს"
          და „ასლი გაკეთდა" ორი სხვადასხვა ფაქტია — სწორედ ამ განსხვავებამ
          დატოვა გარე PowerShell-ტასკი ექვსიდან ოთხ დღეს უხმოდ გაუშვებელი. */}
      {/* ახალი დამპი: შენიშვნა და ღილაკი ერთ რიგში; ქვემოთ — დაგეგმილი ასლის ერთი ხაზი */}
      <div className="mb-5 rounded-xl border border-border bg-card p-4" data-testid="backups-create">
        <div className="flex flex-wrap items-end gap-2">
          <FormField label={t('backups.note')} htmlFor="backup-note" className="min-w-48 flex-1 sm:max-w-md">
            <Input
              id="backup-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('backups.notePlaceholder')}
              className="h-9"
            />
          </FormField>
          <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending || meta?.available === false}>
            {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {t('backups.create')}
          </Button>
        </div>

        {meta && (
          <p
            className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-sm"
            data-testid="backups-auto"
          >
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{t('backups.auto')}</span>
            <InfoHint info={t('backups.autoHint')} />
            <span className={meta.auto.enabled ? 'text-muted-foreground' : 'text-destructive'}>
              {meta.auto.enabled
                ? t('backups.autoOn', { at: meta.auto.at, keep: meta.auto.keep })
                : t('backups.autoOff')}
            </span>
            <span className="text-muted-foreground">
              ·{' '}
              {meta.auto.last_at
                ? t('backups.autoLast', { when: date(meta.auto.last_at) })
                : t('backups.autoNever')}
            </span>
          </p>
        )}
      </div>

      {list.isLoading && <div className="h-32 animate-pulse rounded-xl bg-muted" />}

      {!list.isLoading && rows.length === 0 && (
        <EmptyState icon={<Database className="size-6" />} title={t('backups.empty')} hint={t('backups.emptyHint')} />
      )}

      <ul className="space-y-2" data-testid="backups-list">
        {shown.map((b) => {
          const ready = b.status === 'ready'
          /* რიგის ღილაკები და მარჯვენა ღილაკი ერთი სიიდან:
             გადმოწერა · შიგთავსი · აღდგენა · — · წაშლა */
          const actions: MenuAction[] = [
            { key: 'download', label: t('actions.download'), icon: Download, disabled: !ready, run: () => downloadBackup(b) },
            // „რა არის შიგნით"; ცხრილების სია აღდგენას არ მოითხოვს
            { key: 'view', label: t('backups.view'), icon: Table2, disabled: !ready, run: () => setViewing(b) },
            {
              key: 'restore',
              label: t('backups.restore'),
              icon: RotateCcw,
              disabled: !ready || meta?.restore_available === false,
              run: () => {
                setTyped('')
                setRestoring(b)
              },
            },
            {
              key: 'delete',
              label: t('actions.delete'),
              icon: MENU_ICONS.delete,
              danger: true,
              separator: true,
              run: async () => {
                const ok = await confirm({
                  title: t('backups.deleteTitle'),
                  description: t('backups.deleteHint', { name: b.name ?? '' }),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(b.id)
              },
            },
          ]
          return (
          <RecordContextMenu key={b.id} actions={actions}>
          <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
            <Database className="size-4 shrink-0 text-muted-foreground" />

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {dateTime(b.created_at)}
                {b.size > 0 && <> · {formatBytes(b.size)}</>}
                {b.tables ? <> · {t('backups.tables', { n: b.tables })}</> : null}
                {b.user && <> · {b.user.username ?? b.user.name}</>}
                {b.note && <> · {b.note}</>}
              </p>
              {b.error && <p className="truncate text-xs text-destructive">{b.error}</p>}
            </div>

            {/* სტატუსი რიგის ღილაკების სიმაღლისაა და მათ წინ დგას */}
            <div className="flex flex-wrap items-center gap-1.5" data-testid="backup-actions">
              <StatusBadge backup={b} size="row" />
              {actions.map(({ key, label, icon: Icon, disabled, danger, run }) => (
                <Button
                  key={key}
                  type="button"
                  variant={danger ? 'destructiveOutline' : 'outline'}
                  size="sm"
                  disabled={disabled}
                  onClick={() => run?.()}
                >
                  {Icon && <Icon className="size-4" />}
                  {label}
                </Button>
              ))}
            </div>
          </li>
          </RecordContextMenu>
          )
        })}
      </ul>
      <Pagination {...pagination} className="mt-3" />

      {viewing && <BackupViewer backup={viewing} onClose={() => setViewing(null)} />}

      {restoring && (
        <ModalShell
          title={t('backups.restoreTitle')}
          onClose={() => setRestoring(null)}
        >
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{t('backups.restoreWarning', { name: restoring.name ?? '' })}</span>
            </p>
            <p className="text-sm text-muted-foreground">{t('backups.restoreSafety')}</p>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t('backups.typeToConfirm')}</span>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="RESTORE" autoFocus />
            </label>

            <ModalFooter>
              <Button variant="outline" onClick={() => setRestoring(null)}>
                {t('actions.cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={typed !== 'RESTORE' || runRestore.isPending}
                onClick={() => runRestore.mutate(restoring.id)}
              >
                {runRestore.isPending && <Loader2 className="size-4 animate-spin" />}
                {t('backups.restore')}
              </Button>
            </ModalFooter>
          </div>
        </ModalShell>
      )}
    </section>
  )
}

/**
 * ⚠️ **ოთხი მდგომარეობა და არა სამი.** „მიმდინარეობს" და „პროცესი მოკვდა"
 * ერთნაირად `running`-ია ბაზაში, მაგრამ მომხმარებელს სხვადასხვა რამეს
 * ეუბნება: პირველზე ელოდები, მეორეზე — თავიდან უშვებ.
 */
function StatusBadge({ backup, size }: { backup: Backup; size?: BadgeSize }) {
  const { t } = useTranslation()

  if (backup.status === 'running' && backup.stale) {
    return (
      <Badge size={size} className="bg-[color-mix(in_oklab,var(--icon-warn)_20%,transparent)]">
        {t('backups.status.stale')}
      </Badge>
    )
  }

  if (backup.status === 'running') {
    return (
      <Badge size={size} className="bg-secondary">
        <Loader2 className="size-3 animate-spin" />
        {t('backups.status.running')}
      </Badge>
    )
  }

  if (backup.status === 'failed') {
    return (
      <Badge size={size} className="bg-[color-mix(in_oklab,var(--destructive)_16%,transparent)]">
        {t('backups.status.failed')}
      </Badge>
    )
  }

  return (
    <Badge size={size} className="bg-[color-mix(in_oklab,var(--icon-ok)_18%,transparent)]">
      {t('backups.status.ready')}
    </Badge>
  )
}
