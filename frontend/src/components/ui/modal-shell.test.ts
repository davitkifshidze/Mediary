import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ModalShell } from '@/components/ui/modal-shell'
import '@/i18n'

/* ============================================================
   რეგრესია: **ერთდროულად მხოლოდ ერთი მოდალი ჩანს** (შენი მითითება,
   2026-09-14: „თუ ახალი მოდალი იხსნება, წინა იხურება და ახალი გამოდის;
   თუ იმას დახურავ ან უკან გახვალ, ეს ახალი იხურება და ძველი იხსნება").

   ⚠️ ამას **ვერც `tsc` ხედავს და ვერც lint**: ორივე მოდალი სრულიად
   ვალიდური JSX-ია — ხარვეზი მხოლოდ ეკრანზეა („პატარა ფანჯარა დიდზე
   ზემოდან"). ერთადერთი, რაც ამას იჭერს, კომპონენტის ნამდვილი მიმაგრებაა.

   ⚠️ ასევე პინდება ის, რომ **ქვედა მოდალის კომპონენტი არ ითიშება** —
   მისი state უცვლელი რჩება და უკან დაბრუნებისას ადგილზეა. სწორედ ამ
   თვისებისთვის შემოვიდა ეს წესი შეხსენებებზე.

   ⚠️ ბიბლიოთეკა არ დამატებულა (`react-dom/client` + `act()`), ფაილი `.ts`-ია
   — `vitest.config.ts`-ის `include` უცვლელია.
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

/** ორი ჩადგმული მოდალი: გარეთა მუდმივად, შიგნითა — ღილაკზე */
function Nested() {
  const [inner, setInner] = useState(false)
  const [typed, setTyped] = useState('')

  /* ⚠️ `children` **props-შია და არა ვარიანტდად**: `createElement`-ის ვარიანტულ
     ფორმას TS ანაზღავრების `children`-ში არ აბრუნებს და `npm run build` ვარდება. */
  return h(ModalShell, {
    title: 'outer',
    onClose: () => {},
    children: [
      h('input', {
        key: 'field',
        'data-testid': 'field',
        value: typed,
        onChange: (e: { target: { value: string } }) => setTyped(e.target.value),
      }),
      h('button', { key: 'open', 'data-testid': 'open', onClick: () => setInner(true), children: 'open' }),
      // ქვედა კომპონენტი მონტირებული რჩება — მისი state-ის დასამტკიცებლად
      h('span', { key: 'kept', 'data-testid': 'kept', children: typed }),
      inner
        ? h(ModalShell, { key: 'inner', title: 'inner', onClose: () => setInner(false), children: 'body' })
        : null,
    ],
  })
}

function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(h(Nested)))
}

/**
 * ⚠️ **დათვლილია ხილული მოდალები და არა DOM-ში არსებული.** ქვედა
 * მოდალი განზრახ რჩება მონტირებული (ფორმის state-ისთვის) — ის CSS-ით
 * იმალება, ე.ი. ტესტი იმას ამოწმებს, რაც ეკრანზე ჩანს.
 */
const visible = () => [...document.querySelectorAll('[role="dialog"]')].filter((el) => !el.classList.contains('hidden'))

const titles = () => visible().map((el) => el.textContent).filter(Boolean)

const dialogs = visible

describe('ModalShell — მოდალების დასტა', () => {
  it('ერთი მოდალი იხატება ჩვეულებრივ', () => {
    mount()
    expect(dialogs()).toHaveLength(1)
    expect(titles().join(' ')).toContain('outer')
  })

  it('ჩადგმული მოდალი წინას ცვლის და არა ედება ზემოდან', () => {
    mount()

    act(() => {
      ;(document.querySelector('[data-testid="open"]') as HTMLButtonElement).click()
    })

    // ⚠️ ზუსტად ერთი — ეს არის ხარვეზი, რომელსაც ეს ტესტი იჭერს
    expect(dialogs()).toHaveLength(1)
    expect(titles().join(' ')).toContain('inner')
    expect(titles().join(' ')).not.toContain('outer')
  })

  it('ჩადგმულის დახურვა წინას აბრუნებს და state-ს ინახავს', () => {
    mount()

    // ველი შეივსო, სანამ მეორე მოდალი გაიხსნებოდა
    const field = document.querySelector('[data-testid="field"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(field, 'შენახული')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })

    act(() => {
      ;(document.querySelector('[data-testid="open"]') as HTMLButtonElement).click()
    })
    expect(titles().join(' ')).toContain('inner')

    /* ჩადგმულის დახურვა — ქვედა უნდა დაბრუნდეს **შევსებული ველით**.
       ⚠️ ჯვარი **ხილული** დიალოგიდან იწერება: დამალულიც DOM-შია
       და სელექტორი სხვაგვარად **გარეთას** აიღებდა. */
    act(() => {
      ;(visible()[0].querySelector('[aria-label]') as HTMLButtonElement)?.click()
    })

    expect(dialogs()).toHaveLength(1)
    expect(titles().join(' ')).toContain('outer')
    expect(document.querySelector('[data-testid="kept"]')?.textContent).toBe('შენახული')
  })
})
