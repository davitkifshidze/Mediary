import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Boxes, Film, Frame, Image, Images, Radio, Sparkles, User, Users } from 'lucide-react'
import { ScopeCard, ScopeGroup } from '@/components/ui/scope-card'

/* ============================================================
   **გალერეის ჭრილები ბარათებად** (Tasks §24).

   შენი სიტყვები: „გალერიაში ყველა კადრი, პოსტერები — ისევე სტილის,
   როგორც ლოგებში მაქვს, ქარდის სტილის ტაბებივით. (ასევე ყველა, მსახიობი
   ქალები, მსახიობი კაცები) (რომელმა წყარომ მოიტანა, რომელი დომენიდან)".

   ⚠️ **ბარათი ხელახლა არ იწერება** — `ui/scope-card.tsx`-ია, იგივე, რასაც
   აუდიტ-ლოგი, მოთხოვნები, სტატუსის მასობრივი შეცვლა და მასობრივი წაშლა
   ხატავენ. აქ მხოლოდ გალერეის სპეციფიკაა: რომელ ჭრილს რომელი ხატულა და
   ტონი შეესაბამება.

   ⚠️ **რიცხვი ფასეტურია და სერვერიდან მოდის.** ჩიპს რიცხვი საერთოდ არ
   ჰქონდა, ე.ი. „კაცები" და „ქალები" ერთნაირად გამოიყურებოდა მაშინაც,
   როცა ერთი ცარიელი იყო. ⚠️ მთვლელი **საკუთარ ჭრილს არ ითვლის**
   (`GalleryGroups.facets`) — თორემ არჩევისთანავე დანარჩენები ნულზე
   ჩამოვიდოდა.

   ⚠️ **ნულიანი ბარათი რჩება და კლიკადია**, მხოლოდ ფერს კარგავს —
   `ScopeCard`-ის არსებული წესი: „აქ არაფერია" პასუხია.
   ============================================================ */

/** ჭრილი → ხატულა და ტონი. ერთი რუკა, რომ ორ ადგილას არ დაიწეროს. */
export const GALLERY_SCOPE_STYLE: Record<string, { icon: LucideIcon; color: string }> = {
  /* ---- „ყველა ფოტო"-ს კატეგორიები (TMDB-ის ტექნიკური ტიპი) ---- */
  all: { icon: Images, color: 'var(--primary)' },
  backdrop: { icon: Frame, color: 'var(--tool-sync)' },
  poster: { icon: Image, color: 'var(--gold)' },
  logo: { icon: Sparkles, color: 'var(--tool-requests)' },
  actor: { icon: User, color: 'var(--tool-people)' },

  /* ---- მსახიობების სქესი (TMDB: 1 = ქალი, 2 = კაცი) ---- */
  female: { icon: User, color: 'var(--favorite)' },
  male: { icon: User, color: 'var(--tool-chat)' },

  /* ---- „წყაროები": ორი სხვადასხვა კითხვა ---- */
  provider: { icon: Radio, color: 'var(--tool-translations)' },
  source: { icon: Film, color: 'var(--tool-sync)' },

  /* ---- ჩანაწერები / მსახიობები ერთი დომენის შიგნით ---- */
  records: { icon: Film, color: 'var(--tool-bulk)' },
  actors: { icon: Users, color: 'var(--tool-people)' },

  /* ---- დანარჩენი ---- */
  module: { icon: Boxes, color: 'var(--tool-modules)' },
}

export interface GalleryScopeOption {
  key: string
  label: string
  /** `undefined` = ამ ჭრილს რიცხვი არ აქვს (ბარათი მაშინ მინიშნებას ხატავს) */
  count?: number
  hint?: string
  icon?: LucideIcon
  /**
   * მზა ხატულა — მოდულის თავისი (`ModuleIcon`), რომელიც `LucideIcon`
   * არ არის.
   *
   * ⚠️ **`icon`-ს ანაცვლებს და არა ემატება**: ორივე რომ დაგვეხატა,
   * დომენის ბარათს ორი ხატულა ექნებოდა და არჩევანი ორაზროვანი გახდებოდა.
   */
  node?: ReactNode
  /** მოდულის თავისი ფერი — დომენის ტაბებს `modules.color` მოსდით */
  color?: string | null
}

export function GalleryScope({
  label,
  options,
  value,
  onChange,
}: {
  label?: string
  options: GalleryScopeOption[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <ScopeGroup label={label}>
      {options.map((option) => {
        const fallback = GALLERY_SCOPE_STYLE[option.key]
        const Icon = option.icon ?? fallback?.icon ?? Images

        return (
          <ScopeCard
            key={option.key}
            active={value === option.key}
            color={option.color ?? fallback?.color ?? 'var(--primary)'}
            icon={option.node ?? <Icon className="size-4 text-[var(--mod)]" />}
            label={option.label}
            count={option.count}
            hint={option.hint}
            onClick={() => onChange(option.key)}
          />
        )
      })}
    </ScopeGroup>
  )
}
