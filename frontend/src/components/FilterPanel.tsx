import {
  Children,
  isValidElement,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Chip, ChipRow } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/* ============================================================
   მარჯვენა ფილტრების პანელი (Tasks 2.2 — ვარიანტი A).

   ჩიპების ჩაკეცვა/გამოკეცვა (`GenreChips`) ბიბლიოთეკიდან მოიხსნა:
   ჟანრი, სტატუსი და დანარჩენი ფილტრები ერთ sticky პანელშია მარჯვნივ.
   სორტირება და „აღმოაჩინე" ტულბარში რჩება — ისინი ფილტრები არაა.

   პანელი **მონახაზზე** მუშაობს: მონიშვნა state-ს ცვლის, მაგრამ სია
   მხოლოდ „გაფილტვრაზე" ახლდება — თორემ ყოველი checkbox ცალკე რექვესთს
   გააგზავნიდა. მონახაზის მექანიკა `lib/filters.ts`-შია (ერთი ასლი
   რვავე გვერდისთვის); აქ მხოლოდ ვიზუალია.
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
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  const selected = useMemo(() => selectedOptions(children), [children])
  const shown = count ?? selected.length

  return (
    <div className="border-b border-border py-3 first:pt-0 last:border-b-0">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-0.5 text-left text-xs font-semibold tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open ? '' : '-rotate-90')} />
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {!!shown && (
            <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-primary-foreground">
              {shown}
            </span>
          )}
        </button>

        {/* ჯგუფის გასუფთავება — „ერთიანი წაშლა" იქვე, სადაც რიცხვი დგას.
            ⚠️ თითო რიგის საკუთარ `onChange(false)`-ს იძახებს, ე.ი. მოხსნის
            ლოგიკა ისევ ერთია (გვერდები `setDraft`-ს ფუნქციით ცვლიან,
            ამიტომ ზედიზედ გამოძახება უსაფრთხოა). */}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => selected.forEach((option) => option.props.onChange(false))}
            title={t('filter.clearGroup')}
            aria-label={t('filter.clearGroup')}
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* ⚠️ **ჩიპები მხოლოდ ჩაკეცილ ჯგუფშია** (ეტაპ 6-ის შესწორება).
          §2.3-მ ისინი იმიტომ დაამატა, რომ სამი არჩეული ჟანრი სქროლად სიაში
          იკარგებოდა — მაგრამ **გახსნილ** ჯგუფში მონიშნულები ისედაც ზემოთაა
          (`FilterOptionList` მათ პირველ რიგებში აყენებს), ე.ი. ჩიპები იმავეს
          მეორედ ამბობდნენ და სიას ორი რიგით ქვემოთ აგდებდნენ. */}
      {!open && selected.length > 0 && (
        <ChipRow className="mt-2 gap-1.5">
          {selected.map((option, i) => (
            /* ⚠️ **ჯვარი მარჯვნივაა და ჰოვერზე წითლდება** (შენი მითითება,
               2026-09-14). მარცხნივ მდგომი ჯვარი ხატულად იკითხებოდა — თითქოს
               ჩიპის სახეობას აღნიშნავდა — და არა მოქმედებად. წითელი იმავე
               ენაზე ლაპარაკობს, რითაც პანელის „ყველაფრის გასუფთავება" და
               მოდალის დახურვის ჯვარი. */
            <Chip
              key={`${option.props.label}-${i}`}
              active
              remove
              onClick={() => option.props.onChange(false)}
              className="max-w-full py-1"
            >
              {option.props.label}
            </Chip>
          ))}
        </ChipRow>
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
    /* ⚠️ **მონიშნული რიგი ფონითაც ჩანს და არა მარტო მსუქანი შრიფტით.**
       ერთი კლასის სხვაობა („font-medium") სქროლად სიაში პრაქტიკულად
       უხილავი იყო — სწორედ ეს იკითხებოდა როგორც „ვიზუალი, რომელიც
       არჩეულია, ძაან ცუდია". */
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md border px-2 py-2 text-sm transition-colors',
        checked ? 'border-primary/40 bg-primary/10 font-medium' : 'border-transparent hover:bg-muted',
      )}
    >
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            'shrink-0 rounded-md px-1.5 py-px text-[11px] leading-none tabular-nums',
            checked ? 'bg-primary/15 text-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
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
  maxHeight = 260,
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

  /* ⚠️ **მონიშნულები ზემოთ, მაგრამ „გაყინულად".** დალაგება რომ ყოველ
     რენდერზე მომხდარიყო, დაწკაპუნებული რიგი მაშინვე თავში ახტებოდა და
     თაგვის ქვეშ **სხვა** ჟანრი ჩნდებოდა — მეორე დაწკაპუნება უკვე არასწორს
     ნიშნავდა. ამიტომ „ზემოთ" ის რიგებია, რომლებიც სიის ჩვენების (ან ძებნის
     შეცვლის) მომენტში იყო მონიშნული. */
  const pinKey = `${options.map((option) => option.props.label).join('|')}#${term}`
  const pinnedRef = useRef({ key: '', set: new Set<string>() })
  if (pinnedRef.current.key !== pinKey) {
    // ⚠️ **ref და არა `useMemo`**: „მონიშნული" ყოველ დაწკაპუნებაზე იცვლება,
    // ე.ი. `options`-ზე დამოკიდებული memo მაინც ყოველ რენდერზე გადაითვლიდა
    // და ხტუნვა დაბრუნდებოდა. გასაღები მხოლოდ *სია და ძებნაა*.
    pinnedRef.current = {
      key: pinKey,
      set: new Set(options.filter((option) => option.props.checked).map((option) => option.props.label)),
    }
  }
  const pinned = pinnedRef.current.set

  const shown = plain
    ? items
    : options
        .filter((option) => !term || option.props.label.toLowerCase().includes(term))
        .sort((a, b) => Number(pinned.has(b.props.label)) - Number(pinned.has(a.props.label)))

  return (
    <>
      {/* გრძელ სიაში ძებნა — რვა რიგიდან ზემოთ სქროლი ცალკე აღარ ყოფნის */}
      {!plain && options.length >= 8 && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('filter.search')}
            className="h-8 pl-8 text-sm"
          />
        </div>
      )}

      <div className="fb-scroll -mr-1 space-y-1 overflow-y-auto pr-1" style={{ maxHeight }}>
        {shown}
        {!plain && !shown.length && (
          <p className="px-1.5 py-2 text-xs text-muted-foreground">{t('filter.noMatches')}</p>
        )}
      </div>
    </>
  )
}

