import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchAuditLogs, fetchAuditOpens, type AuditFilters, type AuditOpenRow } from '@/api/audit'
import { useDateFormat } from '@/lib/dates'
import { ModalShell } from '@/components/ui/modal-shell'
import { Pagination } from '@/components/ui/pagination'
import { LIST_PAGE_SIZE, usePages } from '@/lib/paged'

/* ============================================================
   **„ვინ რა გახსნა და რამდენჯერ"**.

   შენი სიტყვები: „ეგ მჭირდება აუდიტ ლოგში მხოლოდ: ვინ რა გახსნა და რამდენჯერ
   შევიდა". მომხმარებელი × ჩანაწერი → გახსნების რიცხვი და ბოლო გახსნა; რიგზე
   დაჭერით — სია „ვინ · როდის · საიდან" (ჩვეულებრივი ჟურნალი `action=open`-ით
   და იმავე ჩანაწერისა და ადამიანის ფილტრით).

   ⚠️ ფილტრი ჟურნალის გვერდისაა (ვისი · როდის · ძებნა · მოდული) — ორივე ხედი
   ერთსა და იმავე ჭრილზე დგას, ე.ი. გადართვისას არაფერი „იკარგება".
   ============================================================ */

export function AuditOpens({ filters, moduleName }: { filters: AuditFilters; moduleName: (key: string) => string }) {
  const { t } = useTranslation()
  const fmt = useDateFormat()
  const [detail, setDetail] = useState<AuditOpenRow | null>(null)

  const opensFilters: AuditFilters = { ...filters, actions: undefined }

  // გვერდზე 10: ნომრები + „მეტის ჩვენება"
  const opens = usePages({
    queryKey: ['audit-opens', opensFilters],
    fetchPage: (page) =>
      fetchAuditOpens(opensFilters, page, LIST_PAGE_SIZE).then((r) => ({ items: r.data, total: r.meta.total, lastPage: r.meta.last_page })),
  })
  const isLoading = opens.isLoading

  const rows = opens.items
  const who = (row: AuditOpenRow) => row.user?.username ?? row.user_label ?? t('audit.opens.anonymous')

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">{t('audit.opens.total', { count: opens.total })}</p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" data-testid="audit-opens">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">{t('audit.columns.who')}</th>
              <th className="p-2">{t('audit.columns.subject')}</th>
              <th className="p-2">{t('audit.columns.module')}</th>
              <th className="p-2 text-right">{t('audit.opens.count')}</th>
              <th className="p-2">{t('audit.opens.last')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {t('audit.opens.empty')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={`${row.user_id ?? 'anon'}:${row.subject.type}:${row.subject.id}`}
                onClick={() => setDetail(row)}
                className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40"
              >
                <td className="p-2">{who(row)}</td>
                <td className="max-w-[22rem] truncate p-2">
                  {row.subject.label ?? `#${row.subject.id}`}
                  <span className="ml-1 text-xs text-muted-foreground">{t(`audit.subjects.${row.subject.type}`, row.subject.type)}</span>
                </td>
                <td className="p-2 text-muted-foreground">{row.module ? moduleName(row.module) : '—'}</td>
                <td className="p-2 text-right font-medium tabular-nums">{row.opens}</td>
                <td className="whitespace-nowrap p-2 text-muted-foreground">{fmt.dateTime(row.last_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination className="mt-4" {...opens.pagination} />

      {detail && <OpensDetail row={detail} name={who(detail)} onClose={() => setDetail(null)} />}
    </>
  )
}

/** „ვინ · როდის · საიდან" — ერთი ადამიანის გახსნები ერთ ჩანაწერზე */
function OpensDetail({ row, name, onClose }: { row: AuditOpenRow; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const fmt = useDateFormat()

  const { data, isLoading } = useQuery({
    queryKey: ['audit-open-detail', row.user_id, row.subject.type, row.subject.id],
    queryFn: () =>
      fetchAuditLogs(
        { actions: ['open'], subject_type: row.subject.type, subject_id: row.subject.id, user_id: row.user_id },
        1,
        100,
      ),
  })

  // ⚠️ ანონიმის რიგი `user_id`-ის გარეშეა — ფილტრი მას ვერ ავიწროებს, ამიტომ აქ ირჩევა
  const entries = (data?.data ?? []).filter((entry) => (row.user_id == null ? entry.user == null : true))
  const source = (value: unknown) => (typeof value === 'string' ? t(`audit.opens.source.${value}`, value) : '—')

  return (
    <ModalShell title={t('audit.opens.detailTitle', { name, record: row.subject.label ?? `#${row.subject.id}` })} onClose={onClose}>
      <div className="mt-4">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm" data-testid="audit-open-detail">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="tabular-nums">{fmt.dateTime(entry.created_at)}</span>
                <span className="text-muted-foreground">
                  {source(entry.context?.source)}
                  {entry.ip && <span className="ml-2 text-xs">{entry.ip}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  )
}
