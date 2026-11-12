import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Ban,
  Bell,
  Blocks,
  CalendarClock,
  CheckCheck,
  CircleAlert,
  DatabaseBackup,
  HardDrive,
  Layers,
  ListChecks,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { AppNotification } from '@/api/notifications'
import type { SoonKind } from '@/api/soon'
import { soonWhat } from '@/lib/soon'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   შეტყობინების **სახე ეკრანზე** — აიქონი, სათაური და მეორე ხაზი.

   ⚠️ ერთი აღწერა ზარისა და `/notifications` გვერდისთვის: ტექსტი `type`-იდან და
   `data`-ს ფაქტებიდან იგება (ენა ბრაუზერში ირჩევა), ე.ი. ორ ადგილას დაწერილი
   პირველივე ახალ სახეზე დაშორდებოდა.
   ============================================================ */

const ICONS: Record<string, LucideIcon> = {
  request_approved: CheckCheck,
  request_rejected: CircleAlert,
  storage_warning: HardDrive,
  backup_failed: DatabaseBackup,
  batch_done: ListChecks,
  // ინტერფეისიდან შექმნილი მოდული
  module_created: Blocks,
  module_deleted: Trash2,
  module_disabled: Ban,
  share_imported: Share2,
  // დღეს გამოდის — პრემიერა, ახალი სეზონი ან სერია
  release_today: CalendarClock,
  franchise_part: Layers,
  franchise_gaps: Layers,
  new_season: Sparkles,
}

export function notificationIcon(type: string): LucideIcon {
  return ICONS[type] ?? Bell
}

/**
 * ⚠️ **უცნობი სახე ზოგად სათაურს იღებს და არა ნედლ კოდს.** სერვერს
 * მოგვიანებით შეიძლება ახალი ტიპი დაემატოს, ხოლო ბრაუზერში გახსნილი
 * ძველი SPA მას `snake_case`-ად დახატავდა.
 */
export function notificationTitle(t: TFunction, type: string): string {
  const key = `notifications.kind.${type}`
  const text = t(key)

  return text === key ? t('notifications.title') : text
}

type Facts = Record<string, string | number | null | undefined>

/** ჩანაწერის სათაური ინტერფეისის ენაზე — ორივე ენაზე მოდის, ტექსტი ბაზაში არ ინახება */
function recordTitle(d: Facts, lang: string): string {
  return String((lang === 'en' ? d.title_en : d.title_ka) || d.title_en || d.title_ka || '')
}

/** მეორე ხაზი — მოვლენის დეტალი; `null`, თუ სათაურს დასამატებელი არაფერი აქვს */
export function notificationDetail(n: Pick<AppNotification, 'type' | 'data'>, t: TFunction, lang: string): string | null {
  const d = n.data as Facts

  if (n.type === 'storage_warning') {
    return t('notifications.detail.storage', { percent: d.percent, threshold: d.threshold })
  }
  if (n.type === 'backup_failed' && d.name) {
    return t('notifications.detail.backup', { name: d.name })
  }
  if (n.type === 'batch_done') {
    return t('notifications.detail.batch', { total: d.total ?? 0, failed: d.failed ?? 0 })
  }
  /* ვინ და რომელი ბმულიდან (შეტყობინება ერთი მიმღებზე დღეშია,
     ამიტომ რიცხვი აქ არ წერია — ის პირველ ჩანაწერზე იბადება და მოატყუებდა) */
  if (n.type === 'share_imported') {
    return t('notifications.detail.share', {
      name: d.display_name ?? d.username ?? '—',
      link: d.link_name || t('share.unnamed'),
    })
  }
  /* დღეს გამოდის: სათაური + რა გამოდის (პრემიერა · ახალი სეზონი · სერია) */
  if (n.type === 'release_today') {
    const what = soonWhat(
      {
        kind: (d.kind as SoonKind | undefined) ?? 'premiere',
        season: typeof d.season === 'number' ? d.season : null,
        episode: typeof d.episode === 'number' ? d.episode : null,
        tmdb_status: null,
      },
      t,
    )

    return [recordTitle(d, lang), what].filter(Boolean).join(' · ')
  }
  /* ფრანჩაიზს ნაწილი აკლია: რომელი ნაწილი და რომელ ფრანჩაიზში; გამოსვლის დღეს — „დღეს გამოვიდა" */
  if (n.type === 'franchise_part') {
    return [recordTitle(d, lang), d.collection_name, n.data.out_today === true ? t('franchise.outToday') : null]
      .filter(Boolean)
      .join(' · ')
  }
  /* ფრანჩაიზის პირველი შემოწმება: ერთი შეტყობინება ყველა ნაკლულზე */
  if (n.type === 'franchise_gaps') {
    return t('notifications.detail.franchiseGaps', { name: d.collection_name ?? '—', count: Number(d.count) || 0 })
  }
  if (n.type === 'new_season') {
    return [recordTitle(d, lang), typeof d.season === 'number' ? t('soon.kind.season', { season: d.season }) : null]
      .filter(Boolean)
      .join(' · ')
  }
  /* ატვირთვის მოთხოვნა: რა ჩაირთო და **ვისზე** (შეტყობინებამ
     უნდა თქვას, მხოლოდ მისთვის გავრცელდა თუ ყველასთვის) */
  if (d.request_type === 'upload_limit' && d.upload_kind) {
    const formats = Array.isArray(n.data.upload_formats) ? (n.data.upload_formats as string[]) : []
    const what = [
      formats.length ? formats.map((f) => f.toUpperCase()).join(', ') : null,
      d.upload_max_kb ? `≤ ${formatBytes(Number(d.upload_max_kb) * 1024)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    const line = t('notifications.detail.upload', { kind: t(`uploads.kind.${d.upload_kind}`), what })

    return d.upload_scope ? `${line} · ${t(`uploads.scope.${d.upload_scope}`)}` : line
  }
  /* პირადი მოდული: სახელი ორივე ენაზე და (სუპერადმინისთვის) მფლობელი.
     ⚠️ ტექსტი ბაზაში არ ინახება — მხოლოდ ფაქტები და აქ იწყობა. */
  if (n.type === 'module_created' || n.type === 'module_deleted' || n.type === 'module_disabled') {
    const moduleName = (lang === 'en' ? d.module_name_en : d.module_name_ka) ?? d.module_key
    return d.owner_name && n.type !== 'module_disabled'
      ? t('notifications.detail.customModule', { name: moduleName, owner: d.owner_name })
      : t('notifications.detail.module', { name: moduleName })
  }

  // ⚠️ მოდულის სახელი **ორივე ენაზე მოდის** — ინტერფეისის ენა წყვეტს, რომელი
  const name = lang === 'en' ? d.module_en : d.module_ka
  if (name) return t('notifications.detail.module', { name })
  if (d.note) return t('notifications.detail.note', { note: d.note })

  return null
}
