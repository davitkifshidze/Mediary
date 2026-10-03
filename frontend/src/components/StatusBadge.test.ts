import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Status } from '@/api/types'

/* ============================================================
   **სტატუსის ბეჯი — აიქონი და საკუთარი ფერი** (Tasks §16.3/§16.4).

   მოწმდება: ფერის გარეშე როლის კლასი რჩება და inline სტილი არ არის;
   `color`-ზე ფონი `color-mix`-ითაა და ტექსტი ფერადი; აიქონი სახელის წინ
   იხატება; `trailing` ბოლოშია (ჩამოსაშლელის ისარი); enum-ბეჯს თავისი აიქონი
   აქვს; `StatusLabel` აიქონს ფერით ხატავს ფონის გარეშე.
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

const status = (over: Partial<Status> = {}): Status => ({
  id: 1,
  key: 'archived',
  module: 'bookmark',
  name_ka: 'არქივი',
  name_en: 'Archived',
  role: 'done',
  icon: 'Archive',
  color: null,
  is_default: false,
  sort_order: 3,
  ...over,
})

async function mount(node: ReturnType<typeof h>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
  return container
}

describe('StatusBadge', () => {
  it('keeps the role classes without a colour and paints the own colour inline', async () => {
    const { StatusBadge } = await import('@/components/StatusBadge')
    const el = await mount(h('div', null, h(StatusBadge, { status: status() }), h(StatusBadge, { status: status({ id: 2, color: 'c12' }) })))

    const [plain, coloured] = [...el.querySelectorAll<HTMLElement>('span.inline-flex.rounded-md')]
    expect(plain.className).toContain('bg-status-watched/15')
    expect(plain.getAttribute('style')).toBeNull()
    expect(plain.querySelector('svg')).toBeTruthy()
    expect(plain.textContent).toContain('არქივი')

    expect(coloured.style.backgroundColor).toContain('color-mix')
    expect(coloured.style.backgroundColor).toContain('--status-c12')
    expect(coloured.style.color).toBe('var(--status-c12)')
  })

  it('places the trailing node after the name', async () => {
    const { StatusBadge } = await import('@/components/StatusBadge')
    const el = await mount(h(StatusBadge, { status: status(), size: 'row', className: 'min-w-36 justify-between', trailing: h('i', { 'data-testid': 'chevron' }) }))

    const badge = el.querySelector('span.inline-flex')!
    expect(badge.className).toContain('h-9')
    expect(badge.className).toContain('min-w-36')
    expect(badge.lastElementChild?.getAttribute('data-testid')).toBe('chevron')
  })

  it('enum badges carry their own icon and the label draws a coloured icon without a background', async () => {
    const { EnumStatusBadge, StatusLabel } = await import('@/components/StatusBadge')
    const el = await mount(h('div', null, h(EnumStatusBadge, { domain: 'book', status: 'reading' }), h(StatusLabel, { status: status({ color: '#aa0000' }) })))

    const enumBadge = el.querySelector('span.rounded-md')!
    expect(enumBadge.querySelector('svg')).toBeTruthy()
    expect(enumBadge.className).toContain('bg-status-watching/15')

    const label = el.querySelectorAll('span.inline-flex')[1]
    expect(label.className).not.toContain('bg-')
    expect(label.querySelector('svg')?.getAttribute('style')).toContain('rgb(170, 0, 0)')
  })
})
