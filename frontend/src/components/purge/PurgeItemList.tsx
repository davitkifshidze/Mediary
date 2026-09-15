import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Search, Trash2, X } from 'lucide-react'
import type { PurgePlanItem } from '@/api/account'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

/* ============================================================
   **გეგმის ჩაშლა — რიგი სიად, ერთეულის ამოღებითა და წაშლით** (§25.3).

   შენი სიტყვები: „მასიურ წაშლებს ყველა სექციაზე უნდა შეეძლოს ზედაპირული
   ინფოთი წაშალოს ბევრი დატა, ასევე შესაძლებელი იყოს ჩაშლა, ნახვა და
   ერთეულის წაშლა".

   აქამდე გეგმა მხოლოდ **რიცხვებს** ამბობდა („წაიშლება 412 ჩანაწერი"), ე.ი.
   ერთადერთი არჩევანი იყო „ყველაფერი ასე" ან „საერთოდ არა" — ვერც ნახავდი,
   რა იშლება, და ვერც ერთ ჩანაწერს ამოიღებდი.

   ⚠️ **გამორიცხვა სკოუპს კი არ ცვლის, რიგს ჭრის.** `mode`/`ids` ისევ ისაა,
   რაც მომხმარებელმა აირჩია; აქ მხოლოდ ის წყდება, რომელი ერთეული ჩაიყრება
   რიგში. სხვაგვარად „გეგმა" და „წაშლილი" დაშორდებოდა — ის ერთი წესი,
   რომელზეც მთელი `PurgeService` დგას.

   ⚠️ **გამორიცხული ინახება id-ებით და არა ინდექსებით** — გეგმა ხელახლა
   იკითხება (სკოუპის შეცვლაზე), ე.ი. ინდექსი სულ სხვა ჩანაწერზე
   მიუთითებდა.

   ⚠️ **ერთეულის წაშლას ჩაწერილი სიტყვა არ სჭირდება.** `DELETE`-ის აკრეფა
   იმისთვისაა, რომ ბიბლიოთეკა ერთი ღილაკით ვერ გაქრეს; ერთი ჩანაწერის
   წაშლა კი ისეთივე მოქმედებაა, როგორიც სექციის ბადეში — ჩვეულებრივი
   დადასტურება. სიტყვა მასობრივ გაშვებაზე რჩება.

   ⚠️ **ძებნა ადგილობრივია და გვერდებად არ იჭრება** — სია უკვე
   ჩამოტვირთულია (`plan.items`), ე.ი. სერვერს ხელახლა კითხვა მხოლოდ
   იმავე პასუხს დააბრუნებდა. ეკრანზე მაინც მხოლოდ `VISIBLE` რიგი იხატება:
   1000 `<li>` სქროლს კლავს, ხოლო „კიდევ N" ღილაკი იმავე სიას აგრძელებს.
   ============================================================ */

/** ერთ ჯერზე რამდენი რიგი დაიხატოს */
const VISIBLE = 50

export function PurgeItemList({
  items,
  excluded,
  onToggle,
  onToggleAll,
  onDeleteOne,
  busyId,
  disabled,
}: {
  items: PurgePlanItem[]
  /** გამორიცხული id-ები — რიგში არ ჩაიყრება */
  excluded: Set<number>
  onToggle: (id: number) => void
  onToggleAll: (next: boolean) => void
  /** ერთეულის დაუყოვნებელი წაშლა (დადასტურებით) */
  onDeleteOne: (item: PurgePlanItem) => void
  /** რომელი ერთეული იშლება ახლა */
  busyId?: number | null
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(VISIBLE)

  const found = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => item.title.toLowerCase().includes(needle))
  }, [items, q])

  const shown = found.slice(0, limit)
  const kept = items.length - excluded.size

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{t('purge.itemsTitle')}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('purge.itemsKept', { kept, total: items.length })}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setLimit(VISIBLE)
              }}
              placeholder={t('filter.search')}
              className="h-8 w-44 pl-7 text-xs"
            />
          </div>
          {/* „ყველას მონიშვნა" — გამორიცხვის სწრაფი გაუქმება/დაყენება */}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onToggleAll(excluded.size > 0)}
          >
            {excluded.size > 0 ? t('purge.itemsSelectAll') : t('purge.itemsClearAll')}
          </Button>
        </div>
      </div>

      {!found.length ? (
        <p className="text-sm text-muted-foreground">{t('purge.itemsNoMatch')}</p>
      ) : (
        <ul className="fb-scroll max-h-96 space-y-1 overflow-y-auto pr-1">
          {shown.map((item) => {
            const off = excluded.has(item.id)
            const busy = busyId === item.id

            return (
              <li
                key={item.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                  off ? 'border-border/60 bg-muted/30 text-muted-foreground' : 'border-border',
                )}
              >
                <Checkbox
                  checked={!off}
                  disabled={disabled || busy}
                  onCheckedChange={() => onToggle(item.id)}
                />
                <span className={cn('min-w-0 flex-1 truncate', off && 'line-through')}>
                  {item.title}
                  {item.year ? (
                    <span className="ml-1 text-xs text-muted-foreground tabular-nums">{item.year}</span>
                  ) : null}
                </span>

                {/* ⚠️ ერთეულის წაშლა — მაშინვე, დადასტურებით. სწორედ ეს არის
                    „ერთეულის წაშლა": გეგმა მთელი სიისთვისაა, ეს კი ერთისთვის. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={disabled || busy}
                  title={t('purge.deleteOne')}
                  onClick={() => onDeleteOne(item)}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground"
                  disabled={disabled || busy}
                  title={off ? t('purge.itemsInclude') : t('purge.itemsExclude')}
                  onClick={() => onToggle(item.id)}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {found.length > shown.length && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setLimit((n) => n + VISIBLE)}
        >
          {t('purge.itemsMore', { count: found.length - shown.length })}
        </Button>
      )}
    </div>
  )
}
