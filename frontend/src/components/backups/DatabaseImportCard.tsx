import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileUp, Loader2, Lock, Replace, TriangleAlert, Upload, X } from 'lucide-react'
import {
  discardDatabaseImport,
  inspectDatabaseImport,
  replaceDatabaseTables,
  type DatabaseImportInspect,
  type DatabaseImportTable,
} from '@/api/database'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ბაზის JSON-ის ZIP → ცხრილების ჩანაცვლება** (Tasks §59.6ბ, სუპერადმინი).

   „ბაზის" ექსპორტის (`DatabaseExportCard`) შებრუნება: არქივი იტვირთება,
   ჩანს რა ცხრილებია შიგნით (რიგები, სვეტების სხვაობა), და **არჩეული**
   ცხრილები ჩანაცვლდება.

   ⚠️ **ჩანაცვლება მხოლოდ აქაა** (Q16) — ჩვეულებრივი იმპორტი მხოლოდ ამატებს.
   ⚠️ აკრეფილი `REPLACE` (`RESTORE`-ის წესი) და **უსაფრთხოების ასლი ჯერ** —
   სერვერი ასლის გარეშე არ იწყებს; `users` და ინფრასტრუქტურა აკრძალულია.
   ⚠️ ცხრილის მონიშვნა მის საჭიროებებსაც ნიშნავს (`requires` — მოდულის
   ცხრილები ერთად უნდა ჩანაცვლდეს), ექსპორტის ბარათის იგივე ქცევით.
   ============================================================ */

export function DatabaseImportCard() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [archive, setArchive] = useState<DatabaseImportInspect | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<string[]>([])
  const [typed, setTyped] = useState('')

  const reset = () => {
    setArchive(null)
    setPicked(new Set())
    setAdded([])
    setTyped('')
  }

  const inspect = useMutation({
    mutationFn: (f: File) => inspectDatabaseImport(f),
    onSuccess: (data) => {
      reset()
      setArchive(data)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const replace = useMutation({
    mutationFn: () => replaceDatabaseTables(archive!.token, [...picked], typed),
    onSuccess: (res) => {
      toast({
        title: t('transfer.dbImport.done', { count: Object.keys(res.data).length, id: res.safety_backup_id }),
        description: t('backups.recalcHint'),
        variant: 'success',
      })
      ;['backups', 'database-tables', 'storage'].forEach((key) => qc.invalidateQueries({ queryKey: [key] }))
      reset()
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const usable = (row: DatabaseImportTable) => row.exists && !row.blocked
  const byName = new Map((archive?.tables ?? []).map((row) => [row.table, row]))

  const toggle = (row: DatabaseImportTable, on: boolean) => {
    const next = new Set(picked)
    if (on) {
      const fresh = [row.table, ...row.requires].filter((x) => !next.has(x) && byName.get(x) && usable(byName.get(x)!))
      fresh.forEach((x) => next.add(x))
      setAdded(fresh.filter((x) => x !== row.table))
    } else {
      next.delete(row.table)
      setAdded([])
    }
    setPicked(next)
  }

  const cancel = async () => {
    if (archive) await discardDatabaseImport(archive.token).catch(() => undefined)
    reset()
  }

  return (
    <section className="mb-8 rounded-xl border border-border bg-card p-4" data-testid="database-import">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
        <Replace className="size-5 text-muted-foreground" />
        {t('transfer.dbImport.title')}
        <InfoHint info={t('transfer.dbImport.hint')} />
      </h2>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            reset()
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" />
          {t('import.choose')}
        </Button>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{file ? file.name : t('import.noFile')}</span>
        <Button type="button" size="sm" disabled={!file || inspect.isPending} onClick={() => file && inspect.mutate(file)}>
          {inspect.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          {t('import.read')}
        </Button>
      </div>

      {archive && (
        <div className="mt-4 space-y-3">
          <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3" data-testid="database-import-tables">
            {archive.tables.map((row) => (
              <li key={row.table}>
                <label className={`flex items-center gap-2 text-xs ${usable(row) ? 'cursor-pointer' : 'opacity-60'}`}>
                  <Checkbox
                    checked={picked.has(row.table)}
                    disabled={!usable(row)}
                    onCheckedChange={(v) => toggle(row, v === true)}
                    aria-label={row.table}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono">{row.table}</span>
                  {row.blocked && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('transfer.dbImport.blocked')} />}
                  {!row.exists && <span className="shrink-0 text-destructive">{t('transfer.dbImport.missing')}</span>}
                  {(row.dropped_columns.length > 0 || row.missing_columns.length > 0) && (
                    <InfoHint
                      info={t('transfer.dbImport.columns', {
                        dropped: row.dropped_columns.join(', ') || '—',
                        missing: row.missing_columns.join(', ') || '—',
                      })}
                    />
                  )}
                  <span className="shrink-0 tabular-nums text-muted-foreground">{t('transfer.db.rows', { count: row.rows })}</span>
                </label>
              </li>
            ))}
          </ul>

          {added.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="database-import-added">
              {t('transfer.db.autoAdded', { tables: added.join(', ') })}
            </p>
          )}

          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{t('transfer.dbImport.warning', { count: picked.size })}</span>
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-48 flex-1">
              <span className="mb-1 block text-sm font-medium">{t('backups.typeToConfirm')}</span>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="REPLACE" />
            </label>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={picked.size === 0 || typed !== 'REPLACE' || replace.isPending}
              onClick={() => replace.mutate()}
            >
              {replace.isPending ? <Loader2 className="size-4 animate-spin" /> : <Replace className="size-4" />}
              {t('transfer.dbImport.replace', { count: picked.size })}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={replace.isPending} onClick={cancel}>
              <X className="size-4" />
              {t('import.discard')}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
