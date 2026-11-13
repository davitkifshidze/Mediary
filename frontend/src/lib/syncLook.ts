import type { LucideIcon } from 'lucide-react'
import { CircleAlert, CircleCheck, CircleMinus, DownloadCloud, Drama, Languages, ListVideo, SkipForward } from 'lucide-react'
import type { SyncRunKind, SyncRunResult } from '@/api/syncRuns'

/* ============================================================
   **სინქრონიზაციის სახეობისა და შედეგის იერი** — ერთი ადგილი.

   სინქრონიზაციის გვერდის ბარათი, მოდულის გვერდის ბარათი და შედეგების სიის გაშვება
   ერთსა და იმავე სახეობას ხატავენ, ე.ი. აიქონი და ფერი ერთხელ უნდა ეწეროს —
   „მონაცემები" ყველგან ერთი ფერისაა და თვალი მას გვერდიდან გვერდზე ცნობს.

   ⚠️ ფერი `var(--tool-*)`-ია (ორივე თემის მნიშვნელობა `index.css`-შია); ბარათი მას
   `modAccent()`-ით იღებს — hex-იდან Tailwind კლასს ვერ დაბადებს.
   ============================================================ */

export const SYNC_KIND_LOOK: Record<SyncRunKind, { icon: LucideIcon; color: string }> = {
  sync: { icon: DownloadCloud, color: 'var(--tool-sync)' },
  episodes: { icon: ListVideo, color: 'var(--tool-modules)' },
  cast: { icon: Drama, color: 'var(--tool-actors)' },
  translate: { icon: Languages, color: 'var(--tool-translations)' },
}

/** შედეგის აიქონი, მისი ფერი და ნიშნის რბილი ფონი (იგივე ფერის 14%) */
export const SYNC_RESULT_LOOK: Record<SyncRunResult, { icon: LucideIcon; tone: string; soft: string }> = {
  updated: {
    icon: CircleCheck,
    tone: 'text-[var(--icon-ok)]',
    soft: 'bg-[color-mix(in_oklab,var(--icon-ok)_14%,transparent)]',
  },
  unchanged: { icon: CircleMinus, tone: 'text-muted-foreground', soft: 'bg-muted' },
  skipped: {
    icon: SkipForward,
    tone: 'text-[var(--icon-warn)]',
    soft: 'bg-[color-mix(in_oklab,var(--icon-warn)_14%,transparent)]',
  },
  failed: {
    icon: CircleAlert,
    tone: 'text-destructive',
    soft: 'bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)]',
  },
}
