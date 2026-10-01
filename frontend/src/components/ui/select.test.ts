import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **ჩამოსაშლელი სია ტრიგერის სიგანისაა** (Tasks §38).

   ⚠️ jsdom-ს განლაგება არ აქვს — სიგანეს ვერ გავზომავთ. ამიტომ აქ ის ორი
   რამ მოწმდება, რაზეც სიგანე დგას: (1) სიის ქვედა ზღვარი ტრიგერია და არა
   ფიქსირებული 128px (ხარვეზის მიზეზი სწორედ `min-w-32` იყო), შიგთავსი კი
   მთელ სიგანეს ავსებს; (2) `NumberPick`-ის ტრიგერში სიის **ყველა**
   ვარიანტის უხილავი ასლი ზის — ერთი გამორჩენილიც საკმარისია, რომ სია ისევ
   ტრიგერზე განიერი გახდეს. ორივე ძველ კოდზე წითლდება.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
// Radix Select მონიშნულ რიგს ეკრანზე აბრუნებს — jsdom-ს ეს მეთოდი არ აქვს
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(node: ReturnType<typeof h>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
  await flush()
}

const trigger = () => document.querySelector<HTMLButtonElement>('#s')!

async function open() {
  await act(async () => {
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await flush()
}

const clean = (el: Element) => (el.textContent ?? '').trim()
const options = () => [...document.querySelectorAll('[role="option"]')].map(clean)
/** ტრიგერის უხილავი წარწერები — ისრის `<svg>`-საც `aria-hidden` აქვს, ამიტომ მხოლოდ `span` */
const sizers = () => [...trigger().querySelectorAll<HTMLElement>('span[aria-hidden="true"]')]

describe('SelectContent', () => {
  it('takes its minimum width from the trigger and fills it — never a fixed 128px', async () => {
    const { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } = await import('@/components/ui/select')
    await render(
      h(
        Select,
        { defaultValue: 'a' },
        h(SelectTrigger, { id: 's', className: 'w-24' }, h(SelectValue)),
        h(SelectContent, null, h(SelectItem, { value: 'a' }, 'A'), h(SelectItem, { value: 'b' }, 'B')),
      ),
    )
    await open()

    const list = document.querySelector<HTMLElement>('[role="listbox"]')!
    const classes = list.className.split(/\s+/)
    expect(classes).toContain('min-w-[var(--radix-select-trigger-width)]')
    expect(classes).not.toContain('min-w-32')

    // ⚠️ ძველი კლასი აქ სიტყვასიტყვით არ წერია — Tailwind წყაროს ტექსტს კითხულობს
    // და ტესტიდანაც გამოუყენებელ CSS-ს ააწყობდა
    const inside = document.querySelector<HTMLElement>('[data-radix-select-viewport]')!.className.split(/\s+/)
    expect(inside).toContain('w-full')
    expect(inside.filter((c) => c.includes('trigger-width'))).toEqual([])
  })
})

describe('NumberPick', () => {
  async function mountPick() {
    const { NumberPick } = await import('@/components/ui/number-pick')
    function Harness() {
      const [value, setValue] = useState(20)
      return h(NumberPick, {
        id: 's',
        value,
        onChange: setValue,
        options: [10, 20, 30, 40, 50],
        allowNone: true,
        noneLabel: i18n.t('photos.showAll'),
        noneLast: true,
        size: 'sm',
      })
    }
    await render(h(Harness))
  }

  it('the trigger holds an invisible copy of every option, so it is as wide as the longest one', async () => {
    await mountPick()

    expect(sizers().map(clean)).toEqual(['10', '20', '30', '40', '50', i18n.t('photos.showAll'), i18n.t('numberPick.other')])
    for (const label of sizers()) {
      // `font-medium` — სიაში მონიშნული ვარიანტი მუქია და ოდნავ განიერი
      expect(label.className.split(/\s+/)).toEqual(expect.arrayContaining(['invisible', 'font-medium']))
    }

    // ზემოდან მხოლოდ არჩეული ჩანს
    const visible = trigger().firstElementChild!.firstElementChild!
    expect(visible.getAttribute('aria-hidden')).toBeNull()
    expect(clean(visible)).toBe('20')
  })

  it('the copies are exactly the list that opens — none missing, none extra', async () => {
    await mountPick()
    const copies = sizers().map(clean)

    await open()
    expect(options()).toEqual(copies)
  })
})
