import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/* ============================================================
   **გვერდები — „‹ 1 2 3 … 5 [6] 7 … 10 11 12 ›" + „მეტის ჩვენება"**.

   შენი სიტყვები: „10 გვერდი ჩანდეს და გვერდები გამოდიოდეს 1-2-3 … 5-6 …
   10-11-12 — მსგავსი სტილი; ან იყოს მეორე შესაძლებლობაც — იმავე გვერდზე
   აძლევდე მეტის ნახვას". გადაწყვეტილება: **ორივე ერთად** — ნომრები და
   ქვემოთ „მეტის ჩვენება", რეჟიმის ცალკე პარამეტრის გარეშე.

   ⚠️ **ფანჯარა: პირველი სამი · მიმდინარე ±1 · ბოლო სამი**, ყოველ გამოტოვებაზე
   „…" (`pageWindow`). „…"-ზე დაჭერით ნომერი იწერება (Enter — გადასვლა, Esc —
   გაუქმება) — 100-გვერდიან სიაში შუაში ასე მიდიხარ.

   ⚠️ **„მეტის ჩვენების" შემდეგ ნაჩვენებია დიაპაზონი** (`from…page`): ყველა
   ჩატვირთული გვერდი ერთნაირად ინიშნება, „‹" დიაპაზონის წინა გვერდზე მიდის.
   ============================================================ */

/** ნომრების ფანჯარა; `null` — „…" */
export function pageWindow(current: number, last: number): (number | null)[] {
  const keep = [1, 2, 3, current - 1, current, current + 1, last - 2, last - 1, last]
  const pages = [...new Set(keep.filter((p) => p >= 1 && p <= last))].sort((a, b) => a - b)

  const out: (number | null)[] = []
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push(null)
    out.push(p)
  })
  return out
}

export interface PaginationProps {
  /** მიმდინარე — ბოლოს ჩატვირთული გვერდი */
  page: number
  /** „მეტის ჩვენების" შემდეგ ნაჩვენები პირველი გვერდი (ნაგულისხმევად — `page`) */
  from?: number
  lastPage: number
  /** „სულ N"; `null` — ჯამი უცნობია (TMDB-ის „აღმოაჩინე" — პოსტერის გარეშე ჩანაწერები იფილტრება) */
  total: number | null
  onPage: (page: number) => void
  /** „მეტის ჩვენება" — შემდეგი გვერდი ქვემოთ ემატება; გარეშე — მხოლოდ ნომრები */
  onMore?: () => void
  moreLoading?: boolean
  className?: string
}

export function Pagination({ page, from = page, lastPage, total, onPage, onMore, moreLoading, className }: PaginationProps) {
  const { t } = useTranslation()
  /** რომელი „…" გახდა ველი (ფანჯრის ინდექსი) */
  const [typing, setTyping] = useState<number | null>(null)

  // ცარიელ სიაზე ამ ზოლს საქმე არ აქვს — იქ `EmptyState` დგას
  if (total === 0 || (total === null && lastPage <= 1)) return null

  const go = (target: number) => {
    const next = Math.min(lastPage, Math.max(1, Math.round(target)))
    if (next !== page || from !== page) onPage(next)
  }

  return (
    <nav aria-label={t('pagination.label')} className={cn('mt-6 flex flex-col items-center gap-2', className)} data-testid="pagination">
      {lastPage > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-9 px-0"
            disabled={from <= 1}
            aria-label={t('pagination.prev')}
            onClick={() => go(from - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>

          {pageWindow(page, lastPage).map((p, i) =>
            p === null ? (
              typing === i ? (
                <PageInput
                  key={`gap-${i}`}
                  last={lastPage}
                  onDone={(target) => {
                    setTyping(null)
                    if (target) go(target)
                  }}
                />
              ) : (
                <Button
                  key={`gap-${i}`}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-9 px-0 text-muted-foreground"
                  aria-label={t('pagination.jump')}
                  title={t('pagination.jump')}
                  onClick={() => setTyping(i)}
                >
                  …
                </Button>
              )
            ) : (
              <Button
                key={p}
                type="button"
                variant={p >= from && p <= page ? 'default' : 'outline'}
                size="sm"
                className="min-w-9 px-2 tabular-nums"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => go(p)}
              >
                {p}
              </Button>
            ),
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-9 px-0"
            disabled={page >= lastPage}
            aria-label={t('pagination.next')}
            onClick={() => go(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {total !== null && <p className="text-xs tabular-nums text-muted-foreground">{t('pagination.total', { count: total })}</p>}

      {onMore && page < lastPage && (
        <Button type="button" variant="outline" onClick={onMore} disabled={moreLoading} data-testid="pagination-more">
          {moreLoading && <Loader2 className="size-4 animate-spin" />}
          {t('list.showMore')}
        </Button>
      )}
    </nav>
  )
}

/** „…"-ის ნაცვლად — გვერდის ნომრის ველი. ⚠️ ერთხელ სრულდება (Enter-ის შემდეგ blur ორჯერ არ წავიდეს) */
function PageInput({ last, onDone }: { last: number; onDone: (page: number | null) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const done = useRef(false)

  const finish = (page: number | null) => {
    if (done.current) return
    done.current = true
    onDone(page)
  }

  return (
    <Input
      autoFocus
      type="number"
      inputMode="numeric"
      min={1}
      max={last}
      value={value}
      aria-label={t('pagination.jump')}
      placeholder={`1–${last}`}
      className="h-9 w-20 px-2 text-center tabular-nums"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(Number(value) || null)
        } else if (e.key === 'Escape') {
          finish(null)
        }
      }}
      onBlur={() => finish(Number(value) || null)}
    />
  )
}
