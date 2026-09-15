import type { LucideIcon } from 'lucide-react'
import {
  CircleSlash,
  Eye,
  Languages,
  LogIn,
  LogOut,
  MessageSquareX,
  Plus,
  SquarePen,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react'

/* ============================================================
   **მოქმედების ხატულა და ტონი — ერთი რეესტრი** (2026-09-15).

   ⚠️ **ფერი მნიშვნელობისაა და არა დეკორაცია**: წაშლა წითელია, დამატება
   მწვანე, რედაქტირება ლურჯი, ნახვა — ნეიტრალური ინფო-ფერი. თვალი ჯერ
   ფერს კითხულობს და მერე წარწერას; სწორედ ამიტომ ვერ ასრულებდა
   თერთმეტი ერთნაირი ტაბი ამ საქმეს აუდიტ-ლოგში.

   ⚠️ **რუკა აუდიტიდან აქ ამოვიდა, რადგან მეორე მომხმარებელი გაჩნდა** —
   როლების მატრიცა ზუსტად იმავე ოთხ მოქმედებას ხატავს (ნახვა · დამატება ·
   რედაქტირება · წაშლა). ორი ასლი ნიშნავდა, რომ ერთგან „წაშლა" წითელი
   იქნებოდა და მეორეგან ნაცრისფერი.

   ⚠️ **მნიშვნელობები თემის ტოკენებია და არა hex-ები** — `modAccent()`
   მათ `color-mix()`-ში სვამს, ე.ი. `var(--destructive)` სავსებით
   მუშაობს და მუქ თემაზე თვითონვე ირგებს ფერს. მეორე პალიტრა არ იბადება.

   ⚠️ **ანიმაცია აქ არ იწერება** — ხატულები `index.css`-ის გლობალურ წესს
   ემორჩილება (ურნა ირხევა, კალამი წერს, „+" იზრდება), რადგან ორივე
   მომხმარებელი მათ `<button>`-ის შიგნით ხატავს.
   ============================================================ */

export type ActionStyle = { icon: LucideIcon; color: string }

const ACTION_STYLE: Record<string, ActionStyle> = {
  /* ---- როლების მატრიცა (module-internal CRUD) ---- */
  view: { icon: Eye, color: 'var(--icon-info)' },
  create: { icon: Plus, color: 'var(--icon-ok)' },
  update: { icon: SquarePen, color: 'var(--icon-info)' },
  delete: { icon: Trash2, color: 'var(--destructive)' },

  /* ---- აუდიტ-ლოგის დანარჩენი მოქმედებები ---- */
  login: { icon: LogIn, color: 'var(--icon-ok)' },
  logout: { icon: LogOut, color: 'var(--status-undecided)' },
  register: { icon: UserPlus, color: 'var(--gold)' },
  // ⚠️ `visit` („სექციაში შესვლა") და `view` (უფლება) სხვადასხვა ფაქტია,
  // ერთ ხატულას კი განზრახ იზიარებენ — ორივე „ნახვაა"
  visit: { icon: Eye, color: 'var(--icon-info)' },
  chat_delete: { icon: MessageSquareX, color: 'var(--destructive)' },
  cast_attach: { icon: UserPlus, color: 'var(--icon-ok)' },
  cast_detach: { icon: UserMinus, color: 'var(--destructive)' },
  translate: { icon: Languages, color: 'var(--favorite)' },
}

/**
 * უცნობი მოქმედება ნეიტრალურად იხატება და **არ** ქრება: backend-ს ახალი
 * `AuditLog::ACTION_*` ხვალაც შეიძლება დაემატოს, ხატულის უქონელი რიგი კი
 * ჩუმად გამქრალი ჭრილი იქნებოდა.
 */
export function actionStyle(key: string): ActionStyle {
  return ACTION_STYLE[key] ?? { icon: CircleSlash, color: 'var(--muted-foreground)' }
}
