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

describe('ModalShell — ზომა და სქროლი', () => {
  function render(props: Record<string, unknown>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(h(ModalShell, { title: 't', onClose: () => {}, children: h('p', { className: 'mt-4' }, 'x'), ...props })))
    return visible()[0] as HTMLElement
  }

  it('grows with the screen: default 576 → 672, wide 1024 → 1152 → 1280', () => {
    const dialog = render({})
    expect(dialog.className).toContain('max-w-xl')
    expect(dialog.className).toContain('xl:max-w-2xl')
    act(() => root?.unmount())

    const wide = render({ wide: true })
    for (const cls of ['max-w-5xl', 'xl:max-w-6xl', '2xl:max-w-7xl']) expect(wide.className).toContain(cls)
  })

  it('is no longer centred by CSS — the top edge is placed once and stays', () => {
    const dialog = render({})
    expect(dialog.className).not.toContain('top-1/2')
    expect(dialog.className).not.toContain('-translate-y-1/2')
  })

  it('anchorTop: centred on open, then only the bottom edge moves', async () => {
    const { anchorTop } = await import('@/components/ui/modal-shell')

    // 1000 px-იანი ეკრანი: 300 px-იანი ფანჯარა გახსნისას ცენტრშია
    expect(anchorTop(null, 300, 1000)).toBe(350)
    // ჩანართი გაიზარდა 500-მდე — ზედა კიდე იგივეა
    expect(anchorTop(350, 500, 1000)).toBe(350)
    // 800-მდე — ქვემოთ აღარ ეტევა: მაღლა მხოლოდ საჭირო ოდენობით (ქვედა კიდე 950-ზე)
    expect(anchorTop(350, 800, 1000)).toBe(150)
    // ისევ დაპატარავდა — ზედა კიდე არ ბრუნდება ცენტრში
    expect(anchorTop(150, 300, 1000)).toBe(150)
    // 5vh-ზე მაღლა არასდროს
    expect(anchorTop(null, 900, 1000)).toBe(50)
  })

  it('scrolls the body with a stable scrollbar gutter and a margin-safe inner box', () => {
    const dialog = render({})
    const body = dialog.querySelector('.fb-modal-body') as HTMLElement
    expect(body.className).toContain('overflow-y-auto')
    expect((body.firstElementChild as HTMLElement).className).toContain('flow-root')
    expect((body.firstElementChild as HTMLElement).className).toContain('fb-modal-pad')
  })

  it('fill — a fixed 90vh window whose body is a flex column (discover)', () => {
    const dialog = render({ wide: true, fill: true })
    expect(dialog.className).toContain('h-[90vh]')
    expect(dialog.querySelector('.fb-modal-body')).toBeNull()
    expect(dialog.querySelector('.fb-modal-pad')?.className).toContain('flex-col')
  })
})

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
