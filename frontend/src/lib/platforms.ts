import { Clapperboard, HardDrive, Link2, SquarePlay, Video, type LucideIcon } from 'lucide-react'
import type { VideoPlatform } from '@/api/videos'

/* ============================================================
   **ვიდეოს პლატფორმის რუკა** (Tasks §19.1) — აიქონი, ფერი, სახელი.

   ⚠️ **ფერი CSS-ცვლადია და არა hex** (`--platform-*`, `index.css`, ორივე
   თემაში): YouTube-ის წითელი მუქ ფონზე ოდნავ ღიაა, თორემ ჩამქრალ ფონზე
   (15 %) ტექსტი არ იკითხებოდა. ბრენდის სახელები აქ წერია („YouTube“ და არა
   `youtube`) — ისინი არ ითარგმნება; „ფაილი“ და „სხვა“ i18n-იდან მოდის.

   ⚠️ lucide 1.x-ს ბრენდ-აიქონები (`Youtube`, `Vimeo`) აღარ აქვს — YouTube-ს
   `SquarePlay` უდგას (ლოგოს ფორმაა), Vimeo-ს `Video`, Dailymotion-ს
   `Clapperboard`; ბრენდს ფერი ამოაცნობინებს.
   ============================================================ */

export interface PlatformLook {
  icon: LucideIcon
  /** CSS-მნიშვნელობა — `var(--platform-…)` */
  color: string
  /** ბრენდის სახელი ან i18n გასაღები (`videoPlatforms.*`) */
  label: string
  i18n?: boolean
}

export const PLATFORMS: Record<VideoPlatform, PlatformLook> = {
  youtube: { icon: SquarePlay, color: 'var(--platform-youtube)', label: 'YouTube' },
  vimeo: { icon: Video, color: 'var(--platform-vimeo)', label: 'Vimeo' },
  dailymotion: { icon: Clapperboard, color: 'var(--platform-dailymotion)', label: 'Dailymotion' },
  file: { icon: HardDrive, color: 'var(--platform-file)', label: 'videoPlatforms.file', i18n: true },
  other: { icon: Link2, color: 'var(--platform-other)', label: 'videoPlatforms.other', i18n: true },
}

export function platformLook(platform: string | null | undefined): PlatformLook {
  return (platform && PLATFORMS[platform as VideoPlatform]) || PLATFORMS.other
}

/** სახელი — ბრენდი როგორც არის, ზოგადი — თარგმნილი */
export function platformLabel(platform: string | null | undefined, t: (key: string) => string): string {
  const look = platformLook(platform)
  return look.i18n ? t(look.label) : look.label
}

/* Tasks §29.3 — **ჰოსტიდან პლატფორმა**: კურსის `platform` ჰოსტის სტრიქონია
   („youtube.com“, `Course::applyUrl`), ვიდეოსი — enum. ერთი რუკა, რომ კურსის
   სიაშიც და ფანჯარაშიც ბრენდის სახელი და ფერი ეწეროს, უცნობ ჰოსტს კი
   თვითონ ჰოსტი („udemy.com“). */
const HOSTS: Record<string, VideoPlatform> = {
  'youtube.com': 'youtube',
  'm.youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'youtube-nocookie.com': 'youtube',
  'vimeo.com': 'vimeo',
  'player.vimeo.com': 'vimeo',
  'dailymotion.com': 'dailymotion',
  'dai.ly': 'dailymotion',
}

export function platformFromHost(host: string | null | undefined): VideoPlatform | null {
  if (!host) return null

  return HOSTS[host.toLowerCase().replace(/^www\./, '')] ?? null
}

/** ჰოსტის სახელი ეკრანისთვის — ცნობილი პლატფორმა ბრენდით, დანარჩენი ჰოსტივე */
export function hostLabel(host: string | null | undefined, t: (key: string) => string): string | null {
  if (!host) return null
  const platform = platformFromHost(host)

  return platform ? platformLabel(platform, t) : host
}
