import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchAuditLogs, fetchAuditProfiles, type AuditFilters, type AuditProfileRow } from '@/api/audit'
import { useDateFormat } from '@/lib/dates'
import { ModalShell } from '@/components/ui/modal-shell'
import { Pagination } from '@/components/ui/pagination'
import { LIST_PAGE_SIZE, usePages } from '@/lib/paged'

/* ============================================================
   **„ვინ შევიდა ვის პროფილში და რა გადმოიტანა"** — მხოლოდ სუპერადმინი.

   სტუმარი × პროფილის მფლობელი → შესვლები, გადმოტანილი ჩანაწერები და ბოლო
   ფაქტი; რიგზე დაჭერით — რა გადმოიტანა (ჟურნალის `import` რიგები იმავე
   სტუმრისა და მფლობელის ფილტრით). ანონიმი ერთ რიგადაა თითო პროფილზე.

   ⚠️ ფილტრი ჟურნალის გვერდისაა (ვისი · როდის · ძებნა) — `AuditOpens`-ის წესი.
   ============================================================ */

export function AuditProfiles({ filters }: { filters: AuditFilters }) {
  const { t } = useTranslation()
  const fmt = useDateFormat()
  const [detail, setDetail] = useState<AuditProfileRow | null>(null)

  const scoped: AuditFilters = { ...filters, actions: undefined, modules: undefined }

  const list = usePages({
    queryKey: ['audit-profiles', scoped],
    fetchPage: (page) =>
      fetchAuditProfiles(scoped, page, LIST_PAGE_SIZE).then((r) => ({ items: r.data, total: r.meta.total, lastPage: r.meta.last_page })),
  })

  const rows = list.items
  const who = (row: AuditProfileRow) => row.user?.username ?? t('audit.opens.anonymous')

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">{t('audit.profiles.total', { count: list.total })}</p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" data-testid="audit-profiles">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">{t('audit.columns.who')}</th>
              <th className="p-2">{t('audit.profiles.owner')}</th>
              <th className="p-2 text-right">{t('audit.profiles.visits')}</th>
              <th className="p-2 text-right">{t('audit.profiles.imports')}</th>
              <th className="p-2">{t('audit.opens.last')}</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {!list.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {t('audit.profiles.empty')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={`${row.user_id ?? 'anon'}:${row.owner}`}
                onClick={() => setDetail(row)}
                className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40"
              >
                <td className="p-2">{who(row)}</td>
                <td className="p-2">@{row.owner}</td>
                <td className="p-2 text-right font-medium tabular-nums">{row.visits}</td>
                <td className="p-2 text-right font-medium tabular-nums">{row.imports}</td>
                <td className="whitespace-nowrap p-2 text-muted-foreground">{fmt.dateTime(row.last_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination className="mt-4" {...list.pagination} />

      {detail && <ImportsDetail row={detail} name={who(detail)} onClose={() => setDetail(null)} />}
    </>
  )
}

/** რა გადმოიტანა ამ სტუმარმა ამ პროფილიდან */
function ImportsDetail({ row, name, onClose }: { row: AuditProfileRow; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const fmt = useDateFormat()

  const { data, isLoading } = useQuery({
    queryKey: ['audit-profile-imports', row.user_id, row.owner],
    queryFn: () => fetchAuditLogs({ actions: ['import'], user_id: row.user_id, owner: row.owner }, 1, 100),
    enabled: row.user_id != null,
  })

  const entries = data?.data ?? []

  return (
    <ModalShell title={t('audit.profiles.detailTitle', { name, owner: row.owner })} onClose={onClose}>
      <div className="mt-4">
        {row.user_id == null || (!isLoading && entries.length === 0) ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('audit.profiles.noImports')}</p>
        ) : isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm" data-testid="audit-profile-imports">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate">
                  {entry.subject?.label ?? `#${entry.subject?.id}`}
                  {entry.subject && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {t(`audit.subjects.${entry.subject.type}`, entry.subject.type)}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-muted-foreground">{fmt.dateTime(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  )
}
