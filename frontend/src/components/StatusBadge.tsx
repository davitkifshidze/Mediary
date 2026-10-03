import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, BookOpen, BookOpenCheck, CheckCircle2, Circle, Clock, Gamepad2, MapPin, PlayCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge, type BadgeSize } from '@/components/ui/badge'
import { ModuleIcon } from '@/components/ModuleIcon'
import { STATUS_BADGE, STATUS_TEXT } from '@/lib/statusStyles'
import { statusStyle } from '@/lib/statusColor'
import { enumStatusKey, enumStatusTone, statusName, statusTone, type EnumStatusDomain } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'
import type { Status } from '@/api/types'

/**
 * ჩანაწერის სტატუსი ბეჯად.
 *
 * ⚠️ **სახელი ლექსიკონიდან მოდის და არა i18n-იდან** (Tasks §6.4): სტატუსი
 * per-user-ია და გადაერქმევა — თარგმანის ფიქსირებული გასაღები გადარქმეულს ძველი
 * სახელით დახატავდა. ფერი `role`-ზე გადის, ე.ი. ხელით დამატებულიც ფერადია.
 *
 * Tasks §16 — **აიქონი წინ და საკუთარი ფერი** (`statuses.color`, `statusStyle`):
 * ფერი კლასებს inline `style`-ით ადგება, ე.ი. ფერის გარეშე ძველი როლის ტონი
 * რჩება. `trailing` — ჩამოსაშლელის ისარი; `className` — სიგანე (`min-w-36`).
 */
export function StatusBadge({
  status,
  size,
  className,
  trailing,
  withIcon = true,
}: {
  status: Status | null
  size?: BadgeSize
  className?: string
  /** ჩამოსაშლელი ტრიგერის ისარი და მისთანები — სახელის შემდეგ */
  trailing?: ReactNode
  withIcon?: boolean
}) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  if (!status) return null

  return (
    <Badge size={size} className={cn(STATUS_BADGE[statusTone(status)] ?? 'bg-secondary', className)} style={statusStyle(status, 'badge')}>
      {withIcon && status.icon && <ModuleIcon name={status.icon} className="size-3.5 shrink-0" />}
      <span className="truncate">{statusName(status, lang)}</span>
      {trailing}
    </Badge>
  )
}

/**
 * **სტატუსის სახელი აიქონით და ფერით — სელექტისა და მენიუს პუნქტებისთვის** (Tasks §16.3).
 * ბეჯი არაა: ფონი არ აქვს, მხოლოდ აიქონი ფერადია, რომ სიაში ერთი რიგის სიმაღლე დარჩეს.
 */
export function StatusLabel({ status, className }: { status: Status; className?: string }) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <ModuleIcon
        name={status.icon ?? 'Circle'}
        className={cn('size-3.5 shrink-0', STATUS_TEXT[statusTone(status)])}
        style={statusStyle(status, 'icon')}
      />
      <span className="truncate">{statusName(status, lang)}</span>
    </span>
  )
}

/**
 * **enum-სტატუსის აიქონები** (Tasks §16.3) — ლექსიკონის სტატუსებს აიქონი
 * მონაცემში აქვთ, ამ ოთხს კი კოდში: ერთი რუკა, რომ ბეჯი და მენიუ ერთსა და
 * იმავეს ხატავდეს. ⚠️ `satisfies` სრულ სიას ითხოვს — ახალი enum-სტატუსი
 * აიქონის გარეშე `tsc`-ს აწითლებს.
 */
export const ENUM_STATUS_ICON = {
  book: { to_read: Clock, reading: BookOpen, read: BookOpenCheck, abandoned: Ban },
  game: { to_play: Clock, playing: Gamepad2, finished: CheckCircle2 },
  course: { to_take: Clock, taking: PlayCircle, done: CheckCircle2, dropped: Ban },
  place: { to_visit: MapPin, visited: CheckCircle2 },
} as const satisfies Record<EnumStatusDomain, Record<string, LucideIcon>>

export function enumStatusIcon(domain: EnumStatusDomain, status: string): LucideIcon | null {
  return (ENUM_STATUS_ICON[domain] as Record<string, LucideIcon>)[status] ?? null
}

/**
 * **enum-სტატუსის სახელი აიქონით და ფერით — მენიუს პუნქტებისთვის** (Tasks §29.1):
 * `StatusLabel`-ის ზუსტი ანალოგი წიგნის/თამაშის/კურსის/ადგილის enum-ისთვის.
 */
export function EnumStatusLabel({ domain, status, className }: { domain: EnumStatusDomain; status: string; className?: string }) {
  const { t } = useTranslation()
  const key = enumStatusKey(domain, status)
  const Icon = enumStatusIcon(domain, status) ?? Circle

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Icon className={cn('size-3.5 shrink-0', STATUS_TEXT[enumStatusTone(domain, status)])} />
      <span className="truncate">{key ? t(key) : status}</span>
    </span>
  )
}

/**
 * **enum-სტატუსი ბეჯად** — წიგნი, თამაში, კურსი, ადგილი (Tasks §21).
 *
 * ⚠️ **ერთი კომპონენტი ექვს ადგილას** (ოთხი სია + კურსისა და ადგილის
 * დეტალის ფანჯრები): ოთხ გვერდს ოთხი ხელით დაწერილი ფერის რუკა ჰქონდა,
 * დეტალის ფანჯრებში კი სტატუსი საერთოდ ნაცრისფერი იყო — ერთი და იგივე
 * „ნანახი" სიაში მწვანედ და ფანჯარაში ნაცრისფრად ჩანდა.
 * ⚠️ სახელი i18n-იდანაა — ეს ოთხი ჯერ კიდევ enum-ია (`ENUM_STATUS_NS`).
 * Tasks §16 — აიქონი წინ (`ENUM_STATUS_ICON`), ვიზუალი ლექსიკონის ბეჯისაა.
 */
export function EnumStatusBadge({
  domain,
  status,
  size,
  className,
  trailing,
}: {
  domain: EnumStatusDomain
  status: string
  size?: BadgeSize
  className?: string
  trailing?: ReactNode
}) {
  const { t } = useTranslation()
  const key = enumStatusKey(domain, status)
  const Icon = enumStatusIcon(domain, status)

  return (
    <Badge size={size} className={cn(STATUS_BADGE[enumStatusTone(domain, status)] ?? 'bg-secondary', className)}>
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span className="truncate">{key ? t(key) : status}</span>
      {trailing}
    </Badge>
  )
}
