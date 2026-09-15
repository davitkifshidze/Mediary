import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Loader2, Search, X } from 'lucide-react'
import { globalSearch, type SearchGroup, type SearchItem } from '@/api/search'
import { useModules, moduleName } from '@/lib/modules'
import { highlightParts, resultPath } from '@/lib/searchResults'
import { LAYER_POPUP } from '@/lib/layers'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { ModuleIcon } from '@/components/ModuleIcon'

/* ============================================================
   ჯვარედინი ძებნა — ჰედერის ველი და მისი ჩამოსაშლელი სია.

   ⚠️ **ეს სექციების ძებნას არ ცვლის.** მოდულის შიგნით ძებნა ფილტრებთან
   ერთად მუშაობს და სრულ სიას აბრუნებს; ეს კი „სად შევინახე" კითხვას
   პასუხობს — თითოდან რამდენიმე შედეგი და პირდაპირი გადასვლა.

   ⚠️ **სია ახლა ნაჭერსაც აჩვენებს და არა მარტო სათაურს.** სათაურების სია
   არ ამბობდა *რატომ* მოვიდა ჩანაწერი — აღწერაში, შენიშვნაში თუ მსახიობის
   სახელში დაემთხვა. ერთი სტრიქონი ორად გაიზარდა და ზუსტად ეს ორი სტრიქონი
   იძლევა პასუხს.

   ⚠️ **სრული პასუხი გვერდზეა** (`/search?q=`): აქ თითო დომენიდან სამია, იქ —
   ყველა, დომენების ჩიპებით. Enter და ბოლო ხაზი ორივე იქ მიდის.

   ⚠️ **მისამართი `modules.route_base`-იდან მოდის და არა ჩაწერილი რუკიდან.**
   ერთი მოდულის მისამართი უკვე ორ ადგილას წერია (საიდბარი და როუტერი) —
   მესამე ასლი ერთ დღეს დაშორდებოდა (`/movies` vs `/movie`).
   ============================================================ */

/** რამდენ ხანს ველოდოთ აკრეფის დასრულებას — სექციების ძებნის იგივე რიტმი */
const DEBOUNCE_MS = 350

/** ჩამოსაშლელში თითო დომენიდან რამდენი სტრიქონი ჩანს */
const PER_GROUP = 3

/** ერთ სტრიქონზე რამდენი ნაჭერი ეტევა — დანარჩენი გვერდზეა */
const MATCHES_PER_ITEM = 2

