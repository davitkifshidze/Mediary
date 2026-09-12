import {
  Children,
  isValidElement,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronDown, Filter, Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/* ============================================================
   მარჯვენა ფილტრების პანელი (Tasks 2.2 — ვარიანტი A).

   ჩიპების ჩაკეცვა/გამოკეცვა (`GenreChips`) ბიბლიოთეკიდან მოიხსნა:
   ჟანრი, სტატუსი და დანარჩენი ფილტრები ერთ sticky პანელშია მარჯვნივ.
   სორტირება და „აღმოაჩინე" ტულბარში რჩება — ისინი ფილტრები არაა.

   პანელი **მონახაზზე** მუშაობს: მონიშვნა state-ს ცვლის, მაგრამ სია
   მხოლოდ „გაფილტვრაზე" ახლდება — თორემ ყოველი checkbox ცალკე რექვესთს
   გააგზავნიდა. იგივე პანელი ვიდეოებზეც გამოიყენება (5.2).
   ============================================================ */

const PANEL_WIDTH = 'w-[280px]'

interface OptionProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  count?: number
}

/**
 * ჯგუფში მონიშნული რიგების პოვნა (Tasks §2.3).
 *
 * ⚠️ **ბავშვებში ჩახედვა განზრახ არჩეულია** — ალტერნატივა იყო ყოველი
 * ჯგუფისთვის ცალკე `selected` prop-ის გატარება **რვავე გვერდზე**, ე.ი.
 * ერთი ფაქტი (რა არის მონიშნული) ორ ადგილას დაიწერებოდა და ერთ-ერთი
 * აუცილებლად აცდებოდა. `FilterOption` ისედაც აქ არის აღწერილი, ე.ი.
 * ტიპიც უცვლელია და გამომძახებლებს არაფერი ეცვლებათ.
 */
function selectedOptions(node: ReactNode, out: ReactElement<OptionProps>[] = []) {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return

    if (child.type === FilterOption) {
      const props = child.props as OptionProps
      if (props.checked) out.push(child as ReactElement<OptionProps>)
      return
    }

    const nested = (child.props as { children?: ReactNode }).children
    if (nested) selectedOptions(nested, out)
  })

  return out
}

/** ერთი ჩაკეცვადი ჯგუფი პანელში (ჟანრები, სტატუსი, დიაპაზონები…) */
export function FilterGroup({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  /** მონიშნულთა რაოდენობა — სათაურთან ჩანს, ჩაკეცილშიც */
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const selected = useMemo(() => selectedOptions(children), [children])

  return (
    <div className="border-b border-border py-3 first:pt-0 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 text-sm font-medium"
      >
        <span className="flex-1 text-left">{title}</span>
        {!!(count ?? selected.length) && (
          <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium leading-none text-primary-foreground">
            {count ?? selected.length}
          </span>
        )}
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open ? '' : '-rotate-90')} />
      </button>

      {/* ⚠️ **მონიშნულები ჩიპებად, ჩაკეცილ ჯგუფშიც** (§2.3): სამი არჩეული
          ჟანრი სქროლად სიაში იკარგებოდა — ჩანდა მხოლოდ რიცხვი და ვერ ხედავდი,
          *რა* არის არჩეული. ჩიპზე დაჭერა თვითონ რიგის `onChange(false)`-ს
          იძახებს, ე.ი. მოხსნის ლოგიკა ისევ ერთია. */}
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((option, i) => (
            <button
              key={`${option.props.label}-${i}`}
              type="button"
              onClick={() => option.props.onChange(false)}
              className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2 pr-1.5 text-xs font-medium transition-colors hover:bg-primary/20"
            >
              <span className="truncate">{option.props.label}</span>
              <X className="size-3 shrink-0 opacity-70" />
            </button>
          ))}
        </div>
      )}

      {open && <div className="mt-2 space-y-0.5">{children}</div>}
    </div>
  )
}

/** ჯგუფის ერთი მონიშვნადი რიგი */
export function FilterOption({
  label,
  checked,
  onChange,
  count,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** ჩანაწერების რაოდენობა ამ მნიშვნელობაზე */
  count?: number
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-muted">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span className={cn('min-w-0 flex-1 truncate', checked && 'font-medium')}>{label}</span>
      {count !== undefined && <span className="shrink-0 text-xs text-muted-foreground">{count}</span>}
    </label>
  )
}

/**
 * გრძელი სია — **სქროლადი** (Tasks 3).
 * ადრე „მეტის ჩვენება/ნაკლების ჩვენება" ღილაკი იდგა; user-ს ღილაკის გარეშე,
 * პირდაპირ სქროლი უნდა. `fb-scroll` სქროლბარს ყოველთვის ხილულს ხდის.
 */
