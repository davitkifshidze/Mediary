import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **რჩეული — ერთი ღილაკი ყველგან** (Tasks §8).

   ⚠️ მოწმდება: ტექსტი „რჩეული" ყოველთვის ჩანს, ჩართულზე `--favorite` ფერის
   კლასები და შევსებული ვარსკვლავია, `aria-pressed` მდგომარეობას ამბობს,
   დაჭერა `onToggle`-ს უშვებს, `pending` ღილაკს თიშავს.
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

async function render(props: Record<string, unknown>) {
  const { FavoriteButton } = await import('@/components/ui/favorite-button')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(FavoriteButton, props as Parameters<typeof FavoriteButton>[0])))
  return container.querySelector('button')!
}

describe('FavoriteButton', () => {
  it('shows the label with the icon and reflects the active state', async () => {
    const off = await render({ active: false, onToggle: () => {} })
    expect(off.textContent).toContain(i18n.t('filter.favorite'))
    expect(off.getAttribute('aria-pressed')).toBe('false')
    expect(off.getAttribute('aria-label')).toBe(i18n.t('actions.favorite'))
    // გამორთულზე ფონი არ არის (ჰოვერის კლასი `hover:text-favorite` რჩება)
    expect(off.className).not.toContain('bg-favorite/10')

    act(() => root?.unmount())
    container?.remove()

    const on = await render({ active: true, onToggle: () => {} })
    expect(on.getAttribute('aria-pressed')).toBe('true')
    expect(on.getAttribute('aria-label')).toBe(i18n.t('actions.unfavorite'))
    expect(on.className).toContain('bg-favorite/10')
    expect(on.querySelector('svg')?.getAttribute('class')).toContain('fill-current')
  })

  it('toggles on click and is disabled while pending', async () => {
    const onToggle = vi.fn()
    const button = await render({ active: false, onToggle })

    await act(async () => button.click())
    expect(onToggle).toHaveBeenCalledTimes(1)

    act(() => root?.unmount())
    container?.remove()

    const pending = await render({ active: false, onToggle, pending: true })
    expect(pending.disabled).toBe(true)
  })

  it('the xs size is lower than the row size', async () => {
    const sm = await render({ active: false, onToggle: () => {} })
    expect(sm.className).toContain('h-9')

    act(() => root?.unmount())
    container?.remove()

    const xs = await render({ active: false, onToggle: () => {}, size: 'xs' })
    expect(xs.className).toContain('h-7')
  })
})
