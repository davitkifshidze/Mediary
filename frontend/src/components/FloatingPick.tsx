import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dices } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAYER_FLOAT } from '@/lib/layers'
import { MODULE_ACCENT_FALLBACK, modAccent, useModules } from '@/lib/modules'

/* ============================================================
   **მოტივტივე კამათელი — „რა ვნახო დღეს"**.

   ⚠️ **სათაურის ზოლიდან აქ გადმოვიდა** შენი მოთხოვნით: FB-ჩატის სტილის წრე
   მარჯვენა ქვედა კუთხეში, მოდულის ფერით. `--player-h`/`--player-w`-ით
   იწევს — დამკვრელის ზოლი და გვერდითა პანელი ვერ დაფარავენ (იგივე წესი,
   რაც რიგის ტოსტს აქვს `ui/queue.tsx`-ში).

   ⚠️ **წარწერა მუდამ ჩანს და ციკლად იწერება**: ასო-ასო
   (70 ms/ასო, მბჟუტავი კურსორით) → 1.5 წამი დგას → ასო-ასო იშლება → მოკლე
   პაუზა → თავიდან, სამუდამოდ. ადრე სესიაში ერთხელ იწერებოდა და ქრებოდა
   (`sessionStorage`) — შენი სიტყვით „სულ გამოდიოდეს". ჰოვერზე სრული ტექსტი
   უმალ ჩანს; ციკლი ქვემოთ გრძელდება. ბიბლიოთეკის გარეშე: ტაიმერი + CSS.

   ⚠️ ბუშტი `aria-hidden`-ია: ღილაკს იგივე სრული ტექსტი `aria-label`-ად აქვს,
   ნახევრად აკრეფილი სიტყვა ეკრანის მკითხველს არაფერს ეტყოდა.

   ⚠️ **`prefers-reduced-motion`-ზე ციკლი არ არის** — სრული ტექსტი უძრავად
   დგას; ჩამოვარდნის ანიმაცია და კურსორის ციმციმი `index.css`-ში იმავე
   მედია-წესის ქვეშაა.

   ⚠️ `rounded-full` — შენი მოთხოვნაა („წრე"), `CLAUDE.md`-ის წესის ცხადი
   გამონაკლისი ავატარების/გადამრთველების გვერდით.
   ============================================================ */

const LETTER_MS = 70
const ERASE_MS = 45
const HOLD_MS = 1500
const PAUSE_MS = 600

type Phase = 'typing' | 'hold' | 'erasing' | 'pause' | 'still'

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function FloatingPick({ module, onOpen }: { module: string; onOpen: () => void }) {
  const { t } = useTranslation()
  const { all } = useModules()
  const color = all.find((m) => m.key === module)?.color ?? null
  const text = t('pick.title')

  const [phase, setPhase] = useState<Phase>(() => (reducedMotion() ? 'still' : 'typing'))
  const [typed, setTyped] = useState(0)
  const [hover, setHover] = useState(false)

  // ერთი ტაიმერი თითო ფაზაზე: წერა/წაშლა — ინტერვალი, დგომა/პაუზა — ერთჯერადი
  useEffect(() => {
    if (phase === 'still') return
    if (phase === 'typing' || phase === 'erasing') {
      const typing = phase === 'typing'
      const timer = window.setInterval(
        () => setTyped((n) => (typing ? Math.min(text.length, n + 1) : Math.max(0, n - 1))),
        typing ? LETTER_MS : ERASE_MS,
      )
      return () => window.clearInterval(timer)
    }
    const timer = window.setTimeout(
      () => setPhase(phase === 'hold' ? 'erasing' : 'typing'),
      phase === 'hold' ? HOLD_MS : PAUSE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [phase, text.length])

  // ბოლო ასოს შემდეგ — „დგას"; ბოლო წაშლის შემდეგ — პაუზა
  useEffect(() => {
    if (phase === 'typing' && typed >= text.length) setPhase('hold')
    else if (phase === 'erasing' && typed <= 0) setPhase('pause')
  }, [phase, typed, text.length])

  const full = hover || phase === 'still'
  const shown = full ? text : text.slice(0, typed)

  return (
    <div
      className={cn(
        // `--player-lift`: მოტივტივე ვიდეო ამ კუთხეს თუ ფარავს, კამათელი მის ზემოთ ადის
        'fixed bottom-[calc(1.5rem+var(--player-h,0px)+var(--player-lift,0px))] right-[calc(1.5rem+var(--player-w,0px))] flex items-center gap-3',
        LAYER_FLOAT,
      )}
      style={modAccent(color) ?? MODULE_ACCENT_FALLBACK}
    >
      <div
        aria-hidden
        id="floating-pick-tip"
        data-phase={phase}
        className="fb-card pointer-events-none whitespace-nowrap rounded-md border border-border bg-card px-3 py-2 text-sm font-medium shadow-md"
      >
        {shown}
        {!full && (
          <span className="fb-caret ml-px inline-block text-[var(--mod)]" data-caret>
            |
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-label={text}
        className="fb-float grid size-14 cursor-pointer place-items-center rounded-full bg-[var(--mod)] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <Dices className="size-6" />
      </button>
    </div>
  )
}
