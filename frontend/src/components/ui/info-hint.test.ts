import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { InfoHint } from '@/components/ui/info-hint'
import '@/i18n'

/* ============================================================
   რეგრესია: **დაჭერა ხსნის ახსნას** (Tasks §3.7).

   ⚠️ ეს ზუსტად ის დეფექტია, რომლის გამოც `Tooltip` არ გამოდგა:
   `@radix-ui/react-tooltip` შეხებას პირდაპირ აგდებს
   (`pointerType === "touch"` → `return`), `onPointerDown` ხურავს და
   `onClick` ხურავს — ე.ი. **ტელეფონზე დაჭერა არაფერს ხსნის**. თუ ვინმე
   `InfoHint`-ს ისევ `Tooltip`-ზე გადაიყვანს, ეს ტესტი ჩავარდება; სხვა
   ვერაფერი დაიჭერს — JSX ორივე შემთხვევაში ვალიდურია და `tsc`-ს
   განსხვავება არ ეტყობა.

   ⚠️ ჰოვერი განზრახ **არ** მოწმდება: jsdom-ში `mouseenter` რეალურ
   მაუსს არ ბაძავს და ტესტი ჭეშმარიტ ქცევას ვერ დაადასტურებდა. დაჭერა
   კი ზუსტად ის გზაა, რომელიც ტელეფონზე ერთადერთია.

   ⚠️ ბიბლიოთეკა არ დამატებულა (`react-dom/client` + `act()`), ფაილი
   `.ts`-ია — `vitest.config.ts`-ის `include` უცვლელია.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function mount(props: Parameters<typeof InfoHint>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(h(InfoHint, props)))
}

const triggers = () => [...document.querySelectorAll('button')] as HTMLButtonElement[]
const body = () => document.body.textContent ?? ''

describe('InfoHint', () => {
  it('draws nothing when there is no text', () => {
    // ცარიელი ტულტიპი აიქონის უქონლობაზე უარესია (`lib/fields.ts`-ის წესი)
    mount({})
    expect(triggers()).toHaveLength(0)
  })

  it('opens on a click — the very thing Tooltip cannot do on touch', () => {
    mount({ info: 'რატომ ჩანს ეს აქ' })

    expect(body()).not.toContain('რატომ ჩანს ეს აქ')

    act(() => triggers()[0].click())
    expect(body()).toContain('რატომ ჩანს ეს აქ')
  })

  it('gives each text its own trigger and its own window', () => {
    /* „შეიძლება ორივე იყოს ერთზე და ორივეზე სხვადასხვა დამოუკიდებელი
       ინფორმაცია ისახებოდეს" — ე.ი. ორი ტრიგერი და ორი ფანჯარა, და არა
       ერთი ტულტიპი ორი აბზაცით. */
    mount({ info: 'ჩვეულებრივი ახსნა', critical: 'აქ ფრთხილად' })

    expect(triggers()).toHaveLength(2)

    act(() => triggers()[0].click())
    expect(body()).toContain('აქ ფრთხილად')
    expect(body()).not.toContain('ჩვეულებრივი ახსნა')
  })

  it('leads with the critical trigger and marks it with a different glyph', () => {
    /* ⚠️ ფერი დალტონიკს არაფერს ეუბნება — ფიგურაც უნდა განსხვავდებოდეს
       (პროექტის საკუთარი წესი როლების სამუშაოდან). lucide-ის კლასი
       **ხატულის id-ია**: `AlertTriangle` → `lucide-triangle-alert`. */
    mount({ info: 'ახსნა', critical: 'გაფრთხილება' })

    expect(triggers()[0].querySelector('.lucide-triangle-alert')).toBeTruthy()
    expect(triggers()[1].querySelector('.lucide-info')).toBeTruthy()
  })
})