export function GlobalSearch() {
  const { t, i18n } = useTranslation()
  // ⚠️ **`enabled` და არა `all`** — გამორთული მოდულის ჩანაწერი პასუხში
  // ისედაც არ მოდის (სერვერი ჭრის), მაგრამ მისამართის რუკაც მხოლოდ
  // ჩართულებისა უნდა იყოს: სხვაგვარად ბმული 403-ზე მიგვიყვანდა.
  const { enabled: modules } = useModules()
  const navigate = useNavigate()

  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term])

  /* ⚠️ **გარეთ დაწკაპუნება ხურავს.** `Popover` აქ განზრახ არ გამოიყენება:
     ის ფოკუსს თავისკენ იღებს და ველში აკრეფა წყდებოდა. */
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const query = useQuery({
    queryKey: ['global-search', debounced, 'header'],
    queryFn: ({ signal }) => globalSearch(debounced, { perModule: PER_GROUP, signal }),
    // ⚠️ ორ სიმბოლომდე სერვერიც ცარიელს აბრუნებს — მოთხოვნაც ზედმეტია
    enabled: debounced.length >= 2,
  })

  /** მოდულის მისამართი — ერთი წყარო (`GET /api/modules`) */
  const routes = useMemo(
    () => Object.fromEntries(modules.map((m) => [m.key, m.route_base])),
    [modules],
  )
  /* ⚠️ `ModuleIcon` **ხატულის სახელს** იღებს და არა მოდულის key-ს —
     ორივე `modules`-ის რიგშია, ე.ი. აქ მეორე რუკა არ იბადება. */
  const icons = useMemo(
    () => Object.fromEntries(modules.map((m) => [m.key, m.icon])),
    [modules],
  )

  const groups = query.data?.groups ?? []
  const total = query.data?.total ?? 0

  const close = () => {
    setOpen(false)
    setTerm('')
  }

  const go = (item: SearchItem) => {
    const to = resultPath(item, routes[item.module ?? ''])
    if (!to) return
    close()
    navigate(to)
  }

  /** სრული პასუხი — ძებნის გვერდი */
  const goToPage = () => {
    if (debounced.length < 2) return
    close()
    navigate(`/search?q=${encodeURIComponent(debounced)}`)
  }

  /** ჯგუფის სახელი: მოდულისა — ბაზიდან, სამი „უმოდულო" დომენისა — i18n-იდან */
  const labelOf = (group: SearchGroup) => {
    if (group.key === 'cast' || group.key === 'playlist' || group.key === 'gallery') {
      return t(`search.group.${group.key}`)
    }
    const found = modules.find((m) => m.key === group.module)

    return found ? moduleName(found, i18n.language) : group.key
  }

  const showPanel = open && debounced.length >= 2

  return (
    <div ref={boxRef} className="relative w-full">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          // Enter — სრული პასუხი გვერდზე (ჩამოსაშლელი სია მოკლეა განზრახ)
          if (e.key === 'Enter') goToPage()
        }}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        className="h-9 pl-8 pr-8"
      />
      {term && (
        <button
          type="button"
          onClick={close}
          aria-label={t('search.clear')}
          className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      )}

      {showPanel && (
        <div
          className={cn(
            'absolute right-0 top-full mt-1.5 max-h-[70vh] w-[min(34rem,90vw)] overflow-y-auto rounded-md border border-border bg-card p-1.5 shadow-lg fb-scroll',
            LAYER_POPUP,
          )}
        >
          {query.isFetching && (
            <div className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('search.searching')}
            </div>
          )}

          {!query.isFetching && total === 0 && (
            <div className="px-2.5 py-3 text-sm text-muted-foreground">
              {t('search.empty', { query: debounced })}
            </div>
          )}

          {groups.map((group) => (
            <div key={group.key} className="mb-1 last:mb-0">
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <ModuleIcon name={icons[group.module ?? '']} className="size-3.5" />
                {labelOf(group)}
                {/* ⚠️ **ჯამი და არა ნაჩვენებთა რიცხვი** — „კიდევ N არის" */}
                {group.total > group.items.length && (
                  <span className="tabular-nums">· {group.total}</span>
                )}
              </div>

              {group.items.map((item) => (
                <button
                  key={`${item.domain}-${item.id}`}
                  type="button"
                  onClick={() => go(item)}
                  className="block w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm">{item.title}</span>
                    {item.subtitle && (
                      <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                    )}
                  </span>

                  {/* ნაჭერი — *რატომ* მოვიდა ეს ჩანაწერი */}
                  {item.matches.slice(0, MATCHES_PER_ITEM).map((m, i) => (
                    <span key={`${m.field}-${i}`} className="mt-0.5 block truncate text-xs text-muted-foreground">
                      <span className="text-[11px] opacity-70">{t(`search.field.${m.field}`)}: </span>
                      {highlightParts(m.text, debounced).map((p, k) => (
                        <span key={k} className={cn(p.hit && 'font-medium text-foreground')}>
                          {p.text}
                        </span>
                      ))}
                    </span>
                  ))}
                </button>
              ))}
            </div>
          ))}

          {total > 0 && (
            <button
              type="button"
              onClick={goToPage}
              className="mt-1 flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-t border-border px-2.5 py-2 text-sm text-primary transition-colors hover:bg-muted"
            >
              {t('search.allResults', { count: total })}
              <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