/**
 * რიცხვითი დიაპაზონი — „დან – მდე" (ეტაპი 6).
 *
 * ⚠️ **ერთი აღწერა ყველა დიაპაზონისთვის.** წელი და რეიტინგი ხელით ეწერა,
 * ორივეგან თავისი დაშორებით და შიშველი „–"-ით; ახლა ერთი ჩარჩოა შუა
 * გამყოფით, შევსებულზე ხაზგასმული და თავისივე გასუფთავების ჯვრით.
 */
export function FilterRange({
  label,
  from,
  to,
  onFrom,
  onTo,
  fromPlaceholder,
  toPlaceholder,
  min,
  max,
  step,
}: {
  label: string
  from: string
  to: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
  fromPlaceholder?: string
  toPlaceholder?: string
  min?: number | string
  max?: number | string
  step?: number | string
}) {
  const { t } = useTranslation()
  const filled = from.trim() !== '' || to.trim() !== ''

  return (
    <div>
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{label}</span>
        {filled && (
          <button
            type="button"
            onClick={() => {
              onFrom('')
              onTo('')
            }}
            title={t('filter.clearGroup')}
            aria-label={t('filter.clearGroup')}
            className="grid size-5 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <div
        className={cn(
          'mt-1 flex items-center rounded-md border transition-colors',
          filled ? 'border-primary/40 bg-primary/5' : 'border-border',
        )}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={from}
          onChange={(e) => onFrom(e.target.value)}
          placeholder={fromPlaceholder ?? t('filter.from')}
          className="h-9 border-0 bg-transparent text-center shadow-none focus-visible:ring-0"
        />
        <span className="h-5 w-px shrink-0 bg-border" />
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={to}
          onChange={(e) => onTo(e.target.value)}
          placeholder={toPlaceholder ?? t('filter.to')}
          className="h-9 border-0 bg-transparent text-center shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
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
 *
 * `dirty` = მონახაზი განსხვავდება მოქმედი ფილტრისგან.
 *
 * ⚠️ **`onClear` ორივე მხარეს ასუფთავებს** — მონახაზსაც და მოქმედ ფილტრსაც.
 * გამომძახებელს არჩევანი არ აქვს: ეს `lib/filters.ts`-ის `clear()`-ია,
 * რომელიც `setDraft(empty)`-საც აკეთებს და მისამართსაც წერს. სანამ ასე იყო,
 * უკვე სუფთა მისამართზე დაჭერილი „გასუფთავება" ჩუმად არაფერს აკეთებდა და
 * მონიშნული ჩექბოქსები ადგილზე რჩებოდა.
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
      {/* ⚠️ **სათაურის ზოლი ერთ ფაქტს ერთხელ ამბობს.** ადრე ეწერა
          „ფილტრები" და გვერდით ბეჯი „3 ფილტრი" — ერთი და იგივე სიტყვა ორჯერ.
          ახლა სათაურთან მხოლოდ რიცხვია, ხოლო რაც უნდა *გააკეთო* —
          „ყველაფრის გასუფთავება" — სიტყვიერი ღილაკია ქვემოთ და არა შიშველი
          ჯვარი. `pr-9` — უჯრის დახურვის ჯვარს ვუტოვებთ ადგილს. */}
      <div className="mb-3 flex items-center gap-2 pr-9 lg:pr-0">
        <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="flex-1 text-sm font-semibold">{t('filter.more')}</h2>
        {activeCount > 0 && (
          <span className="rounded-md bg-primary px-2 py-1 text-xs font-semibold leading-none tabular-nums text-primary-foreground">
            {activeCount}
          </span>
        )}
      </div>

      <div className="fb-scroll -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <Button className="w-full" onClick={onApply} disabled={!dirty}>
          {t('filter.apply')}
        </Button>
        {/* ⚠️ **გასუფთავება წითელია** (შენი მითითება, 2026-09-14): ის ერთადერთი
            მოქმედებაა ამ პანელზე, რომელიც **შენს არჩევანს შლის** — „გაფილტვრა"
            ხედს ცვლის, ეს კი ყველა მონიშვნას აქრობს. ნაცრისფერი ღილაკი მას
            ჩვეულებრივ მეორეხარისხოვან ბმულად კითხულობდა. */}
        {/* ⚠️ **`outline` და არა `ghost`** (შენი მითითება, 2026-09-14): უჩარჩოო
            ღილაკი ზედა „გაფილტვრასთან" შედარებით სხვა — მცირე — ზომისად
            იკითხებოდა, თუმცა სიმაღლე ორივეს ერთი აქვს. ჩარჩო ამ ორ ღილაკს
            ერთ წყვილად აჩვენებს, ფერი კი მაინც ამბობს, რომ ეს დამშლელია. */}
        {(activeCount > 0 || dirty) && (
          <Button
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onClear}
          >
            <X className="size-4" />
            {t('filter.clearAll')}
          </Button>
        )}
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
