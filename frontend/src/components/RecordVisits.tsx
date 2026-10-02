import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LogIn } from 'lucide-react'
import {
  fetchRecordVisits,
  recordRecordVisit,
  visitsKey,
  type VisitEntry,
  type VisitSource,
  type VisitType,
} from '@/api/visits'
import { useDateFormat } from '@/lib/dates'
import { sessionGet, sessionSet } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalShell } from '@/components/ui/modal-shell'
import { EmptyState } from '@/components/ui/empty-state'

/* ============================================================
   **„შევედი N-ჯერ" — ყველა ჩანაწერზე** (Tasks §10, Q2).

   შენი სიტყვები: „ფილმებში მინდა შესვლების მთვლელი; ეს მთვლელი მჭირდება
   აბსოლუტურად ყველგან და ყველაფერზე, და ამის ლოგებიც — ვინ, სად შევიდა,
   რამდენჯერ".

   სამი ნაწილი:
   - `useRecordVisit(type, id)` — დეტალის **გახსნაზე** ერთხელ აგზავნის
     „შევედი"-ს (გვერდი: `MoviePage`-ის მაუნთი; მოდალი: ფანჯრის გახსნა).
     ⚠️ სესიაში იმავე ჩანაწერზე განმეორება **აქვე** იგნორირდება
     (`sessionStorage`), თორემ ყოველი ხელახალი რენდერი რექვესთს გაგზავნიდა;
     საბოლოო წესი („საათში ერთხელ") მაინც სერვერისაა.
   - `VisitBadge` — ბეჯი „შევედი 7-ჯერ" + `i` „ბოლოს — 2 ოქტ. 14:20"; დაჭერით
     ჟურნალის ფანჯარა (ვინ · როდის · საიდან).
   - `VisitCount` — სტრიქონისა და ბარათის პატარა მრიცხველი (`LogIn` აიქონი;
     თვალის აიქონი განზრახ არა — §12).
   ============================================================ */

function sessionKey(type: VisitType, id: number): string {
  return `visit:${type}:${id}`
}

/**
 * დეტალის გახსნაზე ერთი „შევედი". `id` ცარიელზე (ფანჯარა ჯერ არ ჩატვირთულა)
 * არაფერს აკეთებს.
 */
export function useRecordVisit(type: VisitType, id: number | null | undefined, enabled = true): void {
  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled || id == null) return

    const key = sessionKey(type, id)
    if (sessionGet(key)) return

    sessionSet(key, '1')

    void recordRecordVisit(type, id).then((summary) => {
      if (summary) qc.setQueryData(visitsKey(type, id), summary)
    })
  }, [enabled, id, qc, type])
}

/** წყაროს სიტყვა — ბიბლიოთეკა · საჯარო პროფილი · გაზიარების ბმული */
function sourceKey(source: VisitSource): string {
  return `visits.source.${source}`
}

/**
 * ბეჯი დეტალის თავში (ყველა მოდალი, ფილმის გვერდი, ფლეილისტი). თვითონვე
 * აგზავნის „შევედი"-ს — ე.ი. ფანჯარაში ერთი ხაზი საკმარისია.
 */
export function VisitBadge({ type, id, className }: { type: VisitType; id: number; className?: string }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()
  const [open, setOpen] = useState(false)

  useRecordVisit(type, id)

  const query = useQuery({
    queryKey: visitsKey(type, id),
    queryFn: () => fetchRecordVisits(type, id),
    staleTime: 60_000,
  })

  const count = query.data?.count ?? 0

  return (
    <>
      <span className={cn('inline-flex items-center gap-1', className)}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-secondary px-2 text-xs font-medium tabular-nums text-secondary-foreground"
          title={t('visits.open')}
          data-testid="visit-badge"
        >
          <LogIn className="size-3.5" aria-hidden="true" />
          {t('visits.count', { count })}
        </button>
        {query.data?.last_at && <InfoHint info={t('visits.last', { when: dateTime(query.data.last_at) })} />}
      </span>

      {open && (
        <VisitLog
          count={count}
          entries={query.data?.entries ?? []}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** სტრიქონის/ბარათის პატარა მრიცხველი — ნულზე არაფერი იხატება */
export function VisitCount({ value, className }: { value: number | null | undefined; className?: string }) {
  const { t } = useTranslation()

  if (!value) return null

  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted-foreground', className)}
      title={t('visits.count', { count: value })}
      data-testid="visit-count"
    >
      <LogIn className="size-3.5" aria-hidden="true" />
      {value}
    </span>
  )
}

/** ჟურნალის ფანჯარა: ვინ · როდის · საიდან (ბოლო 20) */
function VisitLog({ count, entries, onClose }: { count: number; entries: VisitEntry[]; onClose: () => void }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()

  const who = (entry: VisitEntry): string => {
    if (entry.is_me) return t('visits.me')
    if (entry.viewer) return entry.viewer.name || `@${entry.viewer.username}`
    return entry.viewer_name ?? t('visits.anonymous')
  }

  return (
    <ModalShell title={t('visits.title')} onClose={onClose} hint={t('visits.hint')}>
      <div className="mt-4">
        {entries.length === 0 ? (
          <EmptyState title={t('visits.empty')} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-medium">{who(entry)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t(sourceKey(entry.source))}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{dateTime(entry.visited_at)}</span>
              </li>
            ))}
          </ul>
        )}
        {count > entries.length && (
          <p className="mt-2 text-xs text-muted-foreground">{t('visits.showingLast', { count: entries.length, total: count })}</p>
        )}
      </div>
    </ModalShell>
  )
}
