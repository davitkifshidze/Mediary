import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Database, Loader2, RotateCcw, ShieldAlert, Table2 } from 'lucide-react'
import {
  closeBackupInspect,
  fetchBackupRows,
  fetchBackupTables,
  inspectBackup,
  restoreBackupRow,
  restoreBackupTable,
  type Backup,
  type BackupTable,
} from '@/api/backups'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'
import { cn, formatBytes } from '@/lib/utils'

/* ============================================================
   **ასლის ვიუერი და ნაწილობრივი აღდგენა (Tasks §11).**

   შენი სიტყვები: „ბაზის ასლში … იყოს ასევე ნახო რა თეიბლებს შეიცავს და
   კონკრეტული თეიბლის ჩანაწერების ნახვა — რამე ვიუვერი რომ იყოს; ასევე
   შეგეძლოს კონკრეტული თეიბლის აღდგენა, ან კონკრეტული ჩანაწერის, ან სრული".

   ⚠️ **ორი რეჟიმია და ისინი არ უნდა აირიოს.** *დახურული* ასლი ცხრილების
   სიას მაინც აჩვენებს (`table_map` — დამპის ერთი გავლიდან, §11.1);
   *გახსნილი* კი ნამდვილ SQL-ს ეკითხება (გვერდები, სორტირება, ფილტრი).
   ღილაკი ცხადად ამბობს, რომელში ხარ.

   ⚠️ **გახსნა დისკზე მონაცემის მეორე ასლს ქმნის და მას კვოტა ვერ ხედავს** —
   ეს ინტერფეისში წერია და არა მხოლოდ კოდის კომენტარში. დახურვა შლის.

   ⚠️ **`blocked` ცხრილს ღილაკი საერთოდ არ აქვს** (`users` და
   ინფრასტრუქტურა): დახატული და გამორთული ღილაკი „ცადე და ვნახოთ"-ს
   ეუბნება, ხოლო აქ პასუხი უცვლელია — `users`-ზე 61 შემომავალი უცხო
   გასაღები მიდის.

   ⚠️ **`warns` ცხრილზე გაფრთხილება რიცხვით ჩანს**: რომელი ცხრილები
   დაზარალდება კასკადით. ეს backend-იდან მოდის (`information_schema`) და
   არა ხელით დაწერილი სიიდან — სქემა იცვლება.
   ============================================================ */

const SCOPE_TONE: Record<string, string> = {
  safe: 'border-border',
  warns: 'border-[var(--icon-warn)]',
  blocked: 'border-destructive/50',
}

