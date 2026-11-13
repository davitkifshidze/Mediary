import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Search, Star, X } from 'lucide-react'
import { fetchBasisPool, type BasisRecord, type SuggestSelection } from '@/api/suggestions'
import { movieTitle } from '@/lib/display'
import type { MediaType } from '@/lib/media'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { PosterImage } from '@/components/PosterImage'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { SelectMark } from '@/components/ui/select-mark'

/* ============================================================
   **საფუძვლის ხელით მონიშვნა** — „შემოთავაზებების" ფანჯარა: არჩეული სტატუსების
   (და „რჩეულის") ჩანაწერები, ძებნით; რასაც მოვნიშნავ, შემოთავაზება ზუსტად იმაზე დგას.

   ⚠️ სია ავზის პირველი ნაწილია (რჩეული → ჩემი ქულა → ბოლოს ნანახი) — დანარჩენი
   ძებნით იძებნება. მონიშნული სათაური სიიდან გასვლის შემდეგაც მონიშნული რჩება
   (id-ები ფანჯარაშია და არა სიაში).
   ⚠️ ცარიელი მონიშვნა ნიშნავს „მთელი ავზი" — სწორედ ამას აკეთებს „მონიშვნის მოხსნა".
   ============================================================ */

export function BasisPicker({
  type,
  selection,
  onApply,
  onClose,
}: {
  type: MediaType
  selection: SuggestSelection
  onApply: (ids: number[]) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [ids, setIds] = useState<number[]>(selection.ids)

  // ძებნა აკრეფის დასრულებას ელოდება
  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 300)
    return () => clearTimeout(id)
  }, [input])

  const pool = useQuery({
    queryKey: [type, 'suggestions', 'basis', { ...selection, ids: [] }, q],
    queryFn: () => fetchBasisPool(type, selection, q),
  })

  const toggle = (id: number) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  return (
    <ModalShell
      title={t('suggest.pick.title')}
      hint={t('suggest.pick.hint', { limit: pool.data?.limit ?? 30 })}
      onClose={onClose}
    >
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('suggest.pick.searchPh')}
          className="w-full pl-9"
          data-testid="basis-search"
        />
      </div>

      {pool.data && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="basis-pool-total">
          {t('suggest.pick.total', { total: pool.data.total })} · {t('suggest.pick.chosen', { count: ids.length })}
        </p>
      )}

      <div className="mt-3">
        {pool.isError ? (
          <QueryErrorState error={pool.error} onRetry={() => void pool.refetch()} />
        ) : pool.isLoading ? null : !pool.data?.data.length ? (
          <EmptyState size="compact" kind="search" title={t('suggest.pick.emptyTitle')} hint={t('suggest.pick.emptyHint')} />
        ) : (
          <ul className="space-y-1.5">
            {pool.data.data.map((record) => (
              <PoolRow key={record.id} record={record} lang={lang} checked={ids.includes(record.id)} onToggle={() => toggle(record.id)} />
            ))}
          </ul>
        )}
      </div>

      <ModalFooter>
        <Button type="button" variant="outline" disabled={ids.length === 0} onClick={() => setIds([])} data-testid="basis-clear">
          <X className="size-4" />
          {t('suggest.pick.clear')}
        </Button>
        <Button type="button" onClick={() => onApply(ids)} data-testid="basis-apply">
          <Check className="size-4" />
          {t('suggest.pick.apply')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

function PoolRow({ record, lang, checked, onToggle }: { record: BasisRecord; lang: 'ka' | 'en'; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        data-kind="row"
        type="button"
        aria-pressed={checked}
        onClick={onToggle}
        className={cn(
          'flex w-full cursor-pointer items-center gap-3 rounded-md border p-2 text-left transition-colors',
          checked ? 'border-primary bg-secondary' : 'border-border bg-card hover:border-primary/40',
        )}
        data-testid="basis-row"
      >
        <SelectMark checked={checked} size="sm" />
        <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
          <PosterImage src={record.poster} alt="" className="h-full w-full" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{movieTitle(record, lang)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {record.year}
            {record.is_favorite && <Star className="size-3.5 fill-[var(--favorite)] text-[var(--favorite)]" />}
          </span>
        </span>
        <StatusBadge status={record.status} className="shrink-0" />
      </button>
    </li>
  )
}
