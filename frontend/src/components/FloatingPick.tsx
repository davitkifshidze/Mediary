import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dices } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAYER_FLOAT } from '@/lib/layers'
import { MODULE_ACCENT_FALLBACK, modAccent, useModules } from '@/lib/modules'
import { sessionGet, sessionSet } from '@/lib/storage'

/* ============================================================
   **მოტივტივე კამათელი — „რა ვნახო დღეს"** (Tasks §17.2/§17.3).

   ⚠️ **სათაურის ზოლიდან აქ გადმოვიდა** შენი მოთხოვნით: FB-ჩატის სტილის წრე
   მარჯვენა ქვედა კუთხეში, მოდულის ფერით. `--player-h`/`--player-w`-ით
   იწევს — დამკვრელის ზოლი და გვერდითა პანელი ვერ დაფარავენ (იგივე წესი,
   რაც რიგის ტოსტს აქვს `ui/queue.tsx`-ში).

   ⚠️ **ბუშტი ასო-ასო იწერება სესიაში ერთხელ** (`sessionStorage`): ყოველ
   გვერდზე რომ იწერებოდეს, მეორე დღეს უკვე ხმაური იქნებოდა. ბოლოს 4 წამი
   დგას და ქრება; ჰოვერზე სრული ტექსტი უმალ ჩანს — ვინც დაელოდება, კითხულობს,
   ვინც არა, უბრალოდ თულთიპს ხედავს. ბიბლიოთეკის გარეშე: `setInterval` + CSS.

   ⚠️ **`prefers-reduced-motion`-ზე ასო-ასო არ იწერება** — ტექსტი უმალ სრულია;
   ჩამოვარდნის ანიმაცია და კურსორის ციმციმი `index.css`-ში იმავე მედია-წესის
   ქვეშაა.

   ⚠️ `rounded-full` — შენი მოთხოვნაა („წრე"), `CLAUDE.md`-ის წესის ცხადი
   გამონაკლისი ავატარების/გადამრთველების გვერდით.
   ============================================================ */

const TIP_KEY = 'pick_tip_shown'
const LETTER_MS = 60
const HOLD_MS = 4000

type Phase = 'typing' | 'hold' | 'hidden'

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function FloatingPick({ module, onOpen }: { module: string; onOpen: () => void }) {
  const { t } = useTranslation()
  const { all } = useModules()
  const color = all.find((m) => m.key === module)?.color ?? null
  const text = t('pick.title')

  const [phase, setPhase] = useState<Phase>(() => (sessionGet(TIP_KEY) ? 'hidden' : 'typing'))
  const [typed, setTyped] = useState(() => (sessionGet(TIP_KEY) || reducedMotion() ? text.length : 0))
  const [hover, setHover] = useState(false)

  // ასო-ასო: ყოველ 60 ms-ში ერთი სიმბოლო (ერთი ინტერვალი და არა ტაიმერი ყოველ რენდერზე)
  useEffect(() => {
    if (phase !== 'typing') return
    const timer = window.setInterval(() => setTyped((n) => n + 1), LETTER_MS)
    return () => window.clearInterval(timer)
  }, [phase])

  // ბოლო ასოს შემდეგ — „დგას"
  useEffect(() => {
    if (phase === 'typing' && typed >= text.length) setPhase('hold')
  }, [phase, typed, text.length])

  // დგას 4 წამი და ქრება; სესიაში მეორედ აღარ იწერება
  useEffect(() => {
    if (phase !== 'hold') return
    sessionSet(TIP_KEY, '1')
    const timer = window.setTimeout(() => setPhase('hidden'), HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  const bubble = hover || phase !== 'hidden'
  const shown = hover || phase === 'hold' ? text : text.slice(0, typed)

  return (
    <div
      className={cn(
        'fixed bottom-[calc(1.5rem+var(--player-h,0px))] right-[calc(1.5rem+var(--player-w,0px))] flex items-center gap-3',
        LAYER_FLOAT,
      )}
      style={modAccent(color) ?? MODULE_ACCENT_FALLBACK}
    >
      {bubble && (
        <div
          role="tooltip"
          id="floating-pick-tip"
          data-phase={phase}
          className="fb-card pointer-events-none whitespace-nowrap rounded-md border border-border bg-card px-3 py-2 text-sm font-medium shadow-md"
        >
          {shown}
          {phase === 'typing' && !hover && (
            <span aria-hidden className="fb-caret ml-px inline-block text-[var(--mod)]">
              |
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-label={text}
        aria-describedby={bubble ? 'floating-pick-tip' : undefined}
        className="fb-float grid size-14 cursor-pointer place-items-center rounded-full bg-[var(--mod)] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <Dices className="size-6" />
      </button>
    </div>
  )
}
