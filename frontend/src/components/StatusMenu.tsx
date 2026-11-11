import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown } from 'lucide-react'
import type { Status } from '@/api/types'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { EnumStatusBadge, EnumStatusLabel, StatusBadge, StatusLabel } from '@/components/StatusBadge'
import { enumStatusKey, statusName, type EnumStatusDomain } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'

/* ============================================================
   **სტატუსის ჩამოსაშლელი სტრიქონში — ერთი კომპონენტი, ერთი სიგანე.**

   შენი სიტყვები: „„მიმდინარე“ და „დასრულებული“ ერთნაირი სიგრძის ღილაკივით
   ჩამოსაშლელი". დასაჭერი თვითონ ბეჯია (`size="row"` — `h-9`, ისარი ბოლოში),
   სია — სტატუსები აიქონითა და ფერით, არჩეულზე ✓.

   ⚠️ **სიგანეს მოდულის ყველაზე გრძელი სტატუსის სახელი ადგენს** (`StatusSizer`).
   ადრე `min-w-36` ეწერა, ეს კი მხოლოდ **მინიმუმია**: „გადაუწყვეტელი" 144px-ს
   სცდებოდა და ღილაკი ფართოვდებოდა, „საყურებელი" — არა, ე.ი. ერთ სიაში ღილაკები
   სხვადასხვა სიგანისა იყო და მათ მარჯვნივ ყველაფერი ხტებოდა.

   ⚠️ **ერთი განსაზღვრება ყველა სტრიქონულ სიაზე**: ფილმი · სერიალი · ანიმე ·
   ვიდეო · ბუკმარკი · ჩანაწერი · პირადი მოდული (ლექსიკონის სტატუსი) და წიგნი ·
   თამაში · კურსი · ადგილი (enum). ბუკმარკსა და პირად მოდულს ამის ხელით დაწერილი
   ასლი ჰქონდა, ჩანაწერს — სიგანის გარეშე ბეჯი; `scripts/action-rows.mjs` ახლა
   ამას ამოწმებს.
   ============================================================ */

/** ტრიგერის ისარი — ბეჯის ბოლოს */
const ARROW = <ChevronDown className="size-3.5 shrink-0 opacity-70" />

/** ტრიგერის ბეჯი უჯრას მთლიანად ავსებს; ტექსტი არ ტყდება */
const TRIGGER_BADGE = 'w-full justify-between whitespace-nowrap'

/**
 * **სიგანის დამდგენი** — ყოველი შესაძლო სახელის უხილავი, ნულოვანი სიმაღლის
 * ასლი იმავე ბადის უჯრაში დგას, სადაც ხილული ბეჯი; უჯრის სიგანე ყველაზე ფართო
 * ასლისაა, ხილული კი მას ავსებს. ზომა ბრაუზერისაა და არა ჩვენი გამოთვლა —
 * შრიფტსა და ენას თავისით მიჰყვება.
 *
 * ⚠️ **ასლის ტექსტი CSS-ით იხატება** (`attr(data-label)`) და არა DOM-ის
 * ტექსტით: თორემ ღილაკის ტექსტში ყველა სტატუსის სახელი ერთად ჩაიწერებოდა —
 * ეკრანის წამკითხველიც და ტექსტით ძებნაც ამას წაიკითხავდა.
 * ⚠️ ასლი ბეჯის იმავე კომპონენტია (იგივე შიგნითა დაშორება და შრიფტი) და
 * აიქონისა და ისრის ადგილსაც იკავებს.
 */
function StatusSizer({ labels, children }: { labels: readonly string[]; children: ReactNode }) {
  return (
    <span className="inline-grid" data-status-sizer>
      {labels.map((label, index) => (
        <Badge
          key={`${label}-${index}`}
          size="row"
          aria-hidden
          className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap"
        >
          <span className="size-3.5 shrink-0" />
          <span data-label={label} className="before:content-[attr(data-label)]" />
          <span className="size-3.5 shrink-0" />
        </Badge>
      ))}
      <span className="col-start-1 row-start-1 grid">{children}</span>
    </span>
  )
}

