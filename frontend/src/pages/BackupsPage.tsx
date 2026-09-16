import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Database,
  Download,
  Table2,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
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
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { BackupViewer } from '@/components/backups/BackupViewer'
import { ModalShell } from '@/components/ui/modal-shell'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { formatBytes } from '@/lib/utils'
import { isApiCode } from '@/lib/errors'

/* ============================================================
   **ბაზის დამპი და აღდგენა (Tasks §22).**

   ⚠️ **გამოკითხვა მხოლოდ მაშინ, როცა რამე მართლა მიმდინარეობს** — ვიდეოს
   ჩამოწერის იგივე წესი (§7.1). მუდმივი polling ერთნაკადიან `artisan serve`-ს
   ტყუილად აჯდება, ხოლო **მიტოვებული** `running` თვითონ ვერასდროს შეიცვლება,
   ე.ი. მასზე გამოკითხვა უსასრულო იქნებოდა — ამიტომ `stale` გამოკითხვას
   ჩერდება.

   ⚠️ **აღდგენა აკრეფილ სიტყვას ითხოვს** (`/purge`-ის წესი): ის მიმდინარე
   ბაზას **ცვლის** და ერთი შეცდომით დაჭერილი ღილაკი ბიბლიოთეკას შლის.
   ============================================================ */

const POLL_MS = 4000

export function BackupsPage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { dateTime } = useDateFormat()
  const fileRef = useRef<HTMLInputElement>(null)

  const [note, setNote] = useState('')
  const [restoring, setRestoring] = useState<Backup | null>(null)
  // §11 — ასლის ვიუერი (ცხრილები, რიგები, ნაწილობრივი აღდგენა)
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

  if (!isAdmin) {
    return (
      <PageContainer>
        <PageHeader tool="backups" title={t('backups.title')} />
        <EmptyState title={t('roles.noAccess')} />
      </PageContainer>
    )
  }

  const meta = list.data?.meta
  const rows = list.data?.data ?? []

  return (
    <PageContainer>
      <PageHeader
        tool="backups"
        title={t('backups.title')}
        subtitle={meta ? t('backups.subtitle', { database: meta.database }) : undefined}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {t('backups.import')}
            </Button>
            <Button onClick={() => start.mutate()} disabled={start.isPending || meta?.available === false}>
              {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {t('backups.create')}
            </Button>
          </>
        }
      />

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

      <div className="mb-5 rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{t('backups.intro')}</p>
        <label className="block max-w-md">
          <span className="mb-1 block text-sm font-medium">{t('backups.note')}</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('backups.notePlaceholder')} />
        </label>
      </div>

      {list.isLoading && <div className="h-32 animate-pulse rounded-xl bg-muted" />}

      {!list.isLoading && rows.length === 0 && (
        <EmptyState icon={<Database className="size-6" />} title={t('backups.empty')} hint={t('backups.emptyHint')} />
      )}

      <ul className="space-y-2">
        {rows.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
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

            <StatusBadge backup={b} />

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadBackup(b)}
                disabled={b.status !== 'ready'}
                title={t('actions.download')}
              >
                <Download className="size-4" />
              </Button>
              {/* §11 — „რა არის შიგნით"; ცხრილების სია აღდგენას არ მოითხოვს */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewing(b)}
                disabled={b.status !== 'ready'}
                title={t('backups.viewerTitle')}
              >
                <Table2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTyped('')
                  setRestoring(b)
                }}
                disabled={b.status !== 'ready' || meta?.restore_available === false}
                title={t('backups.restore')}
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const ok = await confirm({
                    title: t('backups.deleteTitle'),
                    description: t('backups.deleteHint', { name: b.name ?? '' }),
                    variant: 'destructive',
                  })
                  if (ok) remove.mutate(b.id)
                }}
                title={t('actions.delete')}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

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

            <div className="flex justify-end gap-2">
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
            </div>
          </div>
        </ModalShell>
      )}
    </PageContainer>
  )
}

/**
 * ⚠️ **ოთხი მდგომარეობა და არა სამი.** „მიმდინარეობს" და „პროცესი მოკვდა"
 * ერთნაირად `running`-ია ბაზაში, მაგრამ მომხმარებელს სხვადასხვა რამეს
 * ეუბნება: პირველზე ელოდები, მეორეზე — თავიდან უშვებ (§7.1-ის ნასწავლი).
 */
function StatusBadge({ backup }: { backup: Backup }) {
  const { t } = useTranslation()

  if (backup.status === 'running' && backup.stale) {
    return <Badge className="bg-[color-mix(in_oklab,var(--icon-warn)_20%,transparent)]">{t('backups.status.stale')}</Badge>
  }

  if (backup.status === 'running') {
    return (
      <Badge className="bg-secondary">
        <Loader2 className="size-3 animate-spin" />
        {t('backups.status.running')}
      </Badge>
    )
  }

  if (backup.status === 'failed') {
    return <Badge className="bg-[color-mix(in_oklab,var(--destructive)_16%,transparent)]">{t('backups.status.failed')}</Badge>
  }

  return <Badge className="bg-[color-mix(in_oklab,var(--icon-ok)_18%,transparent)]">{t('backups.status.ready')}</Badge>
}
