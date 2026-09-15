import { Layers, Shuffle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/* ============================================================
   **„დაჯგუფებული ↔ არეული" — ერთი გადამრთველი მთელ გალერეაზე** (Tasks §28).

   შენი სიტყვები: „შიგნით კიდე შეიძლებოდეს დაჯგუფების მონიშვნა, ან არეულად
   ჩვენება, ან შეკრება… აბსოლუტურად ყველა ვარიანტი ყველა გალერეის მოდულში".

   ⚠️ **ეს ჭრილი არ არის.** ჭრილი კითხვას ცვლის („ჩანაწერები თუ მსახიობები"),
   ხედი კი **ერთი და იმავე სკოუპის** ორ გამოსახულებას: `grouped` —
   თითო ბარათი ჯგუფია (ჩანაწერი · მსახიობი · ალბომი), `mixed` — თითო უჯრა
   ერთი ფოტოა. ამიტომ ის ჭრილის ბარათებთან (`GalleryScope`) არ ერევა.

   ⚠️ **რატომ ცალკე ფაილი.** იგივე გადამრთველი სამ ადგილას დგას —
   ჩანაწერის მსახიობების ქვე-სექცია, ჯგუფების ჭრილის ფილტრის ზოლი და
   უკატეგორიო. სამი ასლი სამნაირად გამოიყურებოდა (ერთგან სეგმენტები,
   მეორეგან სელექტი), და სწორედ ესაა ის, რასაც §28.1 ითხოვს: **ერთი**
   ხედის კონტროლი.

   ⚠️ **`transition-transform` აქ განზრახ არაა** — `index.css`-ის გლობალური
   წესი ხატულებს hover-ზე ამოძრავებს და ამ კლასს ოპტ-აუტად კითხულობს.
   ============================================================ */

export type GalleryLayout = 'grouped' | 'mixed'

export function LayoutToggle({
  value,
  onChange,
  className,
}: {
  value: GalleryLayout
  onChange: (next: GalleryLayout) => void
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div className={cn('flex items-center gap-0.5 rounded-md border border-border p-0.5', className)}>
      {(
        [
          { key: 'grouped' as GalleryLayout, icon: Layers },
          { key: 'mixed' as GalleryLayout, icon: Shuffle },
        ] satisfies { key: GalleryLayout; icon: typeof Layers }[]
      ).map(({ key, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
            value === key
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {t(`gallery.layout.${key}`)}
        </button>
      ))}
    </div>
  )
}