interface MenuOption {
  key: string
  selected: boolean
  /** სიის პუნქტი — სახელი აიქონითა და ფერით */
  node: ReactNode
  pick: () => void
}

/** ორივე სახეობის (ლექსიკონი · enum) საერთო სხეული */
function RowStatusMenu({
  label,
  sizes,
  current,
  options,
  className,
}: {
  /** ტრიგერის `aria-label` — „სტატუსი" მოდულის ენაზე */
  label: string
  /** ყველა სახელი, რაც ამ ღილაკზე შეიძლება ეწეროს — სიგანეს ადგენს */
  sizes: readonly string[]
  /** ახლანდელი სტატუსის ბეჯი */
  current: ReactNode
  options: MenuOption[]
  className?: string
}) {
  return (
    <ActionMenu
      label={label}
      trigger={
        <button type="button" className={cn('cursor-pointer rounded-md', className)} data-status-menu>
          <StatusSizer labels={sizes}>{current}</StatusSizer>
        </button>
      }
    >
      {options.map((option) => (
        <ActionMenuClose key={option.key} asChild>
          <button type="button" className={actionItemClass()} onClick={option.pick}>
            <Check className={cn('fb-selected size-3.5', option.selected ? 'opacity-100' : 'opacity-0')} />
            {option.node}
          </button>
        </ActionMenuClose>
      ))}
    </ActionMenu>
  )
}

/** enum-სტატუსი — წიგნი, თამაში, კურსი, ადგილი (სახელი i18n-იდან) */
export function EnumStatusMenu<S extends string>({
  domain,
  value,
  options,
  label,
  onChange,
  className,
}: {
  domain: EnumStatusDomain
  value: S
  options: readonly S[]
  /** ტრიგერის `aria-label` — „სტატუსი" მოდულის ენაზე */
  label: string
  onChange: (next: S) => void
  className?: string
}) {
  const { t } = useTranslation()
  const nameOf = (status: string) => {
    const key = enumStatusKey(domain, status)
    return key ? t(key) : status
  }

  return (
    <RowStatusMenu
      label={label}
      className={className}
      sizes={options.map(nameOf)}
      current={<EnumStatusBadge domain={domain} status={value} size="row" className={TRIGGER_BADGE} trailing={ARROW} />}
      options={options.map((s) => ({
        key: s,
        selected: value === s,
        node: <EnumStatusLabel domain={domain} status={s} />,
        pick: () => onChange(s),
      }))}
    />
  )
}

/**
 * ლექსიკონის სტატუსი — ფილმი, სერიალი, ანიმე, ვიდეო, ბუკმარკი, ჩანაწერი, პირადი
 * მოდული (სახელი ლექსიკონიდან, შინაარსის ენაზე).
 */
export function DictionaryStatusMenu({
  status,
  statuses,
  label,
  emptyLabel,
  onChange,
}: {
  status: Status | null
  statuses: readonly Status[]
  /** ტრიგერის `aria-label` */
  label: string
  /** სტატუსის გარეშე ჩანაწერის ტექსტი */
  emptyLabel: string
  onChange: (key: string) => void
}) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  return (
    <RowStatusMenu
      label={label}
      // ⚠️ უსტატუსო ჩანაწერის წარწერაც ითვლება — ისიც ამ ღილაკზე იწერება
      sizes={[...statuses.map((s) => statusName(s, lang)), emptyLabel]}
      current={
        status ? (
          <StatusBadge status={status} size="row" className={TRIGGER_BADGE} trailing={ARROW} />
        ) : (
          <Badge size="row" className={cn(TRIGGER_BADGE, 'bg-secondary')}>
            {emptyLabel}
            {ARROW}
          </Badge>
        )
      }
      options={statuses.map((s) => ({
        key: String(s.id),
        selected: status?.id === s.id,
        node: <StatusLabel status={s} />,
        pick: () => onChange(s.key),
      }))}
    />
  )
}
