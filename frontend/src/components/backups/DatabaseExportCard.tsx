import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Download, Loader2, Table2 } from 'lucide-react'
import { downloadDatabase, fetchDatabaseTables, type DatabaseFormat, type DatabaseTable } from '@/api/database'
import { errorMessage } from '@/lib/errors'
import { moduleName, useModules } from '@/lib/modules'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CutTabs } from '@/components/ui/cut-tabs'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **მთლიანი ბაზის ექსპორტი — ცხრილების არჩევით** (Tasks §59.4, სუპერადმინი).

   შენი სიტყვები: „ან ნიშნავდე, ბაზაში რა თეიბლებიცაა — იმ თეიბლებს, ოღონდ
   ფილმებს სხვა რამე თეიბლი თუ ჭირდება, ბმა იყოს მოცემული, რომ ამასთან ერთად
   ფილმებისთვის სხვა თეიბლის ექსპორტი საჭიროა".

   ⚠️ **ცხრილის მონიშვნა მის საჭიროებებსაც ნიშნავს** (`requires` — სერვერის
   `ModuleTables`-იდან: თარგმანები, ჟანრები, მსახიობები, გალერეა…) და ქვემოთ
   იწერება, რა მოინიშნა; **მოხსნა არ იბლოკება**, მაგრამ თუ სხვა მონიშნულს ის
   სჭირდება — გაფრთხილება ჩნდება („მის გარეშე ასლი არასრული იქნება").
   ⚠️ ჯგუფები: მოდულები (მათი რიგით) → საერთო ცხრილები → სისტემა; საიდუმლოს
   შემცველი ცხრილი (`users`, `user_credentials`…) ცხადად აღნიშნულია.
   ============================================================ */

export function DatabaseExportCard() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { all } = useModules()
  const q = useQuery({ queryKey: ['database-tables'], queryFn: fetchDatabaseTables })

  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<DatabaseFormat>('json')
  const [added, setAdded] = useState<string[]>([])
  const [warning, setWarning] = useState<{ table: string; by: string[] } | null>(null)

  const tables = useMemo(() => q.data?.data ?? [], [q.data])
  const byName = useMemo(() => new Map(tables.map((row) => [row.table, row])), [tables])

  /** მოდულები (სერვერის რიგით) → საერთო → სისტემა */
  const groups = useMemo(() => {
    const order = [...(q.data?.modules ?? []), ...new Set(tables.map((r) => r.owner).filter((o) => o.startsWith('shared:'))), 'system']
    const map = new Map<string, DatabaseTable[]>()
    for (const row of tables) map.set(row.owner, [...(map.get(row.owner) ?? []), row])

    return order.filter((owner) => map.has(owner)).map((owner) => ({ owner, rows: map.get(owner)! }))
  }, [q.data?.modules, tables])

  const label = (owner: string) => {
    if (owner === 'system') return t('transfer.db.system')
    if (owner.startsWith('shared:')) return t(`transfer.db.shared.${owner.slice(7)}`)
    const m = all.find((x) => x.key === owner)

    return m ? moduleName(m, i18n.language) : t(`transfer.db.owner.${owner}`, { defaultValue: owner })
  }

  const toggle = (row: DatabaseTable, on: boolean) => {
    const next = new Set(picked)
    setWarning(null)
    if (on) {
      const fresh = [row.table, ...row.requires].filter((x) => !next.has(x) && byName.has(x))
      fresh.forEach((x) => next.add(x))
      setAdded(fresh.filter((x) => x !== row.table))
    } else {
      next.delete(row.table)
      setAdded([])
      // ვის სჭირდება — მოხსნა დაშვებულია, მაგრამ ცხადად ითქმება
      const by = [...next].filter((x) => byName.get(x)?.requires.includes(row.table))
      if (by.length) setWarning({ table: row.table, by })
    }
    setPicked(next)
  }

  const setGroup = (rows: DatabaseTable[], on: boolean) => {
    const next = new Set(picked)
    rows.forEach((row) => (on ? [row.table, ...row.requires] : [row.table]).forEach((x) => (on ? next.add(x) : next.delete(x))))
    setAdded([])
    setWarning(null)
    setPicked(next)
  }

  const download = useMutation({
    mutationFn: () => downloadDatabase([...picked], format),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <section className="mb-8 rounded-xl border border-border bg-card p-4" data-testid="database-export">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Table2 className="size-5 text-muted-foreground" />
          {t('transfer.db.title')}
          <InfoHint info={t('transfer.db.hint')} />
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPicked(new Set(tables.map((r) => r.table)))} disabled={!tables.length}>
            {t('transfer.db.all')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPicked(new Set())} disabled={!picked.size}>
            {t('transfer.db.none')}
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="database-groups">
          {groups.map(({ owner, rows }) => {
            const allOn = rows.every((r) => picked.has(r.table))
            return (
              <fieldset key={owner} className="rounded-lg border border-border p-3" data-owner={owner}>
                <legend className="px-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox checked={allOn} onCheckedChange={(v) => setGroup(rows, v === true)} aria-label={label(owner)} />
                    {label(owner)}
                  </label>
                </legend>
                <ul className="space-y-1">
                  {rows.map((row) => (
                    <li key={row.table}>
                      <label className="flex cursor-pointer items-center gap-2 text-xs">
                        <Checkbox checked={picked.has(row.table)} onCheckedChange={(v) => toggle(row, v === true)} aria-label={row.table} />
                        <span className="min-w-0 flex-1 truncate font-mono">{row.table}</span>
                        {row.sensitive && (
                          <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive" title={t('transfer.db.sensitiveHint')}>
                            {t('transfer.db.sensitive')}
                          </span>
                        )}
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {t('transfer.db.rows', { count: row.rows })}
                          {row.bytes != null && ` · ${formatBytes(row.bytes)}`}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )
          })}
        </div>
      )}

      {added.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="database-added">
          {t('transfer.db.autoAdded', { tables: added.join(', ') })}
        </p>
      )}
      {warning && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--icon-warn)]" data-testid="database-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {t('transfer.db.neededBy', { table: warning.table, tables: warning.by.join(', ') })}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <CutTabs
          layout="inline"
          size="sm"
          value={format}
          onChange={(key) => setFormat(key as DatabaseFormat)}
          options={[
            { key: 'json', label: t('transfer.db.formatJson'), hint: t('transfer.db.formatJsonHint'), icon: Download },
            {
              key: 'sql',
              label: t('transfer.db.formatSql'),
              hint: q.data?.sql_available === false ? t('transfer.db.sqlUnavailable') : t('transfer.db.formatSqlHint'),
              icon: Table2,
              disabled: q.data?.sql_available === false,
            },
          ]}
        />
        <Button onClick={() => download.mutate()} disabled={!picked.size || download.isPending}>
          {download.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {t('transfer.db.download', { count: picked.size })}
        </Button>
      </div>
    </section>
  )
}