export function FilterOptionList({
  children,
  maxHeight = 240,
}: {
  children: ReactNode
  /** px — დაახლოებით 7 რიგი */
  maxHeight?: number
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const items = Children.toArray(children)
  const options = items.filter(
    (child): child is ReactElement<OptionProps> => isValidElement(child) && child.type === FilterOption,
  )

  /* ⚠️ **დამუშავება მხოლოდ მაშინ, როცა სიაში მართლა რიგებია.** ზოგი ჯგუფი
     შიგნით სხვასაც ხატავს (განმარტება, ღილაკი) — მაშინ სიას ხელს არ ვახლებთ,
     თორემ ძებნა ჩუმად წაშლიდა იმას, რაც რიგი არ არის. */
  const plain = options.length !== items.length
  const term = query.trim().toLowerCase()
  const shown = plain
    ? items
    : options
        .filter((option) => !term || option.props.label.toLowerCase().includes(term))
        // მონიშნული ყოველთვის ზემოთ — სქროლში ძებნა აღარ სჭირდება
        .sort((a, b) => Number(!!b.props.checked) - Number(!!a.props.checked))

  return (
    <>
      {/* გრძელ სიაში ძებნა — რვა რიგიდან ზემოთ სქროლი ცალკე აღარ ყოფნის */}
      {!plain && options.length >= 8 && (
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('filter.search')}
            className="h-8 pl-8 text-sm"
          />
        </div>
      )}

      <div className="fb-scroll -mr-1 space-y-0.5 overflow-y-auto pr-1" style={{ maxHeight }}>
        {shown}
        {!plain && !shown.length && (
          <p className="px-1.5 py-2 text-xs text-muted-foreground">{t('filter.noMatches')}</p>
        )}
      </div>
    </>
  )
}

/** ტულბარის ღილაკი, რომელიც ვიწრო ეკრანზე პანელს უჯრად ხსნის */
export function FilterTrigger({
  activeCount,
  onClick,
  className,
}: {
  activeCount: number
  onClick: () => void
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <Button variant="outline" onClick={onClick} className={cn('lg:hidden', className)}>
      <SlidersHorizontal className="size-4" />
      {t('filter.more')}
      {activeCount > 0 && (
        <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium leading-none text-primary-foreground">
          {activeCount}
        </span>
      )}
    </Button>
  )
}

/**
 * თვითონ პანელი — დესკტოპზე sticky მარჯვნივ, ვიწრო ეკრანზე მარჯვენა უჯრა.
 * `dirty` = მონახაზი განსხვავდება მოქმედი ფილტრისგან.
 */
export function FilterPanel({
  activeCount,
  dirty,
  onApply,
  onClear,
  open,
  onOpenChange,
  children,
}: {
  activeCount: number
  dirty: boolean
  onApply: () => void
  onClear: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const { t } = useTranslation()

  const body = (
    <>
      {/* `pr-9` — უჯრის დახურვის ჯვარს ვუტოვებთ ადგილს; დესკტოპზე ჯვარი არაა */}
      <div className="mb-1 flex items-center gap-2 pr-9 lg:pr-0">
        <Filter className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="flex-1 text-sm font-semibold">{t('filter.more')}</h2>
        {activeCount > 0 && (
          // Tasks 3 — badge ჩაჭყლეტილი იყო; ახლა სრული პადინგი აქვს
          <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium leading-none text-primary-foreground">
            {t('filter.activeCount', { count: activeCount })}
          </span>
        )}
      </div>

      <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>

      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <Button className="flex-1" onClick={onApply} disabled={!dirty}>
          {t('filter.apply')}
        </Button>
        <Button
          variant="destructiveOutline"
          onClick={onClear}
          disabled={activeCount === 0 && !dirty}
          title={t('filter.clear')}
          aria-label={t('filter.clear')}
        >
          <X className="size-4" />
        </Button>
      </div>
    </>
  )

  return (
    <>
      {/* ===== დესკტოპი — sticky პანელი (ჰედერი 3.5rem) ===== */}
      <aside className={cn('hidden shrink-0 lg:block', PANEL_WIDTH)}>
        <div className="sticky top-[4.5rem] flex max-h-[calc(100vh-6rem)] flex-col rounded-xl border border-border bg-card/40 p-4">
          {body}
        </div>
      </aside>

      {/* ===== ვიწრო ეკრანი — მარჯვენა უჯრა ===== */}
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fb-overlay fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm lg:hidden" />
          <DialogPrimitive.Content
            className={cn(
              'fb-drawer fixed inset-y-0 right-0 z-[81] flex max-w-[85vw] flex-col border-l border-border bg-card p-4 shadow-xl focus:outline-none lg:hidden',
              PANEL_WIDTH,
            )}
          >
            <DialogPrimitive.Title className="sr-only">{t('filter.more')}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="close"
              className="absolute right-3 top-3 grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
            {body}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
