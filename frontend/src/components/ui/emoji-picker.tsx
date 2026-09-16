import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { EMOJI_GROUPS } from '@/lib/emoji'
import { LAYER_POPUP } from '@/lib/layers'
import { cn } from '@/lib/utils'

/* ============================================================
   **ემოჯების ამრჩევი (Tasks §10.2).**

   ⚠️ **დამოკიდებულების გარეშე.** სია `lib/emoji.ts`-შია (~180 ემოჯი),
   ფანჯარა კი უკვე არსებულ `@radix-ui/react-popover`-ზე დგას — იგივე
   პრიმიტივი, რასაც `InfoHint` და `ActionMenu` იყენებს. სამი რეალური
   ბიბლიოთეკიდან ერთი 100+ kB-ია, მეორე დიდ async მონაცემს ტვირთავს,
   მესამე კი ემოჯებს CDN-იდან იღებს (ოფლაინში ცარიელი).

   ⚠️ **`modal={false}`** — `ActionMenu`-ს იგივე მიზეზი: ფოკუსის ხაფანგის
   გარეშე ის მოდალის შიგნითაც მუშაობს.

   ⚠️ **`onOpenAutoFocus` ითრგუნება**: ამრჩევი კომპოზიტორის გვერდითაა და
   კარეტი ტექსტის ველიდან არ უნდა გავარდეს (`GlobalSearch`-ის დაფიქსირებული
   ქცევა).

   ⚠️ **z-index `LAYER_POPUP`-ია და არა ხელით დაწერილი** — ამრჩევი
   მოდალიდანაც შეიძლება გაიხსნას და `lib/layers.ts` სწორედ ამიტომ არსებობს.
   ============================================================ */

export function EmojiPicker({
  onPick,
  trigger,
  align = 'start',
}: {
  onPick: (emoji: string) => void
  trigger: ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'fb-scroll max-h-72 w-[19rem] overflow-y-auto rounded-md border border-border bg-popover p-3 shadow-lg',
            LAYER_POPUP,
          )}
        >
          {EMOJI_GROUPS.map((group) => (
            <div key={group.key} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                {t(`chat.emojiGroup.${group.key}`)}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {group.items.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onPick(emoji)
                      setOpen(false)
                    }}
                    className="grid size-8 cursor-pointer place-items-center rounded-md text-lg transition-colors hover:bg-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
