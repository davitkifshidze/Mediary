import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCheck, Download, Eraser, Loader2, Settings, Share2, Table2 } from 'lucide-react'
import { downloadDatabase, fetchDatabaseTables, type DatabaseFormat, type DatabaseTable } from '@/api/database'
import { errorMessage } from '@/lib/errors'
import { moduleName, useModules } from '@/lib/modules'
import { formatBytes } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CutTabs } from '@/components/ui/cut-tabs'
import { InfoHint } from '@/components/ui/info-hint'
import { ScopeCard, ScopeGroup } from '@/components/ui/scope-card'
import { ModuleIcon } from '@/components/ModuleIcon'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **მთლიანი ბაზის ექსპორტი — ცხრილების არჩევით** (სუპერადმინი).

   შენი სიტყვები: „ან ნიშნავდე, ბაზაში რა თეიბლებიცაა — იმ თეიბლებს, ოღონდ
   ფილმებს სხვა რამე თეიბლი თუ ჭირდება, ბმა იყოს მოცემული, რომ ამასთან ერთად
   ფილმებისთვის სხვა თეიბლის ექსპორტი საჭიროა".

   ⚠️ **ცხრილის მონიშვნა მის საჭიროებებსაც ნიშნავს** (`requires` — სერვერის
   `ModuleTables`-იდან: თარგმანები, ჟანრები, მსახიობები, გალერეა…) და ქვემოთ
   იწერება, რა მოინიშნა; **მოხსნა არ იბლოკება**, მაგრამ თუ სხვა მონიშნულს ის
   სჭირდება — გაფრთხილება ჩნდება („მის გარეშე ასლი არასრული იქნება").
   ⚠️ ჯგუფები: მოდულები (მათი რიგით) → საერთო ცხრილები → სისტემა; საიდუმლოს
   შემცველი ცხრილი (`users`, `user_credentials`…) ცხადად აღნიშნულია.

   ⚠️ **ჯგუფი ბარათია და არა ჩარჩო** („უფრო თანამედროვე UI/UX"): ჯგუფები
   `ScopeCard`-ებად მოდულის ფერში დგას („მონიშნულია / სულ"), ქვემოთ კი
   **არჩეული** ჯგუფის ცხრილები ერთ `max-h-96` სიაშია, ჯგუფის მონიშვნა მის თავში
   წებოვანია. ძველ ბადეში ყველა ჯგუფის ყველა ცხრილი ერთდროულად ეწყო და
   გვერდი უსასრულოდ იზრდებოდა. ფორმატი და ჩამოტვირთვა ბარათის ბოლოს წებოვან
   რიგშია (`ModalFooter`-ის სახე) — გრძელ სიაზე ღილაკი ეკრანს არ სცდება.
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
  const [open, setOpen] = useState<string | null>(null)

  const tables = useMemo(() => q.data?.data ?? [], [q.data])
  const byName = useMemo(() => new Map(tables.map((row) => [row.table, row])), [tables])

  /** მოდულები (სერვერის რიგით) → საერთო → სისტემა */
  const groups = useMemo(() => {
    const order = [...(q.data?.modules ?? []), ...new Set(tables.map((r) => r.owner).filter((o) => o.startsWith('shared:'))), 'system']
    const map = new Map<string, DatabaseTable[]>()
    for (const row of tables) map.set(row.owner, [...(map.get(row.owner) ?? []), row])

    return order.filter((owner) => map.has(owner)).map((owner) => ({ owner, rows: map.get(owner)! }))
  }, [q.data?.modules, tables])

  // უცნობი/გამქრალი ჯგუფი პირველზე ბრუნდება
  const current = groups.find((g) => g.owner === open) ?? groups[0]

  const moduleOf = (owner: string) => all.find((x) => x.key === owner)

  const label = (owner: string) => {
    if (owner === 'system') return t('transfer.db.system')
    if (owner.startsWith('shared:')) return t(`transfer.db.shared.${owner.slice(7)}`)
    const m = moduleOf(owner)

    return m ? moduleName(m, i18n.language) : t(`transfer.db.owner.${owner}`, { defaultValue: owner })
  }

  /** მოდულს თავისი ხატულა აქვს; საერთოს და სისტემას — საერთო ნიშანი მშობლის ფერში */
  const icon = (owner: string) => {
    const m = moduleOf(owner)
    if (m) return <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />
    const Icon = owner === 'system' ? Settings : Share2

    return <Icon className="size-4 text-[var(--mod)]" />
  }

  const pickedIn = (rows: DatabaseTable[]) => rows.filter((r) => picked.has(r.table)).length

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Table2 className="size-5 text-muted-foreground" />
          {t('transfer.db.title')}
          <InfoHint info={t('transfer.db.hint')} />
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPicked(new Set(tables.map((r) => r.table)))} disabled={!tables.length}>
            <CheckCheck className="size-4" />
            {t('transfer.db.all')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPicked(new Set())} disabled={!picked.size}>
            <Eraser className="size-4" />
            {t('transfer.db.none')}
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
      ) : (
        <>
          <div data-testid="database-groups">
            <ScopeGroup>
              {groups.map(({ owner, rows }) => (
                <div key={owner} data-owner={owner}>
                  <ScopeCard
                    size="sm"
                    active={current?.owner === owner}
                    color={moduleOf(owner)?.color ?? null}
                    icon={icon(owner)}
                    label={label(owner)}
                    hint={t('transfer.db.groupPicked', { picked: pickedIn(rows), total: rows.length })}
                    onClick={() => setOpen(owner)}
                  />
                </div>
              ))}
            </ScopeGroup>
          </div>

          {current && (
            <div
              className="fb-scroll mt-3 max-h-96 overflow-y-auto rounded-md border border-border"
              data-testid="database-tables"
              data-owner={current.owner}
            >
              {/* ჯგუფის მონიშვნა სიის თავში წებოვანია */}
              <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-2.5 border-b border-border bg-card px-3 py-2 text-sm font-medium">
                <Checkbox
                  checked={current.rows.every((r) => picked.has(r.table))}
                  onCheckedChange={(v) => setGroup(current.rows, v === true)}
                  aria-label={label(current.owner)}
                />
                {label(current.owner)}
                <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                  {t('transfer.db.groupPicked', { picked: pickedIn(current.rows), total: current.rows.length })}
                </span>
              </label>
              <ul>
                {current.rows.map((row) => (
                  <li key={row.table}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm">
                      <Checkbox checked={picked.has(row.table)} onCheckedChange={(v) => toggle(row, v === true)} aria-label={row.table} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{row.table}</span>
                      {row.sensitive && (
                        <Badge className="bg-destructive/10 text-destructive" title={t('transfer.db.sensitiveHint')}>
                          {t('transfer.db.sensitive')}
                        </Badge>
                      )}
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t('transfer.db.rows', { count: row.rows })}
                        {row.bytes != null && ` · ${formatBytes(row.bytes)}`}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
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

      {/* ფორმატი + ჩამოტვირთვა — ბარათის ბოლოს წებოვანი რიგი (დამკვრელის ზოლის ზემოთ) */}
      <div
        className="sticky bottom-[var(--player-h,0px)] z-30 -mx-4 -mb-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-border bg-card px-4 py-3"
        data-testid="database-export-footer"
      >
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
