import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FeedbackProvider, useToast } from '@/components/ui/feedback'
import '@/i18n'

/* ============================================================
   რეგრესია: **toast-ის ტაიმერი მეზობლის გამო არ უნდა გადაიწიოს** (Tasks BUG-10).

   ⚠️ ხარვეზი ისეთი იყო, რომ არც `tsc` და არც lint ვერ დაინახავდა:
   `onDismiss={() => dismiss(t.id)}` პროვაიდერის **ყოველ** რენდერზე ახალი
   ფუნქციაა, ე.ი. `ToastCard`-ის `useEffect(..., [duration, onDismiss])`
   `setTimeout`-ს ყოველ ჯერზე თავიდან აწყობდა — ყოველ ახალ toast-ზე, ყოველ
   დახურვაზე და confirm-ის გახსნაზეც. რიგის გაშვებისას (`ui/queue.tsx`
   ციკლში toast-ებს უშვებს) ადრეული toast-ები ვადას ვერ აღწევდნენ და
   ეკრანზე გროვდებოდნენ.

   ⚠️ ერთადერთი, რაც ამას იჭერს, არის კომპონენტის ნამდვილი მიმაგრება ცრუ
   ტაიმერებით — სუფთა ფუნქციის ტესტს აქ საქმე არ აქვს.
   ============================================================ */

// React 19-ის `act()` ამ დროშას ითხოვს, თორემ ეფექტებს არ ატარებს
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

const DURATION = 1000

/** ერთი ცალკე მიმაგრებული ბავშვი, რომელიც toast-ს `title`-ით უშვებს */
function mount() {
  let fire: (title: string) => void = () => {}

  function Harness() {
    const { toast } = useToast()

    useEffect(() => {
      fire = (title: string) => toast({ title, duration: DURATION })
    }, [toast])

    return null
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root!.render(h(FeedbackProvider, null, h(Harness)))
  })

  return {
    fire: (title: string) => act(() => fire(title)),
    advance: (ms: number) => act(() => vi.advanceTimersByTime(ms)),
  }
}

/** ეკრანზე მდგარი toast-ების სათაურები */
const titles = () =>
  [...document.body.querySelectorAll('.fb-toast p.font-medium')].map((n) => n.textContent)

describe('FeedbackProvider', () => {
  it('პირველი toast ვადაზე ქრება მაშინაც, როცა მის შემდეგ სხვები დაემატა', () => {
    const { fire, advance } = mount()

    fire('პირველი')
    advance(400)

    // ⚠️ სწორედ აქ იწყებოდა პირველის ტაიმერი თავიდან
    fire('მეორე')
    advance(400)
    fire('მესამე')

    expect(titles()).toEqual(['პირველი', 'მეორე', 'მესამე'])

    // პირველიდან სულ 1000 მწ — ე.ი. მან უნდა დაასრულოს
    advance(200)
    expect(titles(), 'პირველს ვადა უნდა გასვლოდა').toEqual(['მეორე', 'მესამე'])

    // დანარჩენებიც თავის დროზე, და არა ერთად
    advance(400)
    expect(titles()).toEqual(['მესამე'])

    advance(400)
    expect(titles()).toEqual([])
  })

  it('დახურვის ღილაკი მხოლოდ თავის toast-ს შლის', () => {
    const { fire, advance } = mount()

    fire('პირველი')
    fire('მეორე')

    const close = document.body.querySelectorAll<HTMLButtonElement>('button[aria-label="dismiss"]')
    expect(close.length).toBe(2)

    act(() => close[0].click())
    expect(titles()).toEqual(['მეორე'])

    // ⚠️ დარჩენილს ტაიმერი არ გადასწეულა — 1000 მწ მისი დაბადებიდან ისევ ძალაშია
    advance(DURATION)
    expect(titles()).toEqual([])
  })
})