export function BackupViewer({ backup, onClose }: { backup: Backup; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [table, setTable] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  /** §11.4 — რომელი ცხრილის აღდგენას ვითხოვთ + აკრეფილი სიტყვა */
  const [restoring, setRestoring] = useState<string | null>(null)
  const [typed, setTyped] = useState('')

  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const tables = useQuery({
    queryKey: ['backup-tables', backup.id],
    queryFn: () => fetchBackupTables(backup.id),
  })

  const open = tables.data?.open ?? false

  const rows = useQuery({
    queryKey: ['backup-rows', backup.id, table, page],
    queryFn: () => fetchBackupRows(backup.id, { table: table!, page, per_page: 50 }),
    enabled: open && !!table,
  })

  const inspect = useMutation({
    mutationFn: () => inspectBackup(backup.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backup-tables', backup.id] }),
    onError: fail,
  })

  const close = useMutation({
    mutationFn: () => closeBackupInspect(backup.id),
    onSuccess: () => {
      setTable(null)
      qc.invalidateQueries({ queryKey: ['backup-tables', backup.id] })
    },
    onError: fail,
  })

  const restoreTable = useMutation({
    mutationFn: (name: string) => restoreBackupTable(backup.id, name, typed),
    onSuccess: (result) => {
      setRestoring(null)
      setTyped('')
      toast({
        title: t('backups.tableRestored', { deleted: result.deleted, inserted: result.inserted }),
        variant: 'success',
      })
      qc.invalidateQueries({ queryKey: ['backups'] })
      qc.invalidateQueries({ queryKey: ['backup-rows', backup.id] })
    },
    onError: fail,
  })

  const restoreRow = useMutation({
    mutationFn: ({ name, key }: { name: string; key: Record<string, unknown> }) =>
      restoreBackupRow(backup.id, name, key),
    onSuccess: () => toast({ title: t('backups.rowRestored'), variant: 'success' }),
    onError: fail,
  })

  const current = tables.data?.data.find((x) => x.name === table)

  const columns = useMemo<DataColumn<Record<string, unknown>>[]>(() => {
    const names = rows.data?.columns ?? []

    const cells: DataColumn<Record<string, unknown>>[] = names.map((name) => ({
      key: name,
      label: name,
      value: (row) => String(row[name] ?? ''),
      render: (row) => (
        <span className="block max-w-56 truncate" title={String(row[name] ?? '')}>
          {row[name] === null ? <em className="text-muted-foreground">NULL</em> : String(row[name])}
        </span>
      ),
    }))

    /* ⚠️ ერთი ჩანაწერის აღდგენას **აკრეფილი სიტყვა არ აქვს**: ის
       შექცევადია და სექციის საკუთარ ბადეში წაშლას უტოლდება. */
    if (table && current?.scope !== 'blocked' && names.includes('id')) {
      cells.push({
        key: '__restore',
        label: t('backups.restoreRow'),
        className: 'w-28 text-right',
        render: (row) => (
          <Button
            size="sm"
            variant="outline"
            disabled={restoreRow.isPending}
            onClick={() => restoreRow.mutate({ name: table, key: { id: row.id } })}
          >
            <RotateCcw className="size-3.5" />
            {t('backups.restoreRow')}
          </Button>
        ),
      })
    }

    return cells
  }, [rows.data, table, current, restoreRow, t])

  return (
    <ModalShell title={t('backups.viewerTitle')} onClose={onClose} size="full">
      <div className="mt-4 space-y-4">
        {/* ---------- რეჟიმი ---------- */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <Database className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-sm">
            {open ? t('backups.viewerOpen') : t('backups.viewerClosed')}
          </span>
          <InfoHint info={t('backups.viewerHint')} critical={t('backups.viewerWarn')} />
          {open ? (
            <Button variant="outline" size="sm" disabled={close.isPending} onClick={() => close.mutate()}>
              {close.isPending && <Loader2 className="size-4 animate-spin" />}
              {t('backups.viewerClose')}
            </Button>
          ) : (
            <Button size="sm" disabled={inspect.isPending} onClick={() => inspect.mutate()}>
              {inspect.isPending && <Loader2 className="size-4 animate-spin" />}
              {t('backups.viewerOpenAction')}
            </Button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          {/* ---------- ცხრილები ---------- */}
          <div className="fb-scroll max-h-[60vh] space-y-1 overflow-y-auto">
            {tables.isLoading && <div className="h-24 animate-pulse rounded-md bg-muted" />}
            {tables.data?.data.length === 0 && (
              <EmptyState icon={<Table2 className="size-6" />} title={t('backups.noTables')} />
            )}

            {tables.data?.data.map((row) => (
              <TableRow
                key={row.name}
                row={row}
                active={row.name === table}
                open={open}
                onPick={() => {
                  setTable(row.name)
                  setPage(1)
                }}
                onRestore={() => {
                  setRestoring(row.name)
                  setTyped('')
                }}
              />
            ))}
          </div>

          {/* ---------- რიგები ---------- */}
          <div className="min-w-0">
            {!open ? (
              <EmptyState
                icon={<Database className="size-6" />}
                title={t('backups.viewerClosed')}
                hint={t('backups.viewerHint')}
                actions={
                  <Button size="sm" disabled={inspect.isPending} onClick={() => inspect.mutate()}>
                    {t('backups.viewerOpenAction')}
                  </Button>
                }
              />
            ) : !table ? (
              <EmptyState icon={<Table2 className="size-6" />} title={t('backups.pickTable')} />
            ) : rows.isLoading ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* §11.4 — რომელი ცხრილები დაზარალდება (კასკადები) */}
                {!!rows.data?.meta.children.length && (
                  <p className="mb-3 flex items-start gap-2 rounded-md border border-[var(--icon-warn)]/50 bg-[var(--icon-warn)]/10 px-3 py-2 text-xs">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {t('backups.cascadeWarn', { count: rows.data.meta.children.length })}
                      {' '}
                      {rows.data.meta.children.slice(0, 6).map((c) => c.table).join(', ')}
                      {rows.data.meta.children.length > 6 ? ' …' : ''}
                    </span>
                  </p>
                )}

                <DataTable
                  rows={rows.data?.data ?? []}
                  columns={columns}
                  rowKey={(row) => String(row.id ?? JSON.stringify(row))}
                  pageSize={25}
                  minWidth="900px"
                  empty={t('backups.noRows')}
                />

                {/* ⚠️ სერვერის გვერდები ცალკეა: `DataTable` **ჩამოტვირთულ**
                    სიაზე მუშაობს, ეს კი ბაზის ცხრილია და ერთ პასუხში არ ჯდება. */}
                {!!rows.data && rows.data.meta.total > rows.data.meta.per_page && (
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      ←
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t('backups.rowRange', {
                        from: (page - 1) * rows.data.meta.per_page + 1,
                        to: Math.min(page * rows.data.meta.per_page, rows.data.meta.total),
                        total: rows.data.meta.total,
                      })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page * rows.data.meta.per_page >= rows.data.meta.total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      →
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ⚠️ **აკრეფილი სიტყვა ცხრილის სახელია და არა `RESTORE`** (§11.4):
          ღილაკიდან გადმოსაწერი სიტყვა ყოველთვის ერთი და იგივეა და თითს
          ავტომატურად აკრეფინებს. დიალოგი ამ კომპონენტის ერთადერთ `return`-შია
          (`GroupsCut`-ის ცოცხალი ბაგის წესი). */}
      {restoring && (
        <ModalShell
          title={t('backups.restoreTableTitle', { table: restoring })}
          destructive
          onClose={() => setRestoring(null)}
        >
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-muted-foreground">{t('backups.restoreTableHint')}</p>
            <label className="block">
              <span className="mb-1 block font-medium">{t('backups.typeTableName', { table: restoring })}</span>
              <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRestoring(null)}>
                {t('actions.cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={typed !== restoring || restoreTable.isPending}
                onClick={() => restoreTable.mutate(restoring)}
              >
                {restoreTable.isPending && <Loader2 className="size-4 animate-spin" />}
                {t('backups.restoreTable')}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </ModalShell>
  )
}

function TableRow({
  row,
  active,
  open,
  onPick,
  onRestore,
}: {
  row: BackupTable
  active: boolean
  open: boolean
  onPick: () => void
  onRestore: () => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5',
        SCOPE_TONE[row.scope] ?? 'border-border',
        active && 'bg-secondary',
      )}
    >
      <button
        type="button"
        disabled={!open}
        onClick={onPick}
        className="min-w-0 flex-1 cursor-pointer text-left text-sm transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-foreground"
      >
        <span className="block truncate font-medium">{row.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.rows != null
            ? t('backups.rowCount', { count: row.rows })
            : t('backups.insertCount', { count: row.inserts ?? 0 })}
          {row.bytes != null ? ` · ${formatBytes(row.bytes)}` : ''}
        </span>
      </button>

      {/* ⚠️ `blocked`-ს ღილაკი **საერთოდ არ აქვს** — გამორთული ღილაკი
          „ცადე და ვნახოთ"-ს ეუბნება, აქ კი პასუხი უცვლელია */}
      {row.scope === 'blocked' ? (
        <span title={t('backups.blockedHint')}>
          <ShieldAlert className="size-4 shrink-0 text-destructive" />
        </span>
      ) : (
        open && (
          <Button variant="ghost" size="icon" aria-label={t('backups.restoreTable')} title={t('backups.restoreTable')} onClick={onRestore}>
            <RotateCcw className="size-4" />
          </Button>
        )
      )}
    </div>
  )
}
