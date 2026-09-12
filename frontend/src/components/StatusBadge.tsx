import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
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
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_BADGE[statusTone(status)],
        className,
      )}
    >
      {statusName(status, lang)}
    </span>
  )
}
