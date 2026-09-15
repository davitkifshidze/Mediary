import { Crown, Shield, ShieldCheck, ShieldHalf, type LucideIcon } from 'lucide-react'
import type { Role } from '@/api/account'

/* ============================================================
   **როლის იდენტობა — ერთი რეესტრი ორი გვერდისთვის** (2026-09-15).

   შენი მითითება იყო „სრულიად შემიცვალე და განმიახლე როლების UI/UX".
   სია და შიდა გვერდი ერთსა და იმავე როლს ხატავენ, ე.ი. ხატულა, ტონი და
   „რამდენი უფლება აქვს" **ერთ ადგილას** უნდა გამოითვალოს — თორემ სიაში
   „3 მოდული" ეწერებოდა და შიგნით სხვა რიცხვი დაიხატებოდა.

   ⚠️ **ფერი ძალაუფლების მასშტაბია და არა დეკორაცია.** ეს არის ერთადერთი
   ინფორმაცია, რომელსაც როლების სია უნდა გადმოსცემდეს ერთი შეხედვით:
   ოქროსფერი — შეუზღუდავი (სუპერ-ადმინი), იისფერი — **ადმინის სექციებამდე**
   მიუწვდება ხელი (ე.ი. სხვისი ანგარიშები და ლოგი), ლურჯი — ჩვეულებრივი
   მოდულის უფლებები, ნაცრისფერი — ცარიელი როლი. ხატულაც იმავეს ამბობს,
   რადგან ფერი მარტო დალტონიკისთვის არაფერს ნიშნავს.

   ⚠️ **`admin:` პრეფიქსი backend-ის ნიშანია** (`Role::ADMIN_PREFIX`) — აქ
   ის ერთხელ წერია და სამივე მომხმარებელი (სია, მატრიცა, შეჯამება) ამ ერთ
   მუდმივას კითხულობს.

   ⚠️ **„ყველა მოდულის" ნიღაბი (`"*"`) აღარ არსებობს** (2026-09-15, შენი
   მითითება: „ეს არ მჭირდება, ჩახსნიე ეს ფუნქციონალი"). ის ერთადერთი
   მექანიზმი იყო, რომლითაც *ხვალ დამატებული* მოდული ავტომატურად
   იხსნებოდა — ე.ი. ფასი ცნობილია: **ახალი მოდული ყველა როლზე ცხადად
   უნდა მოინიშნოს**. სამაგიეროდ უფლება ზუსტად იმას ნიშნავს, რაც
   მატრიცაში წერია, და ფარული წყარო აღარ დგას.
   ============================================================ */

/** ადმინის სექციები — სარკე `Role::ADMIN_PREFIX` / `Role::ADMIN_RESOURCES`-ისა */
export const ADMIN_PREFIX = 'admin:'
export const ADMIN_RESOURCES = ['users', 'roles', 'requests', 'audit'] as const

export interface RoleScope {
  /** `permissions === null` — სუპერ-ადმინი, მატრიცა ჩაკეტილია */
  full: boolean
  /** რამდენ მოდულზე აქვს რამე უფლება */
  modules: number
  /** რამდენი ადმინის სექცია აქვს გახსნილი */
  admin: number
  /** სულ რამდენი მონიშვნაა მატრიცაში — „ცარიელი როლის" ერთადერთი საზომი */
  actions: number
}

export function roleScope(role: Role): RoleScope {
  const perms = role.permissions
  if (perms === null) return { full: true, modules: 0, admin: 0, actions: 0 }

  const keys = Object.keys(perms).filter((k) => (perms[k]?.length ?? 0) > 0)
  return {
    full: false,
    modules: keys.filter((k) => !k.startsWith(ADMIN_PREFIX)).length,
    admin: keys.filter((k) => k.startsWith(ADMIN_PREFIX)).length,
    actions: keys.reduce((n, k) => n + (perms[k]?.length ?? 0), 0),
  }
}

/** ტონი — თემის ტოკენი და არა hex (მუქ თემაზე თვითონვე ირგებს) */
export function roleTone(scope: RoleScope): string {
  if (scope.full) return 'var(--gold)'
  if (scope.admin > 0) return 'var(--tool-roles)'
  if (scope.modules > 0) return 'var(--icon-info)'
  return 'var(--muted-foreground)'
}

export function roleIcon(scope: RoleScope): LucideIcon {
  if (scope.full) return Crown
  if (scope.admin > 0) return ShieldCheck
  if (scope.modules > 0) return ShieldHalf
  return Shield
}
