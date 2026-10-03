import type { CSSProperties } from 'react'
import { Gamepad, Gamepad2, Globe, Joystick, Monitor, Smartphone, Sofa, Swords, User, Users, type LucideIcon } from 'lucide-react'
import type { GameMode, GamePlatform } from '@/api/games'
import { resolveStatusColor } from '@/lib/statusColor'

/* ============================================================
   **თამაშის პლატფორმები და რეჟიმები — აიქონი და ფერი** (Tasks §24.1).

   შენი სიტყვები: „პლატფორმები, რეჟიმები რამე ქარდის სტილით, ფერებით და
   შესაბამისი აიქონებით გააკეთო; ჟანრებსაც შესაბამისი ფერები და აიქონები".

   ⚠️ **ფერი CSS-ცვლადია** (`--game-*`, `index.css`, ორივე თემაში) — hex-იდან
   Tailwind-ის კლასი ვერ დაიბადება და მუქ ფონზე ტონი სხვაა. ჟანრის ფერი
   ლექსიკონიდან მოდის (`*_genres.color`, §24.3) იმავე პალიტრით, რაც
   სტატუსებს აქვთ (`lib/statusColor.ts`); უფერო ჟანრი ნაცრისფერია.
   ============================================================ */

export interface MetaLook {
  icon: LucideIcon
  /** CSS-მნიშვნელობა — `var(--game-…)` */
  color: string
}

export const PLATFORM_META: Record<GamePlatform, MetaLook> = {
  pc: { icon: Monitor, color: 'var(--game-pc)' },
  ps5: { icon: Gamepad2, color: 'var(--game-playstation)' },
  ps4: { icon: Gamepad2, color: 'var(--game-playstation)' },
  xbox_series: { icon: Gamepad, color: 'var(--game-xbox)' },
  xbox_one: { icon: Gamepad, color: 'var(--game-xbox)' },
  switch: { icon: Joystick, color: 'var(--game-switch)' },
  mobile: { icon: Smartphone, color: 'var(--game-mobile)' },
}

export const MODE_META: Record<GameMode, MetaLook> = {
  single: { icon: User, color: 'var(--game-single)' },
  multiplayer: { icon: Users, color: 'var(--game-multi)' },
  coop_local: { icon: Sofa, color: 'var(--game-coop-local)' },
  coop_online: { icon: Globe, color: 'var(--game-coop-online)' },
  pvp: { icon: Swords, color: 'var(--game-pvp)' },
}

/** ჟანრის საკუთარი ფერი (CSS) ან `null` — ნაცრისფერი */
export function genreColor(genre: { color?: string | null } | null | undefined): string | null {
  return resolveStatusColor(genre?.color)
}

/**
 * ჩამქრალი ფონი ბარათსა და ჩიპზე: ფონი 15 %, ჩარჩო 45 %, ტექსტი — ფერი.
 * `selected` — სავსე ფონი („ჩემი პლატფორმა“, არჩეული ჩიპი).
 */
export function tintStyle(color: string | null, selected = false): CSSProperties | undefined {
  if (!color) return undefined
  if (selected) return { backgroundColor: color, borderColor: color, color: '#fff' }
  return {
    backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
    borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
    color,
  }
}

/** აიქონის ფილის ფონი — ოდნავ მკვეთრი (28 %) */
export function tileStyle(color: string | null): CSSProperties | undefined {
  return color ? { backgroundColor: `color-mix(in oklab, ${color} 28%, transparent)`, color } : undefined
}
