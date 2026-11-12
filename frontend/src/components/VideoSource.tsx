import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import type { VideoOrigin } from '@/api/videos'
import { moduleName, useModules } from '@/lib/modules'
import { resultPath } from '@/lib/searchResults'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'

/* ============================================================
   **„წყარო: ბუკმარკი — <სახელი> →"** — საიდან მოვიდა ვიდეო.

   ვიდეოების მოდულში ჩანს ის, რაც ბმულით ხელით დაემატა, და ის, რაც სხვა
   მოდულიდან ცხადად გადმოვიდა; მეორეს წყარო აწერია — ბარათზე, სტრიქონში და
   ფანჯარაში ერთი და იგივე კომპონენტით.

   ⚠️ **მისამართი ძებნის შედეგის წესით იგება** (`resultPath`): მოდულის ფესვი
   `GET /api/modules`-იდან მოდის და არა აქედან; მსახიობს თავისი გვერდი აქვს.
   ⚠️ **სათაურის გარეშე წყარო ბმული არ არის** — ჩანაწერი ურნაშია, წაშლილია ან
   დამალულია, ე.ი. გასახსნელი არაფერია; მოდულის სახელი მაინც იწერება.
   ============================================================ */

/** წყაროს მისამართი, ან `null` — თუ გასახსნელი არაფერია */
export function originPath(origin: VideoOrigin, routeBase: string | undefined, name: string | null): string | null {
  if (!name) return null
  if (origin.kind === 'actor') return `/actors/${origin.id}`

  return resultPath({ domain: origin.kind, id: origin.id, title: name }, routeBase)
}

export function VideoSource({
  origin,
  className,
  onNavigate,
}: {
  origin: VideoOrigin | null | undefined
  className?: string
  /** ფანჯრიდან გადასვლისას — ფანჯრის დახურვა */
  onNavigate?: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { all } = useModules()

  if (!origin) return null

  const module = all.find((m) => m.key === origin.module)
  const label = origin.kind === 'actor' ? t('videos.origin.actor') : module ? moduleName(module, i18n.language) : origin.kind
  const name = (lang === 'ka' ? origin.title_ka : null) ?? origin.title ?? origin.title_ka
  const to = originPath(origin, module?.route_base, name)
  const text = name ? t('videos.origin.full', { module: label, name }) : t('videos.origin.moduleOnly', { module: label })
  const icon = <ModuleIcon name={origin.kind === 'actor' ? 'User' : (module?.icon ?? 'Link2')} className="size-3 shrink-0" />

  if (!to) {
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-1', className)} title={text} data-testid="video-source">
        {icon}
        <span className="truncate">{text}</span>
      </span>
    )
  }

  return (
    <Link
      to={to}
      title={text}
      // ბარათზე დაჭერა ვიდეოს ხსნის — წყაროს ბმული თავის გზას მიდის
      onClick={(e) => {
        e.stopPropagation()
        onNavigate?.()
      }}
      className={cn('inline-flex min-w-0 items-center gap-1 hover:text-foreground', className)}
      style={module?.color ? ({ '--mod': module.color } as React.CSSProperties) : undefined}
      data-testid="video-source"
    >
      {icon}
      <span className="truncate">{text}</span>
      <ArrowRight className="size-3 shrink-0" />
    </Link>
  )
}
