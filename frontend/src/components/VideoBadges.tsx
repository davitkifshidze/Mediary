import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleDashed } from 'lucide-react'
import type { Video } from '@/api/videos'
import { videoTypeName } from '@/lib/display'
import { platformLabel, platformLook } from '@/lib/platforms'
import { resolveStatusColor } from '@/lib/statusColor'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ModuleIcon } from '@/components/ModuleIcon'
import { StatusBadge } from '@/components/StatusBadge'

/* ============================================================
   **ვიდეოს სამი ბეჯი ერთი ზომით — ტიპი · სტატუსი · პლატფორმა** (Tasks §19.3).

   შენი სიტყვები: „„გასართობი“, „გადაუწყვეტელი“ და youtube — სამივეს ჰქონდეს
   რაღაც ბექგრაუნდი: YouTube-ს წითელი, სტატუსს და ტიპს თავისი შესაბამისი;
   ერთი სიმაღლისა და სიგანის რომ იყოს“.

   ⚠️ **ერთი კომპონენტი ბარათსაც და დეტალის ფანჯარასაც** (§19.6) — ფანჯარაში
   აქამდე სამივე საერთოდ არ ჩანდა. ზომა ერთი კლასია (`BADGE`): `h-7`,
   `min-w-24`, ცენტრირებული, ჩამქრალი ფონი (`color-mix … 15%`). ტიპის ფერი
   ლექსიკონიდან მოდის (`video_types.color`, §19.2), პლატფორმისა — რუკიდან
   (`lib/platforms.ts`), სტატუსისა — §16-ის `StatusBadge`-იდან.

   ⚠️ **სლოტი ყოველთვის სამია**: უტიპო ან უსტატუსო ვიდეოზე ნაცრისფერი
   „— გარეშე“ ბეჯი დგას, რომ ბარათიდან ბარათზე სტრიქონი არ იცვლებოდეს (§14.2).
   ============================================================ */

export const VIDEO_BADGE = 'h-7 min-w-24 justify-center px-2 text-xs'

export function MetaBadge({
  icon,
  label,
  color,
  className,
  title,
}: {
  icon: ReactNode
  label: string
  /** CSS-მნიშვნელობა; `null` — ნაცრისფერი */
  color: string | null
  className?: string
  title?: string
}) {
  const style: CSSProperties | undefined = color
    ? { backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`, color }
    : undefined

  return (
    <Badge className={cn(VIDEO_BADGE, !color && 'bg-secondary text-muted-foreground', className)} style={style} title={title}>
      <span className="inline-flex shrink-0 [&_svg]:size-3.5">{icon}</span>
      <span className="truncate">{label}</span>
    </Badge>
  )
}

export function VideoBadges({ video, lang, className }: { video: Video; lang: 'ka' | 'en'; className?: string }) {
  const { t } = useTranslation()
  const platform = platformLook(video.platform)
  const PlatformIcon = platform.icon

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} data-testid="video-badges">
      <MetaBadge
        icon={video.type ? <ModuleIcon name={video.type.icon} /> : <CircleDashed />}
        label={video.type ? videoTypeName(video.type, lang) : t('videos.noType')}
        color={video.type ? resolveStatusColor(video.type.color) : null}
      />
      {video.status ? (
        <StatusBadge status={video.status} className={VIDEO_BADGE} />
      ) : (
        <MetaBadge icon={<CircleDashed />} label={t('videos.noStatus')} color={null} />
      )}
      <MetaBadge icon={<PlatformIcon />} label={platformLabel(video.platform, t)} color={platform.color} />
    </div>
  )
}
