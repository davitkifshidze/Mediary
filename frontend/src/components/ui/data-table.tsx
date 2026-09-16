import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/* ============================================================
   **საერთო datatable (Tasks §6.4).**

   ძებნა + სვეტზე დალაგება + გვერდები, ერთ კომპონენტში. `/users`-ის ცხრილს
   სამივე უკვე ჰქონდა, მაგრამ **გვერდზე ჩაშენებული**, ე.ი. მოდალში იმავეს
   გამეორება მეორე ასლს დაბადებდა — ამიტომ აქ გამოვიდა.

   ⚠️ **დალაგება/ფილტრი/გვერდი კლიენტზეა.** ეს განზრახაა: კომპონენტს
   **უკვე ჩამოტვირთული** სია მიეწოდება (მოდულის მფლობელები, ჩართული
   მომხმარებლები), ე.ი. სერვერული pagination აქ ზედმეტი რექვესთი იყო.
   თუ ოდესმე ათასობით რიგი გამოჩნდა, სერვერული ვარიანტი **ცალკე** უნდა
   დაიწეროს და არა ამის შიგნით დაიმალოს.
   ============================================================ */

export interface DataColumn<T> {
  key: string
  label: string
  className?: string
  /** დასალაგებელი მნიშვნელობა; არ არის → სვეტი არ ილაგება */
  value?: (row: T) => string | number
  render: (row: T) => ReactNode
}

const PAGE_SIZES = [10, 25, 50, 100] as const

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchOf,
  searchPlaceholder,
  defaultSort,
  pageSize: initialPageSize = 10,
  empty,
  toolbar,
  minWidth = '640px',
}: {
  rows: T[]
  columns: DataColumn<T>[]
  rowKey: (row: T) => string | number
  /** რომელ ტექსტებში ეძებოს; არ არის → ძებნის ველი არ ჩანს */
  searchOf?: (row: T) => (string | null | undefined)[]
  searchPlaceholder?: string
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  pageSize?: number
  /**
   * ცარიელი ცხრილის შიგთავსი.
   *
   * ⚠️ **`ReactNode` და არა `string`** (Tasks §5.5): პროექტის ცარიელი
   * მდგომარეობა `EmptyState`-ია — „რა ცარიელია · რატომ · რა არის შემდეგი
   * ღილაკი" — და სტრიქონი მას ვერ იტევდა, ე.ი. ცხრილზე გადასული გვერდი
   * იძულებული იყო ერთი ნაცრისფერი წინადადებით დაბრუნებულიყო იქ, საიდანაც
   * §2.4 გამოვიდა.
   */
  empty?: ReactNode
  /**
   * გვერდის საკუთარი კონტროლი ძებნისა და გვერდის ზომის გვერდით
   * (როლისა და სტატუსის ფილტრები `/users`-ზე).
   *
   * ⚠️ **ხელსაწყოების იმავე ზოლში და არა მის ზემოთ** — ცალკე რიგში ისინი
   * ცხრილს აღარ ეკუთვნოდნენ და ორ სხვადასხვა ზოლად იკითხებოდა.
   */
  toolbar?: ReactNode
  minWidth?: string
}) {
  const { t } = useTranslation()

  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(defaultSort ?? null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(initialPageSize)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = !needle || !searchOf
      ? rows
      : rows.filter((r) =>
          searchOf(r).some((v) => (v ?? '').toString().toLowerCase().includes(needle)),
        )

    const column = sort ? columns.find((c) => c.key === sort.key) : undefined
    if (!sort || !column?.value) return list

    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const x = column.value!(a)
      const y = column.value!(b)
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
      return String(x).localeCompare(String(y)) * dir
    })
  }, [rows, q, sort, columns, searchOf])

  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize))
  // ⚠️ ფილტრის შემდეგ გვერდი შეიძლება სიის გარეთ დარჩეს — მაშინ ცარიელი
  // ცხრილი დაიხატებოდა და „არაფერი მაქვს"-ად წაიკითხებოდა
  const current = Math.min(page, lastPage)
  const shown = filtered.slice((current - 1) * pageSize, current * pageSize)

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )

  return (
    <div>
      {/* ---------- ხელსაწყოების ზოლი ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {searchOf && (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              placeholder={searchPlaceholder ?? t('table.search')}
              className="h-9 pl-8"
            />
          </div>
        )}

        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            setPageSize(Number(v))
            setPage(1)
          }}
        >
          <SelectTrigger className="h-9 w-auto min-w-[6.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {t('table.perPage', { count: n })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {toolbar}

        <span className="ml-auto text-xs text-muted-foreground">
          {t('table.rowCount', { shown: shown.length, total: filtered.length })}
        </span>
      </div>

      {/* ---------- ცხრილი ---------- */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn('px-3 py-2.5 text-left font-medium', c.className)}>
                  {c.value ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground',
                        sort?.key === c.key && 'text-foreground',
                      )}
                    >
                      {c.label}
                      <ArrowUpDown
                        className={cn('size-3.5', sort?.key === c.key ? 'opacity-100' : 'opacity-40')}
                      />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!shown.length ? (
              <tr>
                {/* ⚠️ ცენტრირებული, ნაცრისფერი სტილი მხოლოდ **ტექსტს** ეხება —
                    `EmptyState`-ს თავისი ტიპოგრაფია აქვს და მემკვიდრეობით
                    მიღებული `text-muted-foreground` მის სათაურსაც გაფერმკრთალებდა. */}
                <td
                  colSpan={columns.length}
                  className={
                    empty === undefined || typeof empty === 'string'
                      ? 'px-3 py-6 text-center text-muted-foreground'
                      : 'p-3'
                  }
                >
                  {empty ?? t('table.empty')}
                </td>
              </tr>
            ) : (
              shown.map((row) => (
                <tr key={rowKey(row)} className="border-b border-border last:border-b-0">
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-3 py-2', c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- გვერდები ---------- */}
      {lastPage > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            aria-label={t('table.prev')}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('audit.pageOf', { page: current, last: lastPage })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= lastPage}
            onClick={() => setPage(current + 1)}
            aria-label={t('table.next')}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
