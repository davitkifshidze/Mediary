import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'
import type { Status } from '@/api/types'
import { TooltipProvider } from '@/components/ui/tooltip'

/* ============================================================
   **სტატუსის ჩამოსაშლელი სტრიქონში — ერთი სიგანე მოდულის ყველა სტატუსზე.**

   ⚠️ `min-w-36` მხოლოდ მინიმუმი იყო: გრძელი სახელი ღილაკს აფართოებდა, მოკლე —
   არა, ე.ი. ერთ სიაში ღილაკები სხვადასხვა სიგანისა იყო. ახლა ყოველ ღილაკში
   მოდულის **ყველა** სტატუსის სახელის უხილავი ასლი დგას და სიგანეს მათგან
   ყველაზე ფართო ადგენს — ამიტომ მოწმდება, რომ ასლების ნაკრები ერთი და იგივეა,
   რომელი სტატუსიც არ უნდა ეწეროს, და რომ ასლი ღილაკის ტექსტში არ ჩანს.
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

const status = (id: number, name: string): Status => ({
  id,
  key: `s${id}`,
  module: 'movie',
  name_ka: name,
  name_en: name,
  role: 'todo',
  icon: 'Circle',
  color: 'c3',
  is_default: false,
  sort_order: id,
})

const STATUSES = [status(1, 'ნანახი'), status(2, 'გადაუწყვეტელი'), status(3, 'ვუყურებ')]

async function mount(node: ReturnType<typeof h>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(TooltipProvider, null, node)))
  return container
}

/** ღილაკის სიგანის დამდგენი ასლები — სახელები `data-label`-შია */
const ghosts = (button: Element) =>
  [...button.querySelectorAll('[data-status-sizer] [data-label]')].map((x) => x.getAttribute('data-label'))

describe('DictionaryStatusMenu', () => {
  it('sizes every row by all of the module statuses, whichever one it shows', async () => {
    const { DictionaryStatusMenu } = await import('@/components/StatusMenu')
    const row = (current: Status | null) =>
      h(DictionaryStatusMenu, { status: current, statuses: STATUSES, label: 'სტატუსი', emptyLabel: 'სტატუსის გარეშე', onChange: () => {} })

    const el = await mount(h('div', null, row(STATUSES[0]), row(STATUSES[1]), row(null)))
    const buttons = [...el.querySelectorAll('[data-status-menu]')]

    expect(buttons).toHaveLength(3)
    // სამივე სტრიქონს ერთი და იგივე ასლები აქვს — ე.ი. ერთი სიგანე; უსტატუსოს წარწერაც ითვლება
    const expected = ['ნანახი', 'გადაუწყვეტელი', 'ვუყურებ', 'სტატუსის გარეშე']
    for (const button of buttons) expect(ghosts(button)).toEqual(expected)
  })

  it('keeps the copies out of the button text and out of the accessibility tree', async () => {
    const { DictionaryStatusMenu } = await import('@/components/StatusMenu')
    const el = await mount(
      h(DictionaryStatusMenu, { status: STATUSES[0], statuses: STATUSES, label: 'სტატუსი', emptyLabel: 'სტატუსის გარეშე', onChange: () => {} }),
    )
    const button = el.querySelector('[data-status-menu]')!

    // ტექსტი მხოლოდ ახლანდელი სტატუსია — ასლის სახელი CSS-ით იხატება და არა DOM-ის ტექსტით
    expect(button.textContent).toBe('ნანახი')
    for (const copy of button.querySelectorAll('[data-label]')) {
      expect(copy.closest('[aria-hidden="true"]')).not.toBeNull()
      expect(copy.closest('[aria-hidden="true"]')!.className).toContain('h-0')
    }
  })

  it('fills the shared width, stays h-9 and never wraps', async () => {
    const { DictionaryStatusMenu } = await import('@/components/StatusMenu')
    const el = await mount(
      h(DictionaryStatusMenu, { status: STATUSES[1], statuses: STATUSES, label: 'სტატუსი', emptyLabel: 'სტატუსის გარეშე', onChange: () => {} }),
    )
    const badge = [...el.querySelectorAll<HTMLElement>('[data-status-menu] span.inline-flex')].find((x) => !x.closest('[aria-hidden]'))!

    expect(badge.className).toContain('h-9')
    expect(badge.className).toContain('w-full')
    expect(badge.className).toContain('whitespace-nowrap')
    expect(badge.className).not.toContain('min-w-36')
  })
})

describe('EnumStatusMenu', () => {
  it('sizes by every option of the enum as well', async () => {
    const { EnumStatusMenu } = await import('@/components/StatusMenu')
    const options = ['to_read', 'reading', 'read', 'abandoned'] as const
    const el = await mount(h(EnumStatusMenu, { domain: 'book', value: 'reading', options, label: 'სტატუსი', onChange: () => {} }))
    const button = el.querySelector('[data-status-menu]')!

    expect(ghosts(button)).toEqual(options.map((s) => i18n.t(`books.statuses.${s}`)))
    expect(button.textContent).toBe(i18n.t('books.statuses.reading'))
  })
})
