import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Badge, type BadgeSize } from '@/components/ui/badge'
import { STATUS_BADGE } from '@/lib/statusStyles'
import { enumStatusKey, enumStatusTone, statusName, statusTone, type EnumStatusDomain } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'
import type { Status } from '@/api/types'

/**
 * ჩანაწერის სტატუსი ბეჯად.
 *
 * ⚠️ **სახელი ლექსიკონიდან მოდის და არა i18n-იდან** (Tasks §6.4): სტატუსი
 * per-user-ია და გადაერქმევა — თარგმანის ფიქსირებული გასაღები გადარქმეულს ძველი
 * სახელით დახატავდა. ფერი კი `role`-ზე გადის, ე.ი. ხელით დამატებულიც
 * ფერადია.
 */
export function StatusBadge({
  status,
  size,
  className,
}: {
  status: Status | null
  size?: BadgeSize
  className?: string
}) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  if (!status) return null

  return (
    <Badge size={size} className={cn(STATUS_BADGE[statusTone(status)] ?? 'bg-secondary', className)}>
      {statusName(status, lang)}
    </Badge>
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
 */
export function EnumStatusBadge({
  domain,
  status,
  size,
  className,
}: {
  domain: EnumStatusDomain
  status: string
  size?: BadgeSize
  className?: string
}) {
  const { t } = useTranslation()
  const key = enumStatusKey(domain, status)

  return (
    <Badge size={size} className={cn(STATUS_BADGE[enumStatusTone(domain, status)] ?? 'bg-secondary', className)}>
      {key ? t(key) : status}
    </Badge>
  )
}
