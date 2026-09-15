import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { STATUS_BADGE } from '@/lib/statusStyles'
import { statusName, statusTone } from '@/lib/statuses'
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
  className,
}: {
  status: Status | null
  className?: string
}) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  if (!status) return null

  return (
    <Badge className={cn(STATUS_BADGE[statusTone(status)] ?? 'bg-secondary', className)}>
      {statusName(status, lang)}
    </Badge>
  )
}
